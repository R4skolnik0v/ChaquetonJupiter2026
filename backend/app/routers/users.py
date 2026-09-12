"""
users.py
---------
Everything the ELDER MODE screens need. Every response here is written to
be read by María directly, not translated by the frontend -- so amounts
are rounded, categories are in plain Spanish, and there is no field named
anything like "cashFlow" or "riskScore".
"""

import json
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from ..database import db_cursor

router = APIRouter(prefix="/api/users", tags=["users"])


def _month_key(ts: str) -> str:
    return ts[:7]  # "2026-09-18" -> "2026-09"


@router.get("/{user_id}/summary")
def get_summary(user_id: str):
    with db_cursor() as cur:
        user = cur.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "Usuario no encontrado")

        now = datetime.utcnow()
        this_month = now.strftime("%Y-%m")
        rows = cur.execute(
            "SELECT amount, status, timestamp FROM transactions WHERE user_id = ? AND status != 'SCHEDULED'",
            (user_id,),
        ).fetchall()
        spent_this_month = sum(
            r["amount"] for r in rows
            if _month_key(r["timestamp"]) == this_month and r["status"] != "BLOCKED"
        )

        upcoming = cur.execute(
            "SELECT id, merchant, category, amount, timestamp FROM transactions "
            "WHERE user_id = ? AND status = 'SCHEDULED' ORDER BY timestamp ASC",
            (user_id,),
        ).fetchall()

        any_review_pending = cur.execute(
            "SELECT COUNT(*) as c FROM transactions WHERE user_id = ? AND status = 'REVIEW'",
            (user_id,),
        ).fetchone()["c"]

    return {
        "name": user["name"],
        "available_balance": user["available_balance"],
        "spent_this_month": round(spent_this_month, 2),
        "all_normal": any_review_pending == 0,
        "upcoming_payments": [dict(u) for u in upcoming],
    }


@router.get("/{user_id}/explain-spending")
def explain_spending(user_id: str):
    """
    Compares this month's spend per category against last month's, in plain
    language. This is the "Explícame mis gastos" screen -- it never returns
    a raw chart, only a sentence a family member could say out loud.
    """
    with db_cursor() as cur:
        rows = cur.execute(
            "SELECT category, amount, timestamp FROM transactions "
            "WHERE user_id = ? AND status != 'SCHEDULED' AND status != 'BLOCKED'",
            (user_id,),
        ).fetchall()

    now = datetime.utcnow()
    this_month = now.strftime("%Y-%m")
    last_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

    totals = {}
    for r in rows:
        key = _month_key(r["timestamp"])
        if key not in (this_month, last_month):
            continue
        totals.setdefault(r["category"], {"this_month": 0.0, "last_month": 0.0})
        if key == this_month:
            totals[r["category"]]["this_month"] += r["amount"]
        else:
            totals[r["category"]]["last_month"] += r["amount"]

    comparisons = []
    for category, vals in totals.items():
        diff = round(vals["this_month"] - vals["last_month"], 2)
        comparisons.append({
            "category": category,
            "this_month": round(vals["this_month"], 2),
            "last_month": round(vals["last_month"], 2),
            "difference": diff,
        })
    comparisons.sort(key=lambda c: c["difference"], reverse=True)

    headline = None
    if comparisons and comparisons[0]["difference"] > 50:
        top = comparisons[0]
        headline = (
            f"Este mes gastaste más en {top['category']} que el mes pasado. "
            f"El mes pasado gastaste ${top['last_month']:,.0f}. "
            f"Este mes llevas ${top['this_month']:,.0f}. "
            f"Esto es ${top['difference']:,.0f} más de lo habitual."
        )

    return {"headline": headline, "comparisons": comparisons}
