"""
seed.py
--------
Run with:  python3 -m app.seed   (run.sh does this automatically)

Builds the whole demo scenario for María + Laura:

  - María already has ~2 months of ordinary spending history (this is what
    the Behavioral Baseline / Risk Engine learns "normal" from).
  - Laura's mission ("help María with essential expenses for 30 days") is
    already active, so the Family dashboard has real data the moment the
    app opens.
  - Nothing that appears in the hackathon demo script (CFE $183, Farmacia
    $420, Transferencia $5,000, CFE $1,420) is pre-seeded as a decided
    transaction. Those are meant to be fired LIVE, on stage, through
    POST /api/transactions/simulate (the frontend's "Simular transacción"
    panel has one-tap buttons for exactly these four) -- so judges watch
    the real Decision Engine reason about them in real time instead of
    looking at canned rows in a database.

This whole file stands in for "Capital One / Nessie" in the architecture
diagram in the README. Swapping it for a real Nessie API call later only
means changing where these transaction rows come from -- everything
downstream (Mission/Permission Engine, Behavioral Analysis, Risk Engine,
Decision Engine, Audit Log) stays exactly as it is.
"""

import json
import uuid
from datetime import datetime, timedelta
from .database import init_db, db_cursor

NOW = datetime.utcnow()


def days_ago(n: int) -> str:
    return (NOW - timedelta(days=n)).isoformat()


def days_ahead(n: int) -> str:
    return (NOW + timedelta(days=n)).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def seed():
    init_db(reset=True)

    maria_id = "maria"
    laura_id = new_id()
    carlos_id = new_id()

    with db_cursor(commit=True) as cur:
        # ---------------------------------------------------------------
        # People
        # ---------------------------------------------------------------
        cur.execute(
            "INSERT INTO users (id, name, age, available_balance) VALUES (?,?,?,?)",
            (maria_id, "María Balcázar", 72, 12430.00),
        )
        cur.execute(
            "INSERT INTO family_members (id, user_id, name, relationship) VALUES (?,?,?,?)",
            (laura_id, maria_id, "Laura", "hija"),
        )
        cur.execute(
            "INSERT INTO family_members (id, user_id, name, relationship) VALUES (?,?,?,?)",
            (carlos_id, maria_id, "Carlos", "sobrino"),
        )

        # ---------------------------------------------------------------
        # Trust network: being here does NOT grant spending power by
        # itself -- only an active Mission does that. Carlos can review
        # alerts but was never given bill-pay access.
        # ---------------------------------------------------------------
        cur.execute(
            "INSERT INTO trust_network (id, user_id, member_id, role, can_pay_bills, "
            "can_review_alerts, can_change_beneficiaries) VALUES (?,?,?,?,1,1,0)",
            (new_id(), maria_id, laura_id, "Ayudante principal"),
        )
        cur.execute(
            "INSERT INTO trust_network (id, user_id, member_id, role, can_pay_bills, "
            "can_review_alerts, can_change_beneficiaries) VALUES (?,?,?,?,0,1,0)",
            (new_id(), maria_id, carlos_id, "Respaldo"),
        )

        # ---------------------------------------------------------------
        # Laura's active mission: "Help María manage essential expenses
        # for 30 days" -- already created, so the Family dashboard has a
        # real mission to show immediately. The Mission Compiler can
        # still be demoed live to create a second mission.
        # ---------------------------------------------------------------
        mission_id = new_id()
        allowed = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"]
        cur.execute(
            "INSERT INTO missions (id, owner_id, delegate_id, purpose, start_date, end_date, "
            "monthly_limit, allowed_categories, status, source_text) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                mission_id, maria_id, laura_id, "Ayudar con gastos esenciales mientras María se recupera",
                days_ago(12), days_ahead(18), 4000.00, json.dumps(allowed), "active",
                "Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome.",
            ),
        )
        from .engines.decision_engine import NON_DELEGABLE_ACTIONS
        for category in allowed:
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
                (new_id(), mission_id, category),
            )
        for action in NON_DELEGABLE_ACTIONS:
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,0)",
                (new_id(), mission_id, action),
            )

        # ---------------------------------------------------------------
        # Ordinary spending history (mission_id = NULL: this is María's
        # own past spending, which is exactly what the Behavioral
        # Baseline engine needs to know what's "normal" for her).
        # All APPROVED because nothing here was ever evaluated against a
        # mission -- there wasn't one yet.
        # ---------------------------------------------------------------
        def add_history(merchant, category, amount, when_iso):
            cur.execute(
                "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
                "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    new_id(), maria_id, None, merchant, category, amount, when_iso,
                    "APPROVED", json.dumps(["Historial de gastos personales."]),
                ),
            )

        # CFE (electricity) baseline: averages to roughly $190-200, used
        # later to judge the live "CFE $1,420" demo transaction.
        add_history("CFE", "CFE", 205, days_ago(85))
        add_history("CFE", "CFE", 190, days_ago(75))
        add_history("CFE", "CFE", 183, days_ago(65))
        add_history("CFE", "CFE", 195, days_ago(40))

        # Farmacia: last month $620, this month (so far) $1,040 -- this is
        # the exact comparison the "Explícame mis gastos" screen narrates.
        add_history("Farmacia San Pablo", "Farmacia", 300, days_ago(42))
        add_history("Farmacia San Pablo", "Farmacia", 320, days_ago(35))
        add_history("Farmacia San Pablo", "Farmacia", 350, days_ago(11))
        add_history("Farmacia San Pablo", "Farmacia", 340, days_ago(8))
        add_history("Farmacia San Pablo", "Farmacia", 350, days_ago(3))

        # Supermercado
        add_history("Soriana", "Supermercado", 1250, days_ago(38))
        add_history("Soriana", "Supermercado", 1200, days_ago(20))
        add_history("Soriana", "Supermercado", 1220, days_ago(10))
        add_history("Soriana", "Supermercado", 1230, days_ago(1))

        # Gas
        add_history("Gas Natural", "Gas", 150, days_ago(33))
        add_history("Gas Natural", "Gas", 150, days_ago(6))

        # Agua (water) -- last month only; this month's is still upcoming
        add_history("Agua y Drenaje", "Agua", 220, days_ago(30))

        # Vivienda (housing/maintenance) -- steady both months
        add_history("Administración Condominio", "Vivienda", 3600, days_ago(28))
        add_history("Administración Condominio", "Vivienda", 3600, days_ago(7))

        # Transporte
        add_history("Uber", "Transporte", 460, days_ago(25))
        add_history("Uber", "Transporte", 710, days_ago(4))

        # Restaurante
        add_history("Restaurante El Tigre", "Restaurante", 500, days_ago(15))
        add_history("Restaurante El Tigre", "Restaurante", 500, days_ago(2))

        # ---------------------------------------------------------------
        # Upcoming (scheduled) payments -- shown on the Elder home screen.
        # status = SCHEDULED so they're excluded from every spend/decision
        # calculation until they actually happen.
        # ---------------------------------------------------------------
        cur.execute(
            "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
            "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
            (new_id(), maria_id, mission_id, "Luz", "CFE", 183, days_ahead(6), "SCHEDULED", "[]"),
        )
        cur.execute(
            "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
            "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
            (new_id(), maria_id, mission_id, "Agua", "Agua", 240, days_ahead(10), "SCHEDULED", "[]"),
        )

        # ---------------------------------------------------------------
        # Financial Continuity plan -- pre-configured, not yet activated.
        # The demo can flip this on live to show a second mission being
        # created automatically from a pre-authorized plan.
        # ---------------------------------------------------------------
        cur.execute(
            "INSERT INTO continuity_rules (id, user_id, trigger_label, delegate_id, backup_id, "
            "allowed_categories, monthly_limit, days, active) VALUES (?,?,?,?,?,?,?,?,0)",
            (
                new_id(), maria_id, "Si María no puede administrar sus finanzas",
                laura_id, carlos_id, json.dumps(["CFE", "Agua", "Gas", "Farmacia"]), 4000.00, 30,
            ),
        )

    print("Seed complete.")
    print(f"  user_id (María)   = {maria_id}")
    print(f"  mission_id (Laura) = {mission_id}")


if __name__ == "__main__":
    seed()
