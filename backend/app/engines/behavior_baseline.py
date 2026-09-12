"""
behavior_baseline.py
---------------------
Builds a simple statistical "what's normal" profile per spending category,
per user. This is intentionally built with the Python standard library
(`statistics`) instead of pandas/scikit-learn: with only a handful of
transactions per category, a mean + standard deviation is exactly as
meaningful as a trained model would be, and it's something a judge can
verify by hand in five seconds.

In production, this is the piece that would grow into a real ML model
(seasonality, per-merchant sub-profiles, peer-group comparison). The
important design decision -- and the one worth defending live -- is that
this module only ever *informs* a decision. It never has the authority to
approve or block anything by itself; see decision_engine.py.
"""

import statistics
from dataclasses import dataclass


@dataclass
class CategoryBaseline:
    category: str
    avg_amount: float
    std_amount: float
    frequency_per_month: float
    sample_size: int


def build_baseline(transactions: list[dict], category: str, days_observed: int = 90) -> CategoryBaseline | None:
    """transactions: list of {category, amount, timestamp} dicts for ONE user."""
    amounts = [t["amount"] for t in transactions if t["category"] == category]
    if not amounts:
        return None
    avg = statistics.mean(amounts)
    std = statistics.pstdev(amounts) if len(amounts) > 1 else avg * 0.1
    months_observed = max(days_observed / 30, 1)
    return CategoryBaseline(
        category=category,
        avg_amount=round(avg, 2),
        std_amount=round(std, 2),
        frequency_per_month=round(len(amounts) / months_observed, 2),
        sample_size=len(amounts),
    )


def build_all_baselines(transactions: list[dict]) -> dict[str, CategoryBaseline]:
    categories = {t["category"] for t in transactions}
    return {c: build_baseline(transactions, c) for c in categories if build_baseline(transactions, c)}


def detect_escalation(amounts_in_order: list[float], min_steps: int = 3) -> bool:
    """
    Detects a rising staircase like $180 -> $200 -> $400 -> $800: not a single
    anomaly, but a *trend*. We only flag a genuine monotonic increase across
    at least `min_steps` consecutive transactions, so normal noisy spending
    doesn't trip it.
    """
    if len(amounts_in_order) < min_steps:
        return False
    last = amounts_in_order[-min_steps:]
    return all(last[i] < last[i + 1] for i in range(len(last) - 1))
