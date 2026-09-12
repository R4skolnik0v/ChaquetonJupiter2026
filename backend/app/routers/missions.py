"""
missions.py
------------
Two distinct steps, kept as two distinct endpoints on purpose:

  POST /compile   -> runs the Mission Compiler (engines/mission_compiler.py)
                      and returns a DRAFT. Nothing is saved yet.
  POST /          -> saves a CONFIRMED mission, only after a human (María)
                      has looked at the draft and pressed "Confirmar misión".

This mirrors the brief's requirement that the AI only interprets intent;
a mission has zero effect on what transactions get approved until it has
been written to the database by the confirm step.
"""

import json
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import MissionCompileRequest, MissionConfirmRequest
from ..engines.mission_compiler import compile_mission, RELATIONSHIP_KEYWORDS
from ..engines.behavior_baseline import build_all_baselines
from ..engines.decision_engine import NON_DELEGABLE_ACTIONS

router = APIRouter(prefix="/api/missions", tags=["missions"])


def _user_baselines(cur, user_id: str) -> dict:
    rows = cur.execute(
        "SELECT category, amount, timestamp FROM transactions WHERE user_id = ? AND status != 'SCHEDULED'",
        (user_id,),
    ).fetchall()
    return build_all_baselines([dict(r) for r in rows])


@router.post("/compile")
def compile_mission_endpoint(body: MissionCompileRequest):
    with db_cursor() as cur:
        owner = cur.execute("SELECT * FROM users WHERE id = ?", (body.owner_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "Usuario no encontrado")
        baselines = _user_baselines(cur, body.owner_id)
        draft = compile_mission(body.text, baselines)

        delegate_name = None
        if draft.delegate_relationship:
            spanish_rel = draft.delegate_relationship
            member = cur.execute(
                "SELECT * FROM family_members WHERE user_id = ? AND relationship = ?",
                (body.owner_id, spanish_rel),
            ).fetchone()
            if member:
                delegate_name = member["name"]

    return {
        "delegate_name": delegate_name,
        "delegate_relationship": draft.delegate_relationship,
        "purpose": draft.purpose,
        "days": draft.days,
        "allowed_categories": draft.allowed_categories,
        "suggested_limit": draft.suggested_limit,
        "forbidden_actions": draft.forbidden_actions,
        "matched_keywords": draft.matched_keywords,
        "source_text": body.text,
    }


@router.post("")
def confirm_mission(body: MissionConfirmRequest):
    with db_cursor() as cur:
        owner = cur.execute("SELECT * FROM users WHERE id = ?", (body.owner_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "Usuario no encontrado")
        delegate = cur.execute(
            "SELECT * FROM family_members WHERE user_id = ? AND name = ?",
            (body.owner_id, body.delegate_name),
        ).fetchone()
        if not delegate:
            raise HTTPException(404, f"No se encontró a {body.delegate_name} en la red de confianza")

    mission_id = str(uuid.uuid4())
    start = datetime.utcnow()
    end = start + timedelta(days=body.days)

    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO missions (id, owner_id, delegate_id, purpose, start_date, end_date, "
            "monthly_limit, allowed_categories, status, source_text) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                mission_id, body.owner_id, delegate["id"], body.purpose,
                start.isoformat(), end.isoformat(), body.monthly_limit,
                json.dumps(body.allowed_categories), "active", body.source_text,
            ),
        )
        for category in body.allowed_categories:
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
                (str(uuid.uuid4()), mission_id, category),
            )
        for action in NON_DELEGABLE_ACTIONS:
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,0)",
                (str(uuid.uuid4()), mission_id, action),
            )

    return {"id": mission_id, "status": "active"}


@router.get("")
def list_missions(owner_id: str):
    with db_cursor() as cur:
        missions = cur.execute(
            "SELECT m.*, f.name as delegate_name FROM missions m "
            "JOIN family_members f ON f.id = m.delegate_id "
            "WHERE m.owner_id = ? ORDER BY m.start_date DESC",
            (owner_id,),
        ).fetchall()
        result = []
        for m in missions:
            this_month = datetime.utcnow().strftime("%Y-%m")
            spent = cur.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
                "WHERE mission_id = ? AND status != 'BLOCKED' AND status != 'SCHEDULED' "
                "AND strftime('%Y-%m', timestamp) = ?",
                (m["id"], this_month),
            ).fetchone()["total"]
            perms = cur.execute(
                "SELECT action, allowed FROM permissions WHERE mission_id = ?", (m["id"],)
            ).fetchall()
            result.append({
                "id": m["id"],
                "delegate_name": m["delegate_name"],
                "purpose": m["purpose"],
                "start_date": m["start_date"],
                "end_date": m["end_date"],
                "monthly_limit": m["monthly_limit"],
                "allowed_categories": json.loads(m["allowed_categories"]),
                "forbidden_actions": [p["action"] for p in perms if not p["allowed"]],
                "status": m["status"],
                "spent_this_month": spent,
            })
    return result
