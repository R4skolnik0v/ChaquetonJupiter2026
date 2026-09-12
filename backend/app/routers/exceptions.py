"""
routers/exceptions.py
------------------------
When a transaction is BLOCKED purely because it exceeds a spending cap
(see Decision.exception_eligible in engines/decision_engine.py), the family
member can ask the account owner to allow it just this once. The engine
itself never grants this -- only a human, and only through this endpoint.

Non-delegable actions (transfers, withdrawals, beneficiary/loan changes)
can NEVER be requested as an exception, even by the account owner. That
restriction is enforced here again, on purpose: the guarantee has to hold
no matter which code path a request comes through.
"""

import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import ExceptionRequestCreate, ExceptionResolveRequest
from ..engines.decision_engine import NON_DELEGABLE_ACTIONS

router = APIRouter(prefix="/api/exceptions", tags=["exceptions"])


@router.post("")
def create_exception_request(body: ExceptionRequestCreate):
    if body.category in NON_DELEGABLE_ACTIONS:
        raise HTTPException(400, f"'{body.category}' nunca se puede autorizar por excepción, bajo ninguna circunstancia.")
    with db_cursor(commit=True) as cur:
        mission = cur.execute("SELECT * FROM missions WHERE id = ?", (body.mission_id,)).fetchone()
        if not mission:
            raise HTTPException(404, "Misión no encontrada")
        request_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO exception_requests (id, user_id, mission_id, merchant, category, amount, "
            "requested_by, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                request_id, body.user_id, body.mission_id, body.merchant, body.category, body.amount,
                body.requested_by, "pending", datetime.utcnow().isoformat(),
            ),
        )
    return {"id": request_id, "status": "pending"}


@router.get("")
def list_exception_requests(user_id: str, status: str | None = None):
    query = "SELECT * FROM exception_requests WHERE user_id = ?"
    params = [user_id]
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    with db_cursor() as cur:
        rows = cur.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.post("/{request_id}/resolve")
def resolve_exception_request(request_id: str, body: ExceptionResolveRequest):
    if body.decision not in ("approved", "denied"):
        raise HTTPException(400, "decision debe ser 'approved' o 'denied'")

    with db_cursor() as cur:
        req = cur.execute("SELECT * FROM exception_requests WHERE id = ?", (request_id,)).fetchone()
        if not req:
            raise HTTPException(404, "Solicitud no encontrada")
        if req["status"] != "pending":
            raise HTTPException(400, "Esta solicitud ya fue resuelta")

    now = datetime.utcnow().isoformat()
    tx_id = None
    with db_cursor(commit=True) as cur:
        if body.decision == "approved":
            tx_id = str(uuid.uuid4())
            reasons = [
                f"Excede el límite autorizado, pero {body.resolved_by} lo aprobó como excepción única.",
                "Esta aprobación no cambia el límite de la misión -- solo autoriza este pago.",
            ]
            cur.execute(
                "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
                "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
                (tx_id, req["user_id"], req["mission_id"], req["merchant"], req["category"], req["amount"],
                 now, "APPROVED", json.dumps(reasons)),
            )
            cur.execute(
                "INSERT INTO audit_log (id, user_id, transaction_id, action, reasons, timestamp) VALUES (?,?,?,?,?,?)",
                (str(uuid.uuid4()), req["user_id"], tx_id, "APPROVED", json.dumps(reasons), now),
            )
        else:
            reasons = [f"{body.resolved_by} no aprobó esta excepción."]
            tx_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
                "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
                (tx_id, req["user_id"], req["mission_id"], req["merchant"], req["category"], req["amount"],
                 now, "BLOCKED", json.dumps(reasons)),
            )
            cur.execute(
                "INSERT INTO audit_log (id, user_id, transaction_id, action, reasons, timestamp) VALUES (?,?,?,?,?,?)",
                (str(uuid.uuid4()), req["user_id"], tx_id, "BLOCKED", json.dumps(reasons), now),
            )

        cur.execute(
            "UPDATE exception_requests SET status=?, resolved_at=?, resulting_transaction_id=? WHERE id=?",
            (body.decision, now, tx_id, request_id),
        )

    return {"ok": True, "status": body.decision, "transaction_id": tx_id}
