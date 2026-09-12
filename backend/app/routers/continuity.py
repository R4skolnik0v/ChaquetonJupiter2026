"""
continuity.py
---------------
Financial Continuity is a mission the owner pre-writes for a future moment
they aren't present to confirm in person. Activating it does not invent a
new kind of permission -- it simply creates a normal row in `missions`
(status='active') using the rules stored in `continuity_rules`, via the
exact same create_mission() helper that every other mission goes through,
so it's evaluated by the exact same Decision Engine. Deactivating it (or
letting `days` run out) ends that mission, and everything reverts to
normal automatically.

Configuring and activating a plan are both account-owner decisions. The
family-facing UI (components/family/ContinuityPanel.jsx) only ever reads
from GET /{user_id} -- every other endpoint here is only ever called from
Elder Mode, directly or via the Intent Engine (routers/intent.py, which
reuses set_continuity_rule_row / activate_continuity_row /
deactivate_continuity_row below instead of duplicating this logic).
"""

import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from pydantic import BaseModel
from .missions import create_mission

router = APIRouter(prefix="/api/continuity", tags=["continuity"])


class ContinuityRuleRequest(BaseModel):
    user_id: str
    trigger_label: str
    delegate_name: str
    backup_name: str | None = None
    allowed_categories: list[str]
    monthly_limit: float
    days: int = 30


def set_continuity_rule_row(cur, user_id: str, trigger_label: str, delegate_name: str,
                             backup_name: str | None, allowed_categories: list[str],
                             monthly_limit: float, days: int) -> str:
    delegate = cur.execute("SELECT * FROM family_members WHERE user_id = ? AND name = ?", (user_id, delegate_name)).fetchone()
    if not delegate:
        raise HTTPException(404, f"No se encontró a {delegate_name}")
    backup = None
    if backup_name:
        backup = cur.execute("SELECT * FROM family_members WHERE user_id = ? AND name = ?", (user_id, backup_name)).fetchone()
    existing = cur.execute("SELECT id FROM continuity_rules WHERE user_id = ?", (user_id,)).fetchone()
    rule_id = existing["id"] if existing else str(uuid.uuid4())
    if existing:
        cur.execute(
            "UPDATE continuity_rules SET trigger_label=?, delegate_id=?, backup_id=?, "
            "allowed_categories=?, monthly_limit=?, days=? WHERE id=?",
            (trigger_label, delegate["id"], backup["id"] if backup else None,
             json.dumps(allowed_categories), monthly_limit, days, rule_id),
        )
    else:
        cur.execute(
            "INSERT INTO continuity_rules (id, user_id, trigger_label, delegate_id, backup_id, "
            "allowed_categories, monthly_limit, days, active) VALUES (?,?,?,?,?,?,?,?,0)",
            (rule_id, user_id, trigger_label, delegate["id"], backup["id"] if backup else None,
             json.dumps(allowed_categories), monthly_limit, days),
        )
    return rule_id


def activate_continuity_row(cur, user_id: str) -> str:
    rule = cur.execute("SELECT * FROM continuity_rules WHERE user_id = ?", (user_id,)).fetchone()
    if not rule:
        raise HTTPException(404, "No hay un plan de continuidad configurado")
    delegate = cur.execute("SELECT * FROM family_members WHERE id = ?", (rule["delegate_id"],)).fetchone()
    mission_id = create_mission(
        cur, user_id, delegate["id"], rule["trigger_label"], rule["days"],
        rule["monthly_limit"], None, json.loads(rule["allowed_categories"]),
        "Activado por Continuidad Financiera",
    )
    cur.execute("UPDATE continuity_rules SET active = 1, activated_at = ? WHERE id = ?",
                (datetime.utcnow().isoformat(), rule["id"]))
    return mission_id


def deactivate_continuity_row(cur, user_id: str):
    rule = cur.execute("SELECT * FROM continuity_rules WHERE user_id = ?", (user_id,)).fetchone()
    if not rule:
        raise HTTPException(404, "No hay un plan de continuidad configurado")
    cur.execute("UPDATE continuity_rules SET active = 0 WHERE id = ?", (rule["id"],))
    cur.execute(
        "UPDATE missions SET status = 'ended_early' WHERE owner_id = ? AND status = 'active' "
        "AND source_text = 'Activado por Continuidad Financiera'",
        (user_id,),
    )


@router.get("/{user_id}")
def get_continuity_rule(user_id: str):
    """
    Returns null if nothing has ever been configured (the frontend must not
    confuse this with "still loading" -- that bug is exactly why this
    endpoint also returns an explicit `status` field instead of making the
    frontend infer it):

      no_configurado -> row doesn't exist yet
      configurado    -> row exists, dormant (active=0, never triggered, or
                        was triggered and later expired/deactivated)
      activo         -> currently in effect (active=1 and its mission
                        hasn't passed its end_date)
      expirado       -> was activated, but its mission's end_date has passed
    """
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

        status = "configurado"
        if d["active"]:
            mission = cur.execute(
                "SELECT * FROM missions WHERE owner_id = ? AND source_text = 'Activado por Continuidad Financiera' "
                "ORDER BY start_date DESC LIMIT 1",
                (user_id,),
            ).fetchone()
            if mission and mission["status"] == "active" and mission["end_date"] >= datetime.utcnow().isoformat():
                status = "activo"
            else:
                status = "expirado"  # was active, but its mission ended (by time or manually)
        d["status"] = status
    return d


@router.post("")
def set_continuity_rule(body: ContinuityRuleRequest):
    with db_cursor(commit=True) as cur:
        rule_id = set_continuity_rule_row(
            cur, body.user_id, body.trigger_label, body.delegate_name, body.backup_name,
            body.allowed_categories, body.monthly_limit, body.days,
        )
    return {"id": rule_id}


@router.post("/{user_id}/activate")
def activate_continuity(user_id: str):
    with db_cursor(commit=True) as cur:
        mission_id = activate_continuity_row(cur, user_id)
    return {"mission_id": mission_id, "active": True}


@router.post("/{user_id}/deactivate")
def deactivate_continuity(user_id: str):
    with db_cursor(commit=True) as cur:
        deactivate_continuity_row(cur, user_id)
    return {"active": False}
