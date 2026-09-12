"""
decision_engine.py
--------------------
This is the piece we'd defend hardest in front of judges, so it's written
to be read top-to-bottom like a checklist, not "clever."

THE CENTRAL RULE OF THE WHOLE PROJECT LIVES HERE:

    Deterministic permission rules ALWAYS run first and ALWAYS win.
    The Mission Compiler (which uses lightweight NLP) is only ever allowed
    to *propose* a mission. Once a mission is confirmed, what it does and
    does not allow is stored as plain rows in the `permissions` table and
    enforced here with plain `if` statements. No model output can override
    step 1 or step 2 below -- that's the whole point of the product.

Every transaction resolves to exactly one of three states:
    APPROVED  - matches the mission's permissions and looks normal
    REVIEW    - permitted, but something about it is unusual and a human
                (the family helper, or María herself) should take a look
    BLOCKED   - forbidden outright, no matter how the transaction looks
"""

from dataclasses import dataclass, field
from .behavior_baseline import CategoryBaseline
from .risk_engine import check_amount_anomaly, check_boundary_pattern

# These actions are never delegable, in any mission, no matter what the
# Mission Compiler or a family member proposes. This list is intentionally
# hard-coded (not editable through the UI) -- it's the "you cannot give
# away the whole house key" guarantee the product is built around.
NON_DELEGABLE_ACTIONS = {
    "Transferencia",
    "Retiro",
    "Cambio de beneficiario",
    "Cambio de titularidad",
    "Préstamo",
}


@dataclass
class Decision:
    status: str                 # APPROVED | REVIEW | BLOCKED
    reasons: list[str] = field(default_factory=list)
    comparison: dict | None = None  # e.g. {"baseline_avg": 180, "amount": 1420, "multiplier": 7.9}


def evaluate_transaction(
    category: str,
    amount: float,
    mission: dict | None,
    forbidden_actions: set[str],
    month_spent_in_mission: float,
    baseline: CategoryBaseline | None,
    recent_amounts_in_category: list[float],
) -> Decision:
    """
    mission: dict with keys allowed_categories (list[str]), monthly_limit (float),
             or None if this transaction is the owner spending her own money
             directly (no delegate involved -> permission rules don't apply).
    forbidden_actions: extra actions this specific mission explicitly forbids,
             on top of NON_DELEGABLE_ACTIONS.
    """

    # ---- No active mission: María is spending her own money herself. ----
    # Nothing to authorize -- we only surface an anomaly note for her own
    # awareness (used by the "Explícame mis gastos" screen), we never block.
    if mission is None:
        anomaly = check_amount_anomaly(amount, baseline)
        if anomaly.is_anomaly:
            return Decision(
                status="REVIEW",
                reasons=["Este gasto es más alto de lo habitual para esta categoría."],
                comparison={"baseline_avg": anomaly.baseline_avg, "amount": amount, "multiplier": anomaly.multiplier},
            )
        return Decision(status="APPROVED", reasons=["Movimiento de la cuenta propia."])

    # ---- STEP 1: hard, non-negotiable rules. These win over everything. ----
    all_forbidden = NON_DELEGABLE_ACTIONS | forbidden_actions
    if category in all_forbidden:
        return Decision(
            status="BLOCKED",
            reasons=[
                f"'{category}' no está permitido bajo ninguna misión.",
                "Regla determinista: ninguna IA puede aprobar esta acción.",
            ],
        )

    # ---- STEP 2: is this category even part of the active mission? ----
    if category not in mission["allowed_categories"]:
        return Decision(
            status="BLOCKED",
            reasons=[f"La misión activa no incluye la categoría '{category}'."],
        )

    # ---- STEP 3: monthly limit, the hard ceiling the owner agreed to. ----
    projected_total = month_spent_in_mission + amount
    if projected_total > mission["monthly_limit"]:
        return Decision(
            status="BLOCKED",
            reasons=[
                f"Excede el límite mensual autorizado (${mission['monthly_limit']:,.0f}).",
                f"Total del mes sería ${projected_total:,.0f}.",
            ],
        )

    # ---- STEP 4: soft signals. These can only ever produce REVIEW, ----
    # ---- never BLOCKED -- an unusual-but-permitted charge still needs ----
    # ---- a human's eyes, not an automatic refusal. ----
    anomaly = check_amount_anomaly(amount, baseline)
    if anomaly.is_anomaly:
        return Decision(
            status="REVIEW",
            reasons=[
                "Comercio autorizado.",
                "Dentro del límite mensual.",
                f"Monto {anomaly.multiplier}x mayor al habitual (normalmente ~${anomaly.baseline_avg:,.0f}).",
            ],
            comparison={"baseline_avg": anomaly.baseline_avg, "amount": amount, "multiplier": anomaly.multiplier},
        )

    boundary_hit = check_boundary_pattern(
        recent_amounts_in_category + [amount], mission["monthly_limit"]
    )
    if boundary_hit:
        return Decision(
            status="REVIEW",
            reasons=[
                "Comercio autorizado.",
                "Dentro del límite mensual.",
                "Varias transacciones recientes se acercan repetidamente al límite de la misión.",
            ],
        )

    # ---- Nothing unusual: approve. ----
    return Decision(
        status="APPROVED",
        reasons=["Comercio autorizado.", "Dentro del límite mensual.", "Monto habitual.", "Misión activa."],
    )
