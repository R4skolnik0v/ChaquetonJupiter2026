"""
continuity.py
---------------
Financial Continuity is a mission the owner pre-writes for a future moment
they aren't present to confirm in person. Activating it does not invent a
new kind of permission -- it simply creates a normal row in `missions`
(status='active') using the rules stored in `continuity_rules`, so it goes
through the exact same Decision Engine as any other mission. Deactivating
it (or letting `days` run out) ends that mission, and everything reverts
to normal automatically.
"""

import json
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import ContinuityActivateRequest
from pydantic import BaseModel

router = APIRouter(prefix="/api/continuity", tags=["continuity"])


class ContinuityRuleRequest(BaseModel):
    user_id: str
    trigger_label: str
    delegate_name: str
    backup_name: str | None = None
    allowed_categories: list[str]
    monthly_limit: float
    days: int = 30


@router.get("/{user_id}")
def get_continuity_rule(user_id: str):
    with db_cursor() as cur:
        row = cur.execute(
            "SELECT c.*, fd.name as delegate_name, fb.name as backup_name FROM continuity_rules c "
            "JOIN family_members fd ON fd.id = c.delegate_id "
            "LEFT JOIN family_members fb ON fb.id = c.backup_id "
            "WHERE c.user_id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["allowed_categories"] = json.loads(d["allowed_categories"])
    return d


@router.post("")
def set_continuity_rule(body: ContinuityRuleRequest):
    with db_cursor() as cur:
        delegate = cur.execute(
            "SELECT * FROM family_members WHERE user_id = ? AND name = ?", (body.user_id, body.delegate_name)
        ).fetchone()
        if not delegate:
            raise HTTPException(404, f"No se encontró a {body.delegate_name}")
        backup = None
        if body.backup_name:
            backup = cur.execute(
                "SELECT * FROM family_members WHERE user_id = ? AND name = ?", (body.user_id, body.backup_name)
            ).fetchone()
        existing = cur.execute("SELECT id FROM continuity_rules WHERE user_id = ?", (body.user_id,)).fetchone()

    rule_id = existing["id"] if existing else str(uuid.uuid4())
    with db_cursor(commit=True) as cur:
        if existing:
            cur.execute(
                "UPDATE continuity_rules SET trigger_label=?, delegate_id=?, backup_id=?, "
                "allowed_categories=?, monthly_limit=?, days=? WHERE id=?",
                (
                    body.trigger_label, delegate["id"], backup["id"] if backup else None,
                    json.dumps(body.allowed_categories), body.monthly_limit, body.days, rule_id,
                ),
            )
        else:
            cur.execute(
                "INSERT INTO continuity_rules (id, user_id, trigger_label, delegate_id, backup_id, "
                "allowed_categories, monthly_limit, days, active) VALUES (?,?,?,?,?,?,?,?,0)",
                (
                    rule_id, body.user_id, body.trigger_label, delegate["id"],
                    backup["id"] if backup else None, json.dumps(body.allowed_categories),
                    body.monthly_limit, body.days,
                ),
            )
    return {"id": rule_id}


@router.post("/{user_id}/activate")
def activate_continuity(user_id: str):
    with db_cursor() as cur:
        rule = cur.execute("SELECT * FROM continuity_rules WHERE user_id = ?", (user_id,)).fetchone()
        if not rule:
            raise HTTPException(404, "No hay un plan de continuidad configurado")
        delegate = cur.execute("SELECT * FROM family_members WHERE id = ?", (rule["delegate_id"],)).fetchone()

    now = datetime.utcnow()
    end = now + timedelta(days=rule["days"])
    mission_id = str(uuid.uuid4())
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO missions (id, owner_id, delegate_id, purpose, start_date, end_date, "
            "monthly_limit, allowed_categories, status, source_text) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                mission_id, user_id, delegate["id"], rule["trigger_label"], now.isoformat(),
                end.isoformat(), rule["monthly_limit"], rule["allowed_categories"], "active",
                "Activado por Continuidad Financiera",
            ),
        )
        for category in json.loads(rule["allowed_categories"]):
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
                (str(uuid.uuid4()), mission_id, category),
            )
        cur.execute(
            "UPDATE continuity_rules SET active = 1, activated_at = ? WHERE id = ?",
            (now.isoformat(), rule["id"]),
        )
    return {"mission_id": mission_id, "active": True}


@router.post("/{user_id}/deactivate")
def deactivate_continuity(user_id: str):
    with db_cursor(commit=True) as cur:
        rule = cur.execute("SELECT * FROM continuity_rules WHERE user_id = ?", (user_id,)).fetchone()
        if not rule:
            raise HTTPException(404, "No hay un plan de continuidad configurado")
        cur.execute("UPDATE continuity_rules SET active = 0 WHERE id = ?", (rule["id"],))
        cur.execute(
            "UPDATE missions SET status = 'ended_early' WHERE owner_id = ? AND status = 'active' "
            "AND source_text = 'Activado por Continuidad Financiera'",
            (user_id,),
        )
    return {"active": False}
