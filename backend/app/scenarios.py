"""
scenarios.py
--------------
Every demo (María, Carlos, Elena, Roberto, Patricia) is DATA, not code. This
file defines what each scenario looks like as plain dicts, and exposes exactly
ONE function -- `provision_scenario()` -- that turns any of those dicts into
database rows. There is no `if user == "Maria": ... elif user == "Carlos":`
anywhere: adding a 6th demo means adding a 6th dict to SCENARIOS, nothing else.

Each scenario's `id` doubles as its `user_id` in the database, so switching
demos in the frontend is just switching which user_id you're asking the
(otherwise completely generic) API about -- no backend restart needed, because
all five scenarios are provisioned once, up front, by seed.py.

"Empezar desde cero" (a custom, blank scenario) uses the same `provision_scenario`
function with an empty `history`/`mission`/`continuity` -- see
`provision_custom_scenario()` at the bottom.
"""

import json
import uuid
from datetime import datetime, timedelta
from .engines.decision_engine import NON_DELEGABLE_ACTIONS


def new_id() -> str:
    return str(uuid.uuid4())


def days_ago(n: int) -> str:
    return (datetime.utcnow() - timedelta(days=n)).isoformat()


def days_ahead(n: int) -> str:
    return (datetime.utcnow() + timedelta(days=n)).isoformat()


# ---------------------------------------------------------------------------
# Scenario definitions
# ---------------------------------------------------------------------------
# history: list of (merchant, category, amount, days_ago) -- ordinary past
#          spending, mission_id=None, used to build the behavioral baseline.
# scheduled: list of (merchant, category, amount, days_ahead) -- upcoming
#          bills shown on the elder Home screen.
# mission: None, or a dict describing an ALREADY-ACTIVE mission at seed time
#          (owner_id/delegate resolved automatically).
# continuity: None, or a dict describing a pre-authorized (but inactive)
#          Financial Continuity plan.
# presets: quick-fire buttons for the "simulate transaction" panel, written
#          in the order they're meant to be pressed during a demo.

SCENARIOS = [
    {
        "id": "maria",
        "name": "María Balcázar",
        "age": 72,
        "balance": 12430.00,
        "emoji": "🧓🏽",
        "tagline": "Delegación segura de tareas",
        "headline": "María necesita ayuda con sus servicios mientras se recupera de una cirugía.",
        "delegate": {"name": "Laura", "relationship": "hija"},
        "backup": {"name": "Carlos", "relationship": "sobrino"},
        "mission": {
            "purpose": "Ayudar con gastos esenciales mientras María se recupera",
            "days": 30,
            "monthly_limit": 4000.00,
            "per_transaction_limit": None,
            "allowed_categories": ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"],
            "source_text": "Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome.",
        },
        "continuity": {
            "trigger_label": "Si María no puede administrar sus finanzas",
            "allowed_categories": ["CFE", "Agua", "Gas", "Farmacia"],
            "monthly_limit": 4000.00,
            "days": 30,
        },
        "history": [
            ("CFE", "CFE", 205, 85), ("CFE", "CFE", 190, 75), ("CFE", "CFE", 183, 65), ("CFE", "CFE", 195, 40),
            ("Farmacia San Pablo", "Farmacia", 300, 42), ("Farmacia San Pablo", "Farmacia", 320, 35),
            ("Farmacia San Pablo", "Farmacia", 350, 11), ("Farmacia San Pablo", "Farmacia", 340, 8),
            ("Farmacia San Pablo", "Farmacia", 350, 3),
            ("Soriana", "Supermercado", 1250, 38), ("Soriana", "Supermercado", 1200, 20),
            ("Soriana", "Supermercado", 1220, 10), ("Soriana", "Supermercado", 1230, 1),
            ("Gas Natural", "Gas", 150, 33), ("Gas Natural", "Gas", 150, 6),
            ("Agua y Drenaje", "Agua", 220, 30),
            ("Administración Condominio", "Vivienda", 3600, 28), ("Administración Condominio", "Vivienda", 3600, 7),
            ("Uber", "Transporte", 460, 25), ("Uber", "Transporte", 710, 4),
            ("Restaurante El Tigre", "Restaurante", 500, 15), ("Restaurante El Tigre", "Restaurante", 500, 2),
        ],
        "scheduled": [("Luz", "CFE", 183, 6), ("Agua", "Agua", 240, 10)],
        "presets": [
            {"label": "CFE — $183 (normal)", "merchant": "CFE", "category": "CFE", "amount": 183},
            {"label": "Farmacia — $420 (normal)", "merchant": "Farmacia San Pablo", "category": "Farmacia", "amount": 420},
            {"label": "Transferencia — $5,000", "merchant": "Transferencia SPEI", "category": "Transferencia", "amount": 5000},
            {"label": "CFE — $1,420 (inusual)", "merchant": "CFE", "category": "CFE", "amount": 1420},
        ],
    },
    {
        "id": "carlos",
        "name": "Carlos Medina",
        "age": 69,
        "balance": 9800.00,
        "emoji": "💊",
        "tagline": "Detección de comportamiento anómalo",
        "headline": "Un cargo en la farmacia no se parece en nada a lo que Carlos gasta normalmente.",
        "delegate": {"name": "Ana", "relationship": "hija"},
        "backup": {"name": "Luis", "relationship": "sobrino"},
        "mission": {
            "purpose": "Ayudar con farmacia y supermercado",
            "days": 30,
            "monthly_limit": 6000.00,
            "per_transaction_limit": None,
            "allowed_categories": ["Farmacia", "Supermercado"],
            "source_text": "Quiero que mi hija me ayude a comprar mis medicinas y la despensa.",
        },
        "continuity": None,
        "history": [
            ("Farmacia Guadalajara", "Farmacia", 320, 60), ("Farmacia Guadalajara", "Farmacia", 350, 45),
            ("Farmacia Guadalajara", "Farmacia", 300, 20), ("Farmacia Guadalajara", "Farmacia", 480, 10),
            ("Walmart", "Supermercado", 950, 33), ("Walmart", "Supermercado", 900, 12),
        ],
        "scheduled": [],
        "presets": [
            {"label": "Farmacia — $380 (normal)", "merchant": "Farmacia Guadalajara", "category": "Farmacia", "amount": 380},
            {"label": "Farmacia — $3,800 (inusual)", "merchant": "Farmacia Guadalajara", "category": "Farmacia", "amount": 3800},
            {"label": "Transferencia — $1,000", "merchant": "Transferencia SPEI", "category": "Transferencia", "amount": 1000},
        ],
    },
    {
        "id": "elena",
        "name": "Elena Torres",
        "age": 75,
        "balance": 15200.00,
        "emoji": "🛟",
        "tagline": "Continuidad financiera",
        "headline": "Elena quedó temporalmente incapacitada y ya había autorizado un plan para este momento.",
        "delegate": {"name": "Sofía", "relationship": "hija"},
        "backup": {"name": "Diego", "relationship": "hijo"},
        "mission": None,  # no active mission yet -- Continuity gets activated live in the demo
        "continuity": {
            "trigger_label": "Si Elena no puede administrar sus finanzas temporalmente",
            "allowed_categories": ["CFE", "Agua", "Farmacia", "Supermercado"],
            "monthly_limit": 3500.00,
            "days": 30,
        },
        "history": [
            ("CFE", "CFE", 190, 70), ("CFE", "CFE", 205, 50), ("CFE", "CFE", 195, 20),
            ("Farmacia del Ahorro", "Farmacia", 320, 40), ("Farmacia del Ahorro", "Farmacia", 340, 15),
            ("Superama", "Supermercado", 1100, 35), ("Superama", "Supermercado", 1150, 14),
            ("Agua y Drenaje", "Agua", 210, 25),
        ],
        "scheduled": [],
        "presets": [
            {"label": "CFE — $195 (normal)", "merchant": "CFE", "category": "CFE", "amount": 195},
            {"label": "Farmacia — $2,000 (inusual)", "merchant": "Farmacia del Ahorro", "category": "Farmacia", "amount": 2000},
            {"label": "Transferencia — $1,500", "merchant": "Transferencia SPEI", "category": "Transferencia", "amount": 1500},
        ],
    },
    {
        "id": "roberto",
        "name": "Roberto Salinas",
        "age": 71,
        "balance": 21000.00,
        "emoji": "🧾",
        "tagline": "Límites de permisos",
        "headline": "Roberto autorizó a su hijo a pagar CFE -- pero solo hasta un límite.",
        "delegate": {"name": "Andrés", "relationship": "hijo"},
        "backup": {"name": "Marta", "relationship": "hija"},
        "mission": {
            "purpose": "Pagar el recibo de CFE",
            "days": 60,
            "monthly_limit": 3000.00,
            "per_transaction_limit": 500.00,
            "allowed_categories": ["CFE"],
            "source_text": "Quiero que mi hijo pague el recibo de la luz, pero solo hasta $500 por pago.",
        },
        "continuity": None,
        "history": [
            ("CFE", "CFE", 180, 55), ("CFE", "CFE", 200, 35), ("CFE", "CFE", 190, 15),
        ],
        "scheduled": [],
        "presets": [
            {"label": "CFE — $183 (normal)", "merchant": "CFE", "category": "CFE", "amount": 183},
            {"label": "CFE — $742 (excede su límite)", "merchant": "CFE", "category": "CFE", "amount": 742},
            {"label": "Transferencia — $2,000", "merchant": "Transferencia SPEI", "category": "Transferencia", "amount": 2000},
        ],
    },
    {
        "id": "patricia",
        "name": "Patricia Nuño",
        "age": 67,
        "balance": 7650.00,
        "emoji": "🚨",
        "tagline": "Comportamiento de búsqueda del límite",
        "headline": "Varios pagos, uno tras otro, se acercan cada vez más al límite autorizado.",
        "delegate": {"name": "Renata", "relationship": "hija"},
        "backup": {"name": "Iván", "relationship": "sobrino"},
        "mission": {
            "purpose": "Ayudar con el supermercado",
            "days": 30,
            "monthly_limit": 5000.00,
            "per_transaction_limit": 500.00,
            "allowed_categories": ["Supermercado"],
            "source_text": "Quiero que mi hija me ayude a hacer las compras del supermercado, hasta $500 por compra.",
        },
        "continuity": None,
        "history": [
            ("Chedraui", "Supermercado", 300, 40), ("Chedraui", "Supermercado", 290, 25),
        ],
        "scheduled": [],
        "presets": [
            {"label": "Supermercado — $150", "merchant": "Chedraui", "category": "Supermercado", "amount": 150},
            {"label": "Supermercado — $250", "merchant": "Chedraui", "category": "Supermercado", "amount": 250},
            {"label": "Supermercado — $350 (empieza a subir)", "merchant": "Chedraui", "category": "Supermercado", "amount": 350},
            {"label": "Supermercado — $480 (cerca del límite)", "merchant": "Chedraui", "category": "Supermercado", "amount": 480},
            {"label": "Supermercado — $500 (en el límite)", "merchant": "Chedraui", "category": "Supermercado", "amount": 500},
            {"label": "Transferencia — $600", "merchant": "Transferencia SPEI", "category": "Transferencia", "amount": 600},
        ],
    },
]

SCENARIOS_BY_ID = {s["id"]: s for s in SCENARIOS}


def list_scenario_meta() -> list[dict]:
    """What the landing page's 'Explorar demos' grid (and the Family
    dashboard's quick-simulate panel) needs -- no DB access."""
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "age": s["age"],
            "emoji": s["emoji"],
            "tagline": s["tagline"],
            "headline": s["headline"],
            "delegate_name": s["delegate"]["name"],
            "presets": s.get("presets", []),
        }
        for s in SCENARIOS
    ]


def wipe_scenario(cur, user_id: str):
    """Delete every row belonging to one user_id, across every table."""
    mission_ids = [r["id"] for r in cur.execute("SELECT id FROM missions WHERE owner_id=?", (user_id,)).fetchall()]
    for mid in mission_ids:
        cur.execute("DELETE FROM permissions WHERE mission_id=?", (mid,))
    cur.execute(
        "DELETE FROM exception_requests WHERE user_id=?", (user_id,)
    )
    cur.execute(
        "DELETE FROM alerts WHERE user_id=?", (user_id,)
    )
    cur.execute("DELETE FROM audit_log WHERE user_id=?", (user_id,))
    cur.execute("DELETE FROM transactions WHERE user_id=?", (user_id,))
    cur.execute("DELETE FROM missions WHERE owner_id=?", (user_id,))
    cur.execute("DELETE FROM continuity_rules WHERE user_id=?", (user_id,))
    cur.execute("DELETE FROM trust_network WHERE user_id=?", (user_id,))
    cur.execute("DELETE FROM family_members WHERE user_id=?", (user_id,))
    cur.execute("DELETE FROM users WHERE id=?", (user_id,))


def provision_scenario(cur, scenario: dict):
    """
    The ONE function that turns a scenario dict into database rows.
    Every demo -- María, Carlos, Elena, Roberto, Patricia -- and every
    custom "empezar desde cero" scenario goes through this exact same code.
    """
    user_id = scenario["id"]

    cur.execute(
        "INSERT INTO users (id, name, age, available_balance) VALUES (?,?,?,?)",
        (user_id, scenario["name"], scenario.get("age"), scenario["balance"]),
    )

    delegate_id = None
    backup_id = None
    if scenario.get("delegate"):
        delegate_id = new_id()
        cur.execute(
            "INSERT INTO family_members (id, user_id, name, relationship) VALUES (?,?,?,?)",
            (delegate_id, user_id, scenario["delegate"]["name"], scenario["delegate"]["relationship"]),
        )
        cur.execute(
            "INSERT INTO trust_network (id, user_id, member_id, role, can_pay_bills, "
            "can_review_alerts, can_change_beneficiaries) VALUES (?,?,?,?,1,1,0)",
            (new_id(), user_id, delegate_id, "Ayudante principal"),
        )
    if scenario.get("backup"):
        backup_id = new_id()
        cur.execute(
            "INSERT INTO family_members (id, user_id, name, relationship) VALUES (?,?,?,?)",
            (backup_id, user_id, scenario["backup"]["name"], scenario["backup"]["relationship"]),
        )
        cur.execute(
            "INSERT INTO trust_network (id, user_id, member_id, role, can_pay_bills, "
            "can_review_alerts, can_change_beneficiaries) VALUES (?,?,?,?,0,1,0)",
            (new_id(), user_id, backup_id, "Respaldo"),
        )

    mission_id = None
    m = scenario.get("mission")
    if m and delegate_id:
        mission_id = new_id()
        cur.execute(
            "INSERT INTO missions (id, owner_id, delegate_id, purpose, start_date, end_date, "
            "monthly_limit, per_transaction_limit, allowed_categories, status, source_text) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                mission_id, user_id, delegate_id, m["purpose"], days_ago(0), days_ahead(m["days"]),
                m["monthly_limit"], m.get("per_transaction_limit"), json.dumps(m["allowed_categories"]),
                "active", m.get("source_text"),
            ),
        )
        for category in m["allowed_categories"]:
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,1)",
                (new_id(), mission_id, category),
            )
        for action in NON_DELEGABLE_ACTIONS:
            cur.execute(
                "INSERT INTO permissions (id, mission_id, action, allowed) VALUES (?,?,?,0)",
                (new_id(), mission_id, action),
            )

    for merchant, category, amount, when in scenario.get("history", []):
        cur.execute(
            "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
            "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
            (new_id(), user_id, None, merchant, category, amount, days_ago(when), "APPROVED",
             json.dumps(["Historial de gastos personales."])),
        )

    for merchant, category, amount, when in scenario.get("scheduled", []):
        cur.execute(
            "INSERT INTO transactions (id, user_id, mission_id, merchant, category, amount, "
            "timestamp, status, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
            (new_id(), user_id, mission_id, merchant, category, amount, days_ahead(when), "SCHEDULED", "[]"),
        )

    c = scenario.get("continuity")
    if c and delegate_id:
        cur.execute(
            "INSERT INTO continuity_rules (id, user_id, trigger_label, delegate_id, backup_id, "
            "allowed_categories, monthly_limit, days, active) VALUES (?,?,?,?,?,?,?,?,0)",
            (
                new_id(), user_id, c["trigger_label"], delegate_id, backup_id,
                json.dumps(c["allowed_categories"]), c["monthly_limit"], c["days"],
            ),
        )

    return {"user_id": user_id, "delegate_id": delegate_id, "backup_id": backup_id, "mission_id": mission_id}


def provision_custom_scenario(cur, owner_name: str, delegate_name: str, delegate_relationship: str = "familiar") -> dict:
    """
    'Empezar desde cero': a blank scenario with a real, fresh user_id, no
    history, no mission, no continuity plan -- so it can never be confused
    with, or contaminate, one of the five preset demos. Goes through the
    exact same provision_scenario() function as every demo.
    """
    scenario = {
        "id": f"custom-{new_id()}",
        "name": owner_name,
        "age": None,
        "balance": 0.0,
        "delegate": {"name": delegate_name, "relationship": delegate_relationship} if delegate_name else None,
        "backup": None,
        "mission": None,
        "continuity": None,
        "history": [],
        "scheduled": [],
    }
    result = provision_scenario(cur, scenario)
    return {**result, "name": owner_name}
