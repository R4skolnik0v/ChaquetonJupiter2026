"""
routers/intent.py
--------------------
Two endpoints, mirroring missions.py's compile/confirm split on purpose:

  POST /interpret  -> builds context from the DB, runs the Intent Engine,
                       returns a PROPOSAL. Nothing is written yet.
  POST /execute     -> only called after the account owner has reviewed the
                       proposal (unchanged, or edited) and pressed confirm.
                       This is the ONLY place any of these 12 intents
                       actually touch the database, and it does so by
                       calling the exact same functions the direct
                       endpoints use (create_mission, set_allowed_categories,
                       add_trust_member_row, set_continuity_rule_row, ...) --
                       no duplicated mutation logic anywhere.

Every execution writes one audit_log row, so "María revoked Carlos's
transfer permission" shows up in the audit trail exactly like a transaction
decision does, with transaction_id left NULL (this wasn't a transaction).
"""

import json
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..database import db_cursor
from ..engines.intent_engine import classify_and_propose
from ..engines.behavior_baseline import build_all_baselines
from .missions import create_mission, set_allowed_categories, set_mission_limits, set_mission_duration
from .trust import add_trust_member_row, remove_trust_member_row
from .continuity import set_continuity_rule_row, deactivate_continuity_row

router = APIRouter(prefix="/api/intent", tags=["intent"])


class InterpretRequest(BaseModel):
    user_id: str
    text: str


class ExecuteRequest(BaseModel):
    user_id: str
    intent: str
    proposal: dict
    confirmed: bool | None = None


def _build_context(cur, user_id: str) -> dict:
    trust_rows = cur.execute(
        "SELECT t.id as trust_id, t.role, t.can_pay_bills, t.can_review_alerts, "
        "f.id as member_id, f.name, f.relationship FROM trust_network t "
        "JOIN family_members f ON f.id = t.member_id WHERE t.user_id = ?",
        (user_id,),
    ).fetchall()
    trust_network = [dict(r) for r in trust_rows]

    mission_rows = cur.execute("SELECT * FROM missions WHERE owner_id = ? ORDER BY start_date DESC", (user_id,)).fetchall()
    missions = []
    for m in mission_rows:
        d = dict(m)
        d["allowed_categories"] = json.loads(d["allowed_categories"])
        missions.append(d)

    continuity_row = cur.execute(
        "SELECT c.*, fd.name as delegate_name, fb.name as backup_name FROM continuity_rules c "
        "JOIN family_members fd ON fd.id = c.delegate_id "
        "LEFT JOIN family_members fb ON fb.id = c.backup_id WHERE c.user_id = ?",
        (user_id,),
    ).fetchone()
    continuity_rule = None
    if continuity_row:
        continuity_rule = dict(continuity_row)
        continuity_rule["allowed_categories"] = json.loads(continuity_rule["allowed_categories"])

    tx_rows = cur.execute(
        "SELECT category, amount, timestamp FROM transactions WHERE user_id = ? AND status != 'SCHEDULED'", (user_id,)
    ).fetchall()
    baselines = build_all_baselines([dict(r) for r in tx_rows])

    return {"owner_id": user_id, "trust_network": trust_network, "missions": missions,
            "continuity_rule": continuity_rule, "baselines": baselines}


@router.post("/interpret")
def interpret(body: InterpretRequest):
    with db_cursor() as cur:
        owner = cur.execute("SELECT * FROM users WHERE id = ?", (body.user_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "Usuario no encontrado")
        context = _build_context(cur, body.user_id)
    result = classify_and_propose(body.text, context)
    result["source_text"] = body.text
    return result


def _audit(cur, user_id: str, intent: str, reason: str):
    cur.execute(
        "INSERT INTO audit_log (id, user_id, transaction_id, action, reasons, timestamp) VALUES (?,?,?,?,?,?)",
        (str(uuid.uuid4()), user_id, None, intent, json.dumps([reason]), datetime.utcnow().isoformat()),
    )


@router.post("/execute")
def execute(body: ExecuteRequest):
    intent = body.intent
    p = body.proposal
    user_id = body.user_id
    result = {}

    # Require explicit confirmation for intents that change state.
    if intent != "GENERAL_FINANCIAL_QUESTION" and not body.confirmed:
        raise HTTPException(400, "Confirmation required to execute this intent")

    with db_cursor(commit=True) as cur:
        owner = cur.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "Usuario no encontrado")

        if intent == "CREATE_MISSION":
            delegate = cur.execute("SELECT * FROM family_members WHERE user_id=? AND name=?", (user_id, p["delegate_name"])).fetchone()
            if not delegate:
                raise HTTPException(404, f"No se encontró a {p['delegate_name']}")
            mission_id = create_mission(cur, user_id, delegate["id"], p["purpose"], p["days"],
                                         p["suggested_limit"], p.get("per_transaction_limit"),
                                         p["allowed_categories"], p.get("source_text"))
            result = {"mission_id": mission_id}
            _audit(cur, user_id, intent, f"Se creó una misión nueva para {p['delegate_name']}: {p['purpose']}.")

        elif intent == "MODIFY_MISSION":
            set_allowed_categories(cur, p["mission_id"], p["allowed_categories"])
            set_mission_limits(cur, p["mission_id"], monthly_limit=p.get("suggested_limit"))
            _audit(cur, user_id, intent, f"Se actualizó la misión de {p['delegate_name']}.")

        elif intent == "REVOKE_PERMISSION":
            if p.get("already_blocked"):
                _audit(cur, user_id, intent, f"Se confirmó que '{p['category']}' sigue sin estar permitido para {p['delegate_name']}.")
            else:
                # If the target is a category (present in remaining_categories), update categories.
                if p.get("remaining_categories") is not None:
                    set_allowed_categories(cur, p["mission_id"], p["remaining_categories"])
                else:
                    # Action-level revoke: set the permission row for this action to allowed=0
                    cur.execute("DELETE FROM permissions WHERE mission_id = ? AND action = ?", (p["mission_id"], p["category"]))
                    cur.execute("INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,0)",
                                (str(uuid.uuid4()), p["mission_id"], p["category"],))
                _audit(cur, user_id, intent, f"Se le quitó a {p['delegate_name']} el permiso para '{p['category']}'.")

        elif intent == "GRANT_PERMISSION":
            if p.get("already_allowed") or p.get("blocked_forever"):
                why = "ya estaba permitido" if p.get("already_allowed") else "está bloqueado permanentemente"
                _audit(cur, user_id, intent, f"Sin cambios: '{p['category']}' {why} para {p['delegate_name']}.")
            else:
                # If new_categories present, update allowed categories.
                if p.get("new_categories") is not None:
                    set_allowed_categories(cur, p["mission_id"], p["new_categories"])
                else:
                    # Action-level grant: remove any existing deny and insert allow
                    cur.execute("DELETE FROM permissions WHERE mission_id = ? AND action = ?", (p["mission_id"], p["category"]))
                    cur.execute("INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
                                (str(uuid.uuid4()), p["mission_id"], p["category"],))
                _audit(cur, user_id, intent, f"Se le dio a {p['delegate_name']} permiso para '{p['category']}'.")

        elif intent == "MODIFY_LIMIT":
            if p["field"] == "per_transaction_limit":
                set_mission_limits(cur, p["mission_id"], per_transaction_limit=p["new_value"])
            else:
                set_mission_limits(cur, p["mission_id"], monthly_limit=p["new_value"])
            _audit(cur, user_id, intent, f"Se cambió el límite de {p['delegate_name']} a ${p['new_value']:,.0f}.")

        elif intent == "MODIFY_DURATION":
            mission = cur.execute("SELECT * FROM missions WHERE id = ?", (p["mission_id"],)).fetchone()
            if not mission:
                raise HTTPException(404, "Misión no encontrada")
            base = datetime.fromisoformat(mission["end_date"] if p["mode"] == "extend" else mission["start_date"])
            new_end = base + timedelta(days=p["days"])
            set_mission_duration(cur, p["mission_id"], new_end.isoformat())
            _audit(cur, user_id, intent, f"Se cambió la duración de la misión de {p['delegate_name']}.")

        elif intent == "ADD_TRUSTED_PERSON":
            if not p.get("name"):
                raise HTTPException(400, "No se identificó el nombre de la persona -- corrígelo e inténtalo de nuevo.")
            trust_id, member_id = add_trust_member_row(
                cur, user_id, p["name"], p.get("relationship", "familiar"), p.get("role", "Ayudante"),
                p.get("can_pay_bills", True), p.get("can_review_alerts", True),
            )
            result = {"trust_id": trust_id, "member_id": member_id}
            _audit(cur, user_id, intent, f"Se agregó a {p['name']} como persona de confianza.")

        elif intent == "REMOVE_TRUSTED_PERSON":
            removed = remove_trust_member_row(cur, user_id, p["trust_id"])
            if not removed:
                raise HTTPException(404, "No se encontró a esa persona en la red de confianza")
            _audit(cur, user_id, intent, f"Se quitó a {p['name']} de la red de confianza.")

        elif intent in ("ENABLE_CONTINUITY", "MODIFY_CONTINUITY"):
            set_continuity_rule_row(cur, user_id, p["trigger_label"], p["delegate_name"], p.get("backup_name"),
                                     p["allowed_categories"], p["monthly_limit"], p["days"])
            verb = "configuró" if intent == "ENABLE_CONTINUITY" else "actualizó"
            _audit(cur, user_id, intent, f"Se {verb} el plan de continuidad.")

        elif intent == "DISABLE_CONTINUITY":
            if p.get("no_change"):
                _audit(cur, user_id, intent, "Se confirmó que el plan de continuidad ya estaba desactivado.")
            else:
                deactivate_continuity_row(cur, user_id)
                _audit(cur, user_id, intent, "Se desactivó el plan de continuidad.")

        elif intent == "GENERAL_FINANCIAL_QUESTION":
            return {"ok": True, "no_op": True}

        else:
            raise HTTPException(400, f"Intent desconocido: {intent}")

    return {"ok": True, **result}
