"""
mission_compiler.py
----------------------
Turns something like:

    "Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome"

into a structured mission draft the owner can review and confirm.

WHY THIS IS KEYWORD MATCHING, NOT A CALL TO AN LLM:
for the hackathon we kept this fully offline and deterministic so the demo
never depends on network access or an API key. In production this step
would call an LLM to interpret much richer phrasing -- but notice that even
then, nothing changes in decision_engine.py: the compiler only ever
*proposes* categories/limits/duration, and the owner has to press
"Confirmar misión" before any of it becomes an enforceable permission. A
model hallucinating a bad suggestion here can only produce a draft that
looks wrong and gets rejected -- it can never grant itself a permission.
"""

import math
import re
from dataclasses import dataclass, field

RELATIONSHIP_KEYWORDS = {
    "hija": "daughter",
    "hijo": "son",
    "nieta": "granddaughter",
    "nieto": "grandson",
    "cuidador": "caregiver",
    "cuidadora": "caregiver",
    "sobrina": "niece",
    "sobrino": "nephew",
}

# purpose keyword -> suggested categories
PURPOSE_CATEGORY_MAP = [
    (["servicio", "recibo", "luz", "cfe", "agua", "gas"], ["CFE", "Agua", "Gas"]),
    (["farmacia", "medicin", "receta"], ["Farmacia"]),
    (["supermercado", "comida", "despensa", "mandado"], ["Supermercado"]),
    (["gasto", "ayuda", "administrar", "cuenta"], ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"]),
]

DEFAULT_CATEGORIES = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"]

DURATION_WORD_TO_DAYS = {
    "semana": 7,
    "quincena": 15,
    "mes": 30,
    "meses": 30,
}


@dataclass
class MissionDraft:
    delegate_relationship: str | None
    delegate_name: str | None
    purpose: str
    days: int
    allowed_categories: list[str]
    suggested_limit: float
    # No global forbidden actions by default; the account owner decides
    # which specific actions (if any) should be disallowed for a mission.
    forbidden_actions: list[str] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)


def _detect_relationship(text: str) -> str | None:
    lower = text.lower()
    for keyword in RELATIONSHIP_KEYWORDS:
        if keyword in lower:
            return keyword
    return None


def _detect_duration_days(text: str) -> int:
    lower = text.lower()
    # explicit number + unit, e.g. "30 días", "2 semanas"
    match = re.search(r"(\d+)\s*(día|dias|día|semana|quincena|mes|meses)", lower)
    if match:
        n = int(match.group(1))
        unit = match.group(2)
        if "día" in unit or "dia" in unit:
            return n
        if "semana" in unit:
            return n * 7
        if "quincena" in unit:
            return n * 15
        if "mes" in unit:
            return n * 30
    # bare unit words without a number, e.g. "un mes", "unas semanas"
    for word, days in DURATION_WORD_TO_DAYS.items():
        if word in lower:
            return days
    return 30  # default when duration isn't mentioned


def _detect_categories(text: str) -> tuple[list[str], list[str]]:
    lower = text.lower()
    matched_keywords: list[str] = []
    categories: list[str] = []
    for keywords, cats in PURPOSE_CATEGORY_MAP:
        for kw in keywords:
            if kw in lower:
                matched_keywords.append(kw)
                for c in cats:
                    if c not in categories:
                        categories.append(c)
    if not categories:
        categories = DEFAULT_CATEGORIES
    return categories, matched_keywords


def _suggest_limit(categories: list[str], baselines: dict) -> float:
    """
    Sums each category's typical monthly spend (avg_amount * frequency_per_month)
    from the user's behavior_profiles, adds a 20% buffer for normal variation,
    and rounds up to the nearest 100 so the number is easy to read.
    """
    total = 0.0
    for cat in categories:
        baseline = baselines.get(cat)
        if baseline:
            total += baseline.avg_amount * max(baseline.frequency_per_month, 1)
        else:
            total += 300  # fallback guess for a category with no history yet
    total *= 1.2
    return math.ceil(total / 100) * 100


def compile_mission(text: str, baselines: dict) -> MissionDraft:
    relationship = _detect_relationship(text)
    days = _detect_duration_days(text)
    categories, matched_keywords = _detect_categories(text)
    limit = _suggest_limit(categories, baselines)

    purpose = "Gastos esenciales del hogar"
    if "farmacia" in matched_keywords or "medicin" in text.lower():
        purpose = "Farmacia y salud"
    elif categories == ["Supermercado"]:
        purpose = "Supermercado y despensa"
    elif categories == ["CFE", "Agua", "Gas"]:
        purpose = "Pago de servicios del hogar"

    return MissionDraft(
        delegate_relationship=relationship,
        delegate_name=None,  # resolved by the router against the owner's family_members
        purpose=purpose,
        days=days,
        allowed_categories=categories,
        suggested_limit=limit,
        matched_keywords=matched_keywords,
    )
