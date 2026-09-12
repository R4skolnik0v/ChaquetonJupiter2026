"""
intent_engine.py
-------------------
This is the "IA" the account owner talks to for EVERYTHING that isn't
strictly "create my first mission" (that narrower case is still handled by
mission_compiler.py, which this module calls into and reuses -- no
duplicated parsing logic).

Like mission_compiler.py, this is keyword/pattern matching, not a call to
an LLM -- same reasoning: no network dependency during a demo, and the
result is always just a PROPOSAL. Nothing here ever touches the database.
See routers/intent.py for the two-step interpret -> execute split that
enforces confirmation.

Supported intents (the brief's required list):
  CREATE_MISSION, MODIFY_MISSION, REVOKE_PERMISSION, GRANT_PERMISSION,
  MODIFY_LIMIT, MODIFY_DURATION, ADD_TRUSTED_PERSON, REMOVE_TRUSTED_PERSON,
  ENABLE_CONTINUITY, MODIFY_CONTINUITY, DISABLE_CONTINUITY,
  GENERAL_FINANCIAL_QUESTION

classify_and_propose(text, context) -> dict with keys:
  intent, confirmation_text, requires_confirmation, proposal
`proposal`'s shape depends on `intent` -- see the _propose_* functions
below, each documents its own shape. routers/intent.py's execute_intent()
is the mirror image: one branch per intent, consuming exactly these shapes.
"""

import re
import unicodedata
from datetime import datetime, timedelta
from .mission_compiler import (
    compile_mission,
    _detect_relationship,
    _detect_duration_days,
    _detect_categories,
    _suggest_limit,
)
from .decision_engine import NON_DELEGABLE_ACTIONS


def _strip_accents(s: str) -> str:
    """'Andrés' -> 'andres', 'desactívala' -> 'desactivala'. Applied to the
    free-text input, every keyword list below, and any stored names/
    relationships being compared against it, so accents typed (or not
    typed) never cause a false miss -- a real bug this fixed:
    'desactívala' didn't match a keyword list that only had 'desactiva'."""
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _norm(words: list[str]) -> list[str]:
    return [_strip_accents(w) for w in words]


# Individual, narrow keyword -> single category/action. Deliberately NOT the
# same as mission_compiler.PURPOSE_CATEGORY_MAP, which groups several
# categories under broad words like "ayuda" -- fine for "what should a new
# mission cover", wrong for "which ONE thing is this sentence about".
SINGLE_CATEGORY_KEYWORDS = {
    "CFE": _norm(["cfe", "luz", "electricidad"]),
    "Agua": _norm(["agua"]),
    "Gas": _norm(["gas"]),
    "Farmacia": _norm(["farmacia", "medicin", "receta", "medicamento"]),
    "Supermercado": _norm(["supermercado", "comida", "despensa", "mandado"]),
}

ACTION_KEYWORDS = {
    "Transferencia": _norm(["transferencia", "transferir", "transferencias", "transfiera"]),
    "Retiro": _norm(["retiro", "retirar", "sacar dinero", "sacar efectivo", "efectivo"]),
    "Cambio de beneficiario": _norm(["beneficiario"]),
    "Préstamo": _norm(["préstamo", "prestamo", "crédito", "credito"]),
}

_CONTINUITY_WORDS = _norm(["continuidad", "no pueda administrar", "no puedo administrar", "si no puedo",
                           "mientras no pueda", "incapacitad", "no pueda encargarme"])
_DISABLE_CONTINUITY_WORDS = _norm(["desactiva", "cancela", "termina", "apaga", "detener", "quita la continuidad"])
_ADD_PERSON_WORDS = _norm(["persona de confianza", "agregar a", "añadir a", "agrega a", "añade a",
                           "quiero agregar", "quiero añadir", "nueva persona"])
_REMOVE_PERSON_WORDS = _norm(["quitar a", "eliminar a", "remueve a", "sácalo", "sácala", "borra a",
                              "quita a", "ya no confío en", "ya no quiero que .* me ayude"])
_REVOKE_WORDS = _norm(["ya no quiero que", "quítale", "quitale", "no quiero que", "no puede", "no debería poder",
                       "quítale el permiso", "quitarle el permiso", "revocar", "revoca", "no debe poder"])
_GRANT_WORDS = _norm(["quiero que", "autoriza a", "dale permiso", "permite que", "deja que", "que pueda"])
_LIMIT_WORDS = _norm(["límite", "limite", "tope"])
_DURATION_WORDS = _norm(["duración", "duracion", "más tiempo", "mas tiempo", "extiende", "extender", "días más", "dias mas"])
_QUESTION_WORDS = _norm(["cuánto", "cuanto", "cómo van", "como van", "qué gasté", "que gaste",
                         "explícame", "explicame", "cómo está", "como esta"])


def _detect_single_target(lower: str) -> str | None:
    for action, keywords in ACTION_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return action
    for category, keywords in SINGLE_CATEGORY_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return category
    return None


def resolve_person(lower_text: str, trust_network: list[dict]) -> dict | None:
    """trust_network entries need: member_id, trust_id, name, relationship.
    `lower_text` is expected to already be accent-stripped and lowercased
    (classify_and_propose does this once for the whole request)."""
    for member in trust_network:
        name = _strip_accents((member.get("name") or "").lower())
        if name and re.search(rf"\b{re.escape(name)}\b", lower_text):
            return member
    for member in trust_network:
        rel = _strip_accents((member.get("relationship") or "").lower())
        if rel and rel in lower_text:
            return member
    return None


def _find_active_mission_for(person: dict | None, missions: list[dict]) -> dict | None:
    if not person:
        return None
    now_iso = datetime.utcnow().isoformat()
    for m in missions:
        if m["delegate_id"] == person["member_id"] and m["status"] == "active" and m["end_date"] >= now_iso:
            return m
    return None


def _extract_amount(lower: str) -> float | None:
    match = re.search(r"\$\s?(\d[\d,]*)(?:\.\d+)?", lower) or re.search(r"(\d[\d,]{2,})\s*pesos", lower)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _extract_days_mentioned(lower: str) -> int | None:
    match = re.search(r"(\d+)\s*(día|dias|semana|mes|meses)", lower)
    if not match:
        return None
    n = int(match.group(1))
    unit = match.group(2)
    if "semana" in unit:
        return n * 7
    if "mes" in unit:
        return n * 30
    return n


def _extract_capitalized_name(text: str, trust_network: list[dict]) -> str | None:
    """Best-effort name extraction: the first capitalized word that isn't
    already a known trusted person and isn't a common sentence-starter.
    This is the one place in the whole engine that's genuinely fragile --
    real name extraction needs an LLM or a proper NER model. Documented as
    a known limitation."""
    existing = {(m.get("name") or "").lower() for m in trust_network}
    stop = {"quiero", "ya", "voy", "necesito", "cuéntanos", "cuentanos"}
    for word in re.findall(r"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+", text):
        if word.lower() not in existing and word.lower() not in stop:
            return word
    return None


# ---------------------------------------------------------------------
# One _propose_* function per intent. Each returns:
#   {"intent": str, "confirmation_text": str, "requires_confirmation": bool, "proposal": {...}}
# ---------------------------------------------------------------------

def _propose_revoke(person: dict, target: str, mission: dict | None) -> dict:
    """proposal: {delegate_name, category, mission_id, already_blocked, remaining_categories?}"""
    if target in NON_DELEGABLE_ACTIONS:
        return {
            "intent": "REVOKE_PERMISSION", "requires_confirmation": True,
            "confirmation_text": f"Entendí que quieres quitarle a {person['name']} el permiso para '{target}'. Buena noticia: eso nunca estuvo permitido para nadie, así que no hay nada que cambiar.",
            "proposal": {"delegate_name": person["name"], "category": target, "mission_id": mission["id"] if mission else None, "already_blocked": True},
        }
    if not mission:
        return {
            "intent": "REVOKE_PERMISSION", "requires_confirmation": True,
            "confirmation_text": f"{person['name']} no tiene ninguna misión activa ahora mismo, así que no hay nada que quitarle en '{target}'.",
            "proposal": {"delegate_name": person["name"], "category": target, "mission_id": None, "already_blocked": True},
        }
    if target not in mission["allowed_categories"]:
        return {
            "intent": "REVOKE_PERMISSION", "requires_confirmation": True,
            "confirmation_text": f"{person['name']} ya no podía hacer eso -- '{target}' no estaba entre lo que tenía permitido.",
            "proposal": {"delegate_name": person["name"], "category": target, "mission_id": mission["id"], "already_blocked": True},
        }
    return {
        "intent": "REVOKE_PERMISSION", "requires_confirmation": True,
        "confirmation_text": f"Entendí que quieres quitarle a {person['name']} el permiso para '{target}'.",
        "proposal": {
            "delegate_name": person["name"], "category": target, "mission_id": mission["id"], "already_blocked": False,
            "remaining_categories": [c for c in mission["allowed_categories"] if c != target],
        },
    }


def _propose_grant(person: dict, target: str, mission: dict) -> dict:
    """proposal: {delegate_name, category, mission_id, already_allowed, blocked_forever?, new_categories?}"""
    if target in NON_DELEGABLE_ACTIONS:
        return {
            "intent": "GRANT_PERMISSION", "requires_confirmation": True,
            "confirmation_text": f"'{target}' nunca se puede autorizar, ni siquiera para {person['name']} -- es una regla fija del sistema, no algo que una misión pueda cambiar.",
            "proposal": {"delegate_name": person["name"], "category": target, "mission_id": mission["id"], "already_allowed": False, "blocked_forever": True},
        }
    if target in mission["allowed_categories"]:
        return {
            "intent": "GRANT_PERMISSION", "requires_confirmation": True,
            "confirmation_text": f"{person['name']} ya puede hacer eso -- '{target}' ya estaba permitido.",
            "proposal": {"delegate_name": person["name"], "category": target, "mission_id": mission["id"], "already_allowed": True},
        }
    return {
        "intent": "GRANT_PERMISSION", "requires_confirmation": True,
        "confirmation_text": f"Entendí que quieres que {person['name']} también pueda encargarse de '{target}'.",
        "proposal": {
            "delegate_name": person["name"], "category": target, "mission_id": mission["id"], "already_allowed": False,
            "new_categories": mission["allowed_categories"] + [target],
        },
    }


def _propose_remove_trusted_person(person: dict) -> dict:
    return {
        "intent": "REMOVE_TRUSTED_PERSON", "requires_confirmation": True,
        "confirmation_text": f"Entendí que ya no quieres que {person['name']} pueda ayudarte con nada. Esto termina cualquier misión activa que tenga.",
        "proposal": {"trust_id": person["trust_id"], "member_id": person["member_id"], "name": person["name"]},
    }


def _propose_add_trusted_person(text: str, lower: str, trust_network: list[dict]) -> dict:
    name = _extract_capitalized_name(text, trust_network)
    relationship = _detect_relationship(lower) or "familiar"
    return {
        "intent": "ADD_TRUSTED_PERSON", "requires_confirmation": True,
        "confirmation_text": (
            f"Entendí que quieres agregar a {name} ({relationship}) para que pueda ayudarte."
            if name else "Quiero agregar a alguien de tu confianza, pero no logré identificar el nombre -- puedes escribirlo abajo."
        ),
        "proposal": {"name": name, "relationship": relationship, "role": "Ayudante", "can_pay_bills": True, "can_review_alerts": True},
    }


def _propose_continuity(text: str, lower: str, context: dict, is_update: bool) -> dict:
    days = _detect_duration_days(text)
    categories, _ = _detect_categories(text)
    limit = _suggest_limit(categories, context["baselines"])
    person = resolve_person(lower, context["trust_network"])
    existing = context["continuity_rule"]
    delegate_name = person["name"] if person else (existing["delegate_name"] if existing else None)
    backup_name = existing["backup_name"] if existing else None
    trigger_label = "Si no puede administrar sus finanzas temporalmente"
    intent = "MODIFY_CONTINUITY" if is_update else "ENABLE_CONTINUITY"
    verb = "actualizar" if is_update else "configurar"
    who = delegate_name or "la persona que elijas"
    return {
        "intent": intent, "requires_confirmation": True,
        "confirmation_text": (
            f"Entendí que quieres {verb} tu plan de continuidad: si no puedes administrar tus finanzas, "
            f"{who} podría ayudarte con esto, hasta ${limit:,.0f} al mes, por {days} días."
        ),
        "proposal": {
            "trigger_label": trigger_label, "delegate_name": delegate_name, "backup_name": backup_name,
            "allowed_categories": categories, "monthly_limit": limit, "days": days,
        },
    }


def _propose_disable_continuity() -> dict:
    return {
        "intent": "DISABLE_CONTINUITY", "requires_confirmation": True,
        "confirmation_text": "Entendí que quieres desactivar tu plan de continuidad ahora mismo.",
        "proposal": {"no_change": False},
    }


def _propose_already_inactive_continuity() -> dict:
    return {
        "intent": "DISABLE_CONTINUITY", "requires_confirmation": True,
        "confirmation_text": "Tu plan de continuidad ya está desactivado -- no hay nada que apagar.",
        "proposal": {"no_change": True},
    }


def _propose_modify_limit(person: dict, mission: dict, amount: float, lower: str) -> dict:
    per_tx = any(w in lower for w in ["por transacción", "por transaccion", "por pago", "cada vez"])
    field = "per_transaction_limit" if per_tx else "monthly_limit"
    label = "por transacción" if per_tx else "al mes"
    return {
        "intent": "MODIFY_LIMIT", "requires_confirmation": True,
        "confirmation_text": f"Entendí que quieres cambiar el límite de {person['name']} a ${amount:,.0f} {label}.",
        "proposal": {"delegate_name": person["name"], "mission_id": mission["id"], "field": field, "new_value": amount},
    }


def _propose_modify_duration(person: dict, mission: dict, days: int, lower: str) -> dict:
    extend = any(w in lower for w in ["más", "mas", "extiende", "extender"])
    text = (
        f"Entendí que quieres darle {days} días más a la misión de {person['name']}."
        if extend else
        f"Entendí que quieres que la misión de {person['name']} dure {days} días en total."
    )
    return {
        "intent": "MODIFY_DURATION", "requires_confirmation": True,
        "confirmation_text": text,
        "proposal": {"delegate_name": person["name"], "mission_id": mission["id"], "days": days, "mode": "extend" if extend else "set"},
    }


def _propose_create_mission(text: str, context: dict) -> dict:
    draft = compile_mission(text, context["baselines"])
    delegate_name = None
    if draft.delegate_relationship:
        for m in context["trust_network"]:
            if m["relationship"] == draft.delegate_relationship:
                delegate_name = m["name"]
                break
    if not delegate_name:
        person = resolve_person(_strip_accents(text.lower()), context["trust_network"])
        if person:
            delegate_name = person["name"]
    return {
        "intent": "CREATE_MISSION", "requires_confirmation": True,
        "confirmation_text": f"Entendí que quieres que {delegate_name or 'alguien de tu confianza'} te ayude con {draft.purpose.lower()}, por {draft.days} días.",
        "proposal": {
            "delegate_name": delegate_name, "purpose": draft.purpose, "days": draft.days,
            "allowed_categories": draft.allowed_categories, "suggested_limit": draft.suggested_limit,
            "forbidden_actions": draft.forbidden_actions, "source_text": text,
        },
    }


def _propose_modify_mission(text: str, person: dict, mission: dict, context: dict) -> dict:
    draft = compile_mission(text, context["baselines"])
    return {
        "intent": "MODIFY_MISSION", "requires_confirmation": True,
        "confirmation_text": f"Entendí que quieres cambiar la misión de {person['name']}.",
        "proposal": {
            "delegate_name": person["name"], "mission_id": mission["id"], "purpose": draft.purpose,
            "days": draft.days, "allowed_categories": draft.allowed_categories,
            "suggested_limit": draft.suggested_limit, "source_text": text,
        },
    }


def _propose_general_question() -> dict:
    return {
        "intent": "GENERAL_FINANCIAL_QUESTION", "requires_confirmation": False,
        "confirmation_text": None,
        "proposal": {
            "answer": "Puedo ayudarte a ver tus gastos en \u201cExplícame mis gastos\u201d, o puedes escribir aquí mismo qué quieres cambiar -- quién te ayuda, con qué, cuánto, o por cuánto tiempo.",
        },
    }


def classify_and_propose(text: str, context: dict) -> dict:
    """
    context: {
      owner_id, baselines,
      trust_network: [{trust_id, member_id, name, relationship, role, can_pay_bills, can_review_alerts}],
      missions: [{id, delegate_id, allowed_categories, monthly_limit, per_transaction_limit, status, end_date, start_date}],
      continuity_rule: {..., delegate_name, backup_name, active} | None,
    }
    """
    lower = _strip_accents(text.lower())
    person = resolve_person(lower, context["trust_network"])
    target = _detect_single_target(lower)
    active_mission = _find_active_mission_for(person, context["missions"])

    # 1) Continuity
    if any(w in lower for w in _CONTINUITY_WORDS):
        wants_disable = any(w in lower for w in _DISABLE_CONTINUITY_WORDS)
        if wants_disable:
            if context["continuity_rule"] and context["continuity_rule"].get("active"):
                return _propose_disable_continuity()
            return _propose_already_inactive_continuity()
        return _propose_continuity(text, lower, context, is_update=bool(context["continuity_rule"]))

    # 2) Add to trust network
    if any(w in lower for w in _ADD_PERSON_WORDS):
        return _propose_add_trusted_person(text, lower, context["trust_network"])

    # 3) Remove from trust network
    if person and re.search("|".join(_REMOVE_PERSON_WORDS), lower):
        return _propose_remove_trusted_person(person)

    # 4) Revoke / grant a specific permission.
    # IMPORTANT: check revoke patterns first and return immediately if matched --
    # phrases like "ya no quiero que..." contain "quiero que" as a substring,
    # which would otherwise also match the grant patterns below. Negation
    # always wins over the phrase it's negating.
    if person and target:
        if any(w in lower for w in _REVOKE_WORDS):
            return _propose_revoke(person, target, active_mission)
        if any(w in lower for w in _GRANT_WORDS) and active_mission:
            return _propose_grant(person, target, active_mission)

    # 5) Ambiguous full revoke, no category named -> treat as removing the person entirely
    if person and any(w in lower for w in _REVOKE_WORDS) and not target:
        return _propose_remove_trusted_person(person)

    # 6) Limit / duration changes on an existing mission
    if person and active_mission:
        amount = _extract_amount(lower)
        if amount and any(w in lower for w in _LIMIT_WORDS):
            return _propose_modify_limit(person, active_mission, amount, lower)
        days = _extract_days_mentioned(lower)
        if days and any(w in lower for w in _DURATION_WORDS):
            return _propose_modify_duration(person, active_mission, days, lower)

    # 7) General question (only when no person/action was even mentioned)
    if not person and any(w in lower for w in _QUESTION_WORDS):
        return _propose_general_question()

    # 8) Fallback: create a new mission, or refresh the existing one
    if person and active_mission:
        return _propose_modify_mission(text, person, active_mission, context)
    return _propose_create_mission(text, context)
