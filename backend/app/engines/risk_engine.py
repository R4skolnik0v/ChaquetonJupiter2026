"""
risk_engine.py
----------------
Two kinds of "this looks off" detection. Neither one blocks anything by
itself -- both just produce a signal (a multiplier, a boolean, a message)
that the Decision Engine weighs alongside the hard permission rules.

1. Amount anomaly: is this transaction unusually large for this category,
   given what we've seen before?
2. Boundary testing: are recent transactions suspiciously clustered just
   under a limit? This is NOT proof of anything -- someone's water bill
   can genuinely be $199 three months running -- so it only ever produces
   a REVIEW-level nudge, never a BLOCKED.
"""

from dataclasses import dataclass
from .behavior_baseline import CategoryBaseline


ANOMALY_MULTIPLIER = 2.0  # amount this many times the baseline average triggers a flag


@dataclass
class AnomalyResult:
    is_anomaly: bool
    multiplier: float
    baseline_avg: float


def check_amount_anomaly(amount: float, baseline: CategoryBaseline | None) -> AnomalyResult:
    if baseline is None or baseline.avg_amount <= 0:
        return AnomalyResult(is_anomaly=False, multiplier=1.0, baseline_avg=0)
    multiplier = round(amount / baseline.avg_amount, 1)
    return AnomalyResult(
        is_anomaly=multiplier >= ANOMALY_MULTIPLIER,
        multiplier=multiplier,
        baseline_avg=baseline.avg_amount,
    )


def check_boundary_pattern(
    recent_amounts: list[float],
    limit: float,
    proximity_pct: float = 0.05,
    min_occurrences: int = 3,
) -> bool:
    """
    Flags when several recent transactions each land within `proximity_pct`
    of `limit` (e.g. $195/$198/$199/$200 against a $200 cap). This is the
    "Boundary Detection" feature from the brief: it never accuses anyone of
    fraud, it just surfaces a pattern a human should see.
    """
    if not recent_amounts or limit <= 0:
        return False
    threshold = limit * (1 - proximity_pct)
    close_calls = [a for a in recent_amounts if threshold <= a <= limit * 1.01]
    return len(close_calls) >= min_occurrences
