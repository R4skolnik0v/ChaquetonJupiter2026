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
from pydantic import BaseModel

router = APIRouter(prefix="/api/missions", tags=["missions"])


def _user_baselines(cur, user_id: str) -> dict:
    rows = cur.execute(
        "SELECT category, amount, timestamp FROM transactions WHERE user_id = ? AND status != 'SCHEDULED'",
        (user_id,),
    ).fetchall()
    return build_all_baselines([dict(r) for r in rows])


def create_mission(cur, owner_id: str, delegate_id: str, purpose: str, days: int,
                    monthly_limit: float, per_transaction_limit: float | None,
                    allowed_categories: list[str], source_text: str | None) -> str:
    """
    Shared by POST /api/missions (direct confirm) and the Intent Engine's
    CREATE_MISSION execution (routers/intent.py) -- there is exactly one
    code path that writes a new mission, no matter which UI triggered it.
    Caller is responsible for commit (pass a db_cursor(commit=True) cursor).
    """
    mission_id = str(uuid.uuid4())
    start = datetime.utcnow()
    end = start + timedelta(days=days)
    cur.execute(
        "INSERT INTO missions (id, owner_id, delegate_id, purpose, start_date, end_date, "
        "monthly_limit, per_transaction_limit, allowed_categories, status, source_text) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (
            mission_id, owner_id, delegate_id, purpose, start.isoformat(), end.isoformat(),
            monthly_limit, per_transaction_limit, json.dumps(allowed_categories), "active", source_text,
        ),
    )
    for category in allowed_categories:
        cur.execute(
            "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
            (str(uuid.uuid4()), mission_id, category),
        )
    return mission_id


def set_allowed_categories(cur, mission_id: str, allowed_categories: list[str]):
    """Used by GRANT_PERMISSION / REVOKE_PERMISSION to add or remove a single
    category from an existing mission, keeping `missions.allowed_categories`
    (what the Decision Engine actually reads) and the `permissions` audit
    rows in sync."""
    cur.execute("UPDATE missions SET allowed_categories = ? WHERE id = ?", (json.dumps(allowed_categories), mission_id))
    cur.execute("DELETE FROM permissions WHERE mission_id = ?", (mission_id,))
    for category in allowed_categories:
        cur.execute("INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
                     (str(uuid.uuid4()), mission_id, category))


def set_mission_limits(cur, mission_id: str, monthly_limit: float | None = None, per_transaction_limit: float | None = "__unset__"):
    """MODIFY_LIMIT. per_transaction_limit uses a sentinel so callers can
    distinguish "leave unchanged" from "explicitly clear it"."""
    if monthly_limit is not None:
        cur.execute("UPDATE missions SET monthly_limit = ? WHERE id = ?", (monthly_limit, mission_id))
    if per_transaction_limit != "__unset__":
        cur.execute("UPDATE missions SET per_transaction_limit = ? WHERE id = ?", (per_transaction_limit, mission_id))


def set_mission_duration(cur, mission_id: str, new_end_date_iso: str):
    """MODIFY_DURATION."""
    cur.execute("UPDATE missions SET end_date = ? WHERE id = ?", (new_end_date_iso, mission_id))


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

    with db_cursor(commit=True) as cur:
        mission_id = create_mission(
            cur, body.owner_id, delegate["id"], body.purpose, body.days,
            body.monthly_limit, body.per_transaction_limit, body.allowed_categories, body.source_text,
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
            # A mission is reported as "expired" the moment its end_date passes,
            # even if nobody ever flips the stored `status` column -- the
            # Decision Engine already treats it as unauthorized either way
            # (see engines/decision_engine.py STEP 0), this just makes the UI
            # honest about it too.
            effective_status = m["status"]
            if effective_status == "active" and m["end_date"] < datetime.utcnow().isoformat():
                effective_status = "expired"
            result.append({
                "id": m["id"],
                "delegate_name": m["delegate_name"],
                "purpose": m["purpose"],
                "start_date": m["start_date"],
                "end_date": m["end_date"],
                "monthly_limit": m["monthly_limit"],
                "per_transaction_limit": m["per_transaction_limit"],
                "allowed_categories": json.loads(m["allowed_categories"]),
                "forbidden_actions": [p["action"] for p in perms if not p["allowed"]],
                "status": effective_status,
                "spent_this_month": spent,
            })
    return result


class PermissionUpdateRequest(BaseModel):
    owner_id: str
    action: str
    action_type: str  # 'category' or 'action'
    allowed: bool


@router.get("/{mission_id}/permissions")
def list_permissions(mission_id: str, owner_id: str):
    """Return both category-based permissions and action-based permissions
    for a given mission and owner. Ensures the caller is the owner."""
    CATEGORY_CHOICES = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"]
    ACTION_CHOICES = ["Retiro", "Transferencia", "Cambio de beneficiario", "Cambio de titularidad", "Préstamo"]
    with db_cursor() as cur:
        owner = cur.execute("SELECT * FROM users WHERE id = ?", (owner_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "Usuario no encontrado")
        mission = cur.execute("SELECT * FROM missions WHERE id = ? AND owner_id = ?", (mission_id, owner_id)).fetchone()
        if not mission:
            raise HTTPException(404, "Misión no encontrada")
        allowed_categories = json.loads(mission["allowed_categories"])
        perms = cur.execute("SELECT action, allowed FROM permissions WHERE mission_id = ?", (mission_id,)).fetchall()
        action_map = {p["action"]: bool(p["allowed"]) for p in perms}

    categories = [{"key": c, "label": c, "allowed": c in allowed_categories} for c in CATEGORY_CHOICES]
    actions = [{"key": a, "label": a, "allowed": action_map.get(a, True)} for a in ACTION_CHOICES]
    return {"categories": categories, "actions": actions}


@router.post("/{mission_id}/permissions")
def update_permission(mission_id: str, body: PermissionUpdateRequest):
    # Only owner may change permissions
    with db_cursor(commit=True) as cur:
        owner = cur.execute("SELECT * FROM users WHERE id = ?", (body.owner_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "Usuario no encontrado")
        mission = cur.execute("SELECT * FROM missions WHERE id = ? AND owner_id = ?", (mission_id, body.owner_id)).fetchone()
        if not mission:
            raise HTTPException(404, "Misión no encontrada")

        if body.action_type == "category":
            # update allowed_categories list on mission and refresh permissions rows
            current = json.loads(mission["allowed_categories"])
            if body.allowed and body.action not in current:
                current.append(body.action)
            if not body.allowed and body.action in current:
                current = [c for c in current if c != body.action]
            set_allowed_categories(cur, mission_id, current)
        else:
            # action-level allow/deny stored in permissions table
            # remove any existing row and insert new allowed flag
            cur.execute("DELETE FROM permissions WHERE mission_id = ? AND action = ?", (mission_id, body.action))
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,?)",
                (str(uuid.uuid4()), mission_id, body.action, int(body.allowed)),
            )

    return {"ok": True}
