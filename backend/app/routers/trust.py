"""
trust.py
---------
The Trust Network is deliberately separate from Missions: being "trusted"
(appearing here) does not by itself grant any spending power. A trust
network member only gets real permissions once a Mission names them as the
delegate. This split is what lets Carlos be "trusted enough to review
alerts" without ever being able to spend a peso.

Adding or removing someone here is an ACCOUNT OWNER decision -- the elder
frontend is the only place that calls these with intent to change anything
(directly, or via the Intent Engine in routers/intent.py, which reuses the
exact same functions below). The family-facing UI only ever reads this list.
"""

import uuid
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import TrustMemberRequest

router = APIRouter(prefix="/api/trust-network", tags=["trust-network"])


def add_trust_member_row(cur, user_id: str, name: str, relationship: str, role: str,
                          can_pay_bills: bool, can_review_alerts: bool) -> tuple[str, str]:
    """Shared by POST /api/trust-network and the Intent Engine's
    ADD_TRUSTED_PERSON execution. Caller commits."""
    member_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO family_members (id, user_id, name, relationship) VALUES (?,?,?,?)",
        (member_id, user_id, name, relationship),
    )
    trust_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO trust_network (id, user_id, member_id, role, can_pay_bills, "
        "can_review_alerts, can_change_beneficiaries) VALUES (?,?,?,?,?,?,0)",
        (trust_id, user_id, member_id, role, int(can_pay_bills), int(can_review_alerts)),
    )
    return trust_id, member_id


def remove_trust_member_row(cur, user_id: str, trust_id: str):
    """
    Removes someone from the trust network AND ends, early, any mission
    currently delegated to them -- being removed from the trust network
    with an active mission still running would be a contradiction the
    product can't allow. The family_members row itself is kept (audit_log
    and past transactions still reference it by id).
    """
    trust_row = cur.execute("SELECT * FROM trust_network WHERE id = ? AND user_id = ?", (trust_id, user_id)).fetchone()
    if not trust_row:
        return None
    cur.execute(
        "UPDATE missions SET status = 'ended_early' WHERE owner_id = ? AND delegate_id = ? AND status = 'active'",
        (user_id, trust_row["member_id"]),
    )
    cur.execute("DELETE FROM trust_network WHERE id = ?", (trust_id,))
    return trust_row


@router.get("")
def list_trust_network(user_id: str):
    with db_cursor() as cur:
        rows = cur.execute(
            "SELECT t.id, t.role, t.can_pay_bills, t.can_review_alerts, t.can_change_beneficiaries, "
            "f.id as member_id, f.name, f.relationship FROM trust_network t "
            "JOIN family_members f ON f.id = t.member_id WHERE t.user_id = ?",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("")
def add_trust_member(body: TrustMemberRequest):
    with db_cursor(commit=True) as cur:
        trust_id, member_id = add_trust_member_row(
            cur, body.user_id, body.name, body.relationship, body.role, body.can_pay_bills, body.can_review_alerts
        )
    return {"id": trust_id, "member_id": member_id}


@router.delete("/{trust_id}")
def remove_trust_member(trust_id: str, user_id: str):
    with db_cursor(commit=True) as cur:
        removed = remove_trust_member_row(cur, user_id, trust_id)
    if not removed:
        raise HTTPException(404, "No se encontró a esa persona en la red de confianza")
    return {"ok": True}
