"""
audit.py
---------
Backs the "Qué pasó con mi dinero" (elder-friendly) and the family member's
full audit trail. Both read from the same audit_log + transactions tables --
the elder view just gets fewer, softer-worded fields from the frontend.
"""

import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from ..database import db_cursor

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def get_audit_trail(user_id: str):
    """
    LEFT JOIN on purpose: an audit_log row from a transaction decision has a
    transaction_id and picks up merchant/category/amount from it, but a row
    from the Intent Engine (revoking a permission, adding someone to the
    trust network, configuring continuity...) has transaction_id = NULL --
    an INNER JOIN would silently drop every one of those rows. `kind` tells
    the frontend which of the two it's looking at.
    """
    with db_cursor() as cur:
        rows = cur.execute(
            "SELECT a.id, a.action, a.reasons, a.timestamp, a.transaction_id, t.merchant, t.category, t.amount "
            "FROM audit_log a LEFT JOIN transactions t ON t.id = a.transaction_id "
            "WHERE a.user_id = ? ORDER BY a.timestamp DESC",
            (user_id,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["reasons"] = json.loads(d["reasons"])
        d["kind"] = "transaction" if d["transaction_id"] else "account_change"
        out.append(d)
    return out


@router.get("/alerts")
def get_alerts(user_id: str, unresolved_only: bool = True):
    query = (
        "SELECT al.*, t.merchant, t.category, t.amount FROM alerts al "
        "JOIN transactions t ON t.id = al.transaction_id WHERE al.user_id = ?"
    )
    params = [user_id]
    if unresolved_only:
        query += " AND al.resolved = 0"
    query += " ORDER BY al.created_at DESC"
    with db_cursor() as cur:
        rows = cur.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, approved_by: str, decision: str):
    if decision not in ("approved", "denied"):
        raise HTTPException(400, "decision debe ser 'approved' o 'denied'")
    with db_cursor(commit=True) as cur:
        alert = cur.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
        if not alert:
            raise HTTPException(404, "Alerta no encontrada")
        cur.execute("UPDATE alerts SET resolved = 1 WHERE id = ?", (alert_id,))
        cur.execute(
            "INSERT INTO approvals (id, alert_id, approved_by, decision, timestamp) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), alert_id, approved_by, decision, datetime.utcnow().isoformat()),
        )
    return {"ok": True}
