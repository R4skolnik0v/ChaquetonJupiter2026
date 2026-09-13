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
    any of the hard rules below -- that's the whole point of the product.

Every transaction resolves to exactly one of three states:
    APPROVED  - matches the mission's permissions and looks normal
    REVIEW    - permitted, but something about it is unusual and a human
                (the family helper, or the account owner) should take a look
    BLOCKED   - forbidden outright, no matter how the transaction looks

A BLOCKED decision can additionally be marked `exception_eligible=True`.
That only happens when the ONLY reason it was blocked is a spending cap
(monthly or per-transaction) -- never for a hard-forbidden action or an
expired/out-of-scope mission. It's what lets the frontend offer "Solicitar
excepción": the family member can ask, but only the account owner can grant
it (see app/routers/exceptions.py). The engine itself never grants one.
"""

from datetime import datetime
from dataclasses import dataclass, field
from .behavior_baseline import CategoryBaseline, detect_escalation
from .risk_engine import check_amount_anomaly, check_boundary_pattern

# Historically the prototype used a global non-delegable set here. To give
# the account owner explicit control over action-level permissions (e.g.
# cash withdrawals, transfers), we keep this empty and enforce action
# allow/deny via the `permissions` table attached to each mission.
NON_DELEGABLE_ACTIONS = set()


@dataclass
class Decision:
    status: str                 # APPROVED | REVIEW | BLOCKED
    reasons: list[str] = field(default_factory=list)
    comparison: dict | None = None  # e.g. {"baseline_avg": 180, "amount": 1420, "multiplier": 7.9}
    exception_eligible: bool = False  # only True for a BLOCKED caused purely by a spending cap


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
             per_transaction_limit (float | None), start_date / end_date (ISO str,
             optional) -- or None if this transaction is the owner spending her
             own money directly (no delegate involved -> permission rules don't apply).
    forbidden_actions: extra actions this specific mission explicitly forbids,
             on top of NON_DELEGABLE_ACTIONS.
    """

    # ---- No active mission: the owner is spending her own money herself. ----
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

    # ---- STEP 0: is the mission even in effect right now? A mission is a ----
    # ---- TIME-BOXED delegation -- once it expires, it stops authorizing ----
    # ---- anything automatically. No renewal, no grace period. ----
    now_iso = datetime.utcnow().isoformat()
    if mission.get("end_date") and now_iso > mission["end_date"]:
        return Decision(
            status="BLOCKED",
            reasons=["Esta misión ya expiró.", "Ninguna misión vencida puede autorizar transacciones."],
        )
    if mission.get("start_date") and now_iso < mission["start_date"]:
        return Decision(
            status="BLOCKED",
            reasons=["Esta misión todavía no comienza."],
        )

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

    # ---- STEP 3: per-transaction cap, if this mission has one (e.g. ----
    # ---- "hasta $500 por pago de CFE"). Checked before the monthly total ----
    # ---- because it's the more specific rule. Exception-eligible: a human ----
    # ---- (the account owner) can still choose to allow this one payment. ----
    per_tx_limit = mission.get("per_transaction_limit")
    if per_tx_limit and amount > per_tx_limit:
        return Decision(
            status="BLOCKED",
            reasons=[
                f"Esta persona está autorizada para pagar {category}, pero solo hasta ${per_tx_limit:,.0f} por transacción.",
                f"Este pago es de ${amount:,.0f}.",
            ],
            exception_eligible=True,
        )

    # ---- STEP 4: monthly limit, the hard ceiling the owner agreed to. ----
    # ---- Also exception-eligible for the same reason as above. ----
    projected_total = month_spent_in_mission + amount
    if projected_total > mission["monthly_limit"]:
        return Decision(
            status="BLOCKED",
            reasons=[
                f"Excede el límite mensual autorizado (${mission['monthly_limit']:,.0f}).",
                f"Total del mes sería ${projected_total:,.0f}.",
            ],
            exception_eligible=True,
        )

    # ---- STEP 5: soft signals. These can only ever produce REVIEW, ----
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

    # Boundary-seeking: compare against whichever cap is more specific to
    # this mission (a per-transaction cap if it has one, else the monthly one).
    reference_limit = per_tx_limit or mission["monthly_limit"]
    if check_boundary_pattern(recent_amounts_in_category + [amount], reference_limit):
        return Decision(
            status="REVIEW",
            reasons=[
                "Comercio autorizado.",
                "Dentro del límite mensual.",
                "Varias transacciones recientes se acercan repetidamente al límite autorizado.",
                "Esto no significa fraude -- solo pedimos que alguien lo revise.",
            ],
        )

    # Escalation: a rising staircase of amounts (e.g. $200 -> $400 -> $700 ->
    # $1,000) even when each individual amount would look fine on its own.
    if detect_escalation(recent_amounts_in_category + [amount]):
        return Decision(
            status="REVIEW",
            reasons=[
                "Comercio autorizado.",
                "Dentro del límite mensual.",
                "Los montos han ido subiendo de forma sostenida en las últimas transacciones.",
                "Posible comportamiento de búsqueda del límite -- se aleja poco a poco de lo habitual.",
            ],
        )

    # ---- Nothing unusual: approve. ----
    return Decision(
        status="APPROVED",
        reasons=["Comercio autorizado.", "Dentro del límite mensual.", "Monto habitual.", "Misión activa."],
    )
