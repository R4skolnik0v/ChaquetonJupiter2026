"""
transactions.py
-----------------
GET /api/transactions        -> history, already decided (used by both modes)
POST /api/transactions/simulate -> "a new transaction just arrived from
                                     Nessie" -- runs it through the full
                                     pipeline live. This is the endpoint the
                                     demo's "Simular siguiente transacción"
                                     button calls, so judges can watch the
                                     Transaction -> Decision Engine -> Audit
                                     Log chain happen in real time.
"""

import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import SimulateTransactionRequest
from ..engines.behavior_baseline import build_baseline
from ..engines.decision_engine import evaluate_transaction, NON_DELEGABLE_ACTIONS

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
def list_transactions(user_id: str, mission_id: str | None = None):
    query = "SELECT * FROM transactions WHERE user_id = ? AND status != 'SCHEDULED'"
    params = [user_id]
    if mission_id:
        query += " AND mission_id = ?"
        params.append(mission_id)
    query += " ORDER BY timestamp DESC"
    with db_cursor() as cur:
        rows = cur.execute(query, params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["reasons"] = json.loads(d["reasons"])
        d["exception_eligible"] = bool(d.get("exception_eligible"))
        out.append(d)
    return out


def _active_mission_for(cur, user_id: str, mission_id: str | None):
    if mission_id:
        m = cur.execute("SELECT * FROM missions WHERE id = ?", (mission_id,)).fetchone()
    else:
        m = cur.execute(
            "SELECT * FROM missions WHERE owner_id = ? AND status = 'active' "
            "ORDER BY start_date DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    return m


@router.post("/simulate")
def simulate_transaction(body: SimulateTransactionRequest):
    with db_cursor() as cur:
        user = cur.execute("SELECT * FROM users WHERE id = ?", (body.user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "Usuario no encontrado")

        mission_row = _active_mission_for(cur, body.user_id, body.mission_id)
        mission_dict = None
        forbidden_actions = set()
        if mission_row:
            perms = cur.execute(
                "SELECT action, allowed FROM permissions WHERE mission_id = ?", (mission_row["id"],)
            ).fetchall()
            forbidden_actions = {p["action"] for p in perms if not p["allowed"]}
            mission_dict = {
                "id": mission_row["id"],
                "allowed_categories": json.loads(mission_row["allowed_categories"]),
                "monthly_limit": mission_row["monthly_limit"],
                "per_transaction_limit": mission_row["per_transaction_limit"],
                "start_date": mission_row["start_date"],
                "end_date": mission_row["end_date"],
            }

        this_month = datetime.utcnow().strftime("%Y-%m")
        month_spent = 0.0
        if mission_dict:
            month_spent = cur.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
                "WHERE mission_id = ? AND status != 'BLOCKED' AND status != 'SCHEDULED' "
                "AND strftime('%Y-%m', timestamp) = ?",
                (mission_dict["id"], this_month),
            ).fetchone()["total"]

        history_rows = cur.execute(
            "SELECT category, amount, timestamp FROM transactions "
            "WHERE user_id = ? AND category = ? AND status != 'SCHEDULED' "
            "ORDER BY timestamp DESC LIMIT 12",
            (body.user_id, body.category),
        ).fetchall()
        baseline = build_baseline([dict(r) for r in history_rows], body.category)
        recent_amounts = [r["amount"] for r in reversed(history_rows)][-5:]

    decision = evaluate_transaction(
        category=body.category,
        amount=body.amount,
        mission=mission_dict,
        forbidden_actions=forbidden_actions,
        month_spent_in_mission=month_spent,
        baseline=baseline,
        recent_amounts_in_category=recent_amounts,
    )

    tx_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
            "timestamp, status, reasons, exception_eligible) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                tx_id, body.user_id, mission_dict["id"] if mission_dict else None,
                body.merchant, body.category, body.amount, now,
                decision.status, json.dumps(decision.reasons), int(decision.exception_eligible),
            ),
        )
        cur.execute(
            "INSERT INTO audit_log (id, user_id, transaction_id, action, reasons, timestamp) "
            "VALUES (?,?,?,?,?,?)",
            (str(uuid.uuid4()), body.user_id, tx_id, decision.status, json.dumps(decision.reasons), now),
        )
        if decision.status in ("REVIEW", "BLOCKED"):
            alert_type = "boundary" if decision.status == "REVIEW" and not decision.comparison else "anomaly"
            if decision.status == "BLOCKED":
                alert_type = "blocked_attempt"
            message = decision.reasons[-1] if decision.reasons else "Requiere atención"
            cur.execute(
                "INSERT INTO alerts (id, user_id, transaction_id, type, message, created_at, resolved) "
                "VALUES (?,?,?,?,?,?,0)",
                (str(uuid.uuid4()), body.user_id, tx_id, alert_type, message, now),
            )

    return {
        "id": tx_id,
        "mission_id": mission_dict["id"] if mission_dict else None,
        "merchant": body.merchant,
        "category": body.category,
        "amount": body.amount,
        "timestamp": now,
        "status": decision.status,
        "reasons": decision.reasons,
        "comparison": decision.comparison,
        "exception_eligible": decision.exception_eligible,
    }
