"""
trust.py
---------
The Trust Network is deliberately separate from Missions: being "trusted"
(appearing here) does not by itself grant any spending power. A trust
network member only gets real permissions once a Mission names them as the
delegate. This split is what lets Carlos be "trusted enough to review
alerts" without ever being able to spend a peso.
"""

import uuid
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import TrustMemberRequest

router = APIRouter(prefix="/api/trust-network", tags=["trust-network"])


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
        member_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO family_members (id, user_id, name, relationship) VALUES (?,?,?,?)",
            (member_id, body.user_id, body.name, body.relationship),
        )
        trust_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO trust_network (id, user_id, member_id, role, can_pay_bills, "
            "can_review_alerts, can_change_beneficiaries) VALUES (?,?,?,?,?,?,0)",
            (trust_id, body.user_id, member_id, body.role, int(body.can_pay_bills), int(body.can_review_alerts)),
        )
    return {"id": trust_id, "member_id": member_id}
