"""
database.py
------------
We use plain sqlite3 instead of an ORM on purpose: this is a hackathon
prototype that has to be read and explained out loud to judges, and a raw
CREATE TABLE statement is easier to defend live than a stack of ORM model
classes. In production this would move to Postgres + SQLAlchemy/Alembic
migrations, but the *shape* of the schema below would not change much.

Tables (mirrors the entities described in the brief):
  users              - the elder account owner
  family_members     - people related to a user (may or may not have trust access)
  trust_network       - who is trusted, with what role, for a given user
  missions            - a time-boxed delegation of a specific task
  permissions         - the fine-grained allow/deny rules attached to a mission
  transactions        - incoming (mock Nessie) transactions and their decision
  behavior_profiles   - per-category spending baseline used for anomaly detection
  alerts              - anything the Decision/Risk Engine flagged for a human
  approvals           - how a family member resolved an alert
  audit_log           - the human-readable "why" behind every decision
  continuity_rules    - the pre-authorized plan for "what happens if I can't manage this"
  exception_requests  - a family member asking the owner to approve a one-time
                        transaction that the active mission would otherwise block
                        (see app/routers/exceptions.py)
"""

import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).parent.parent / "money_companion.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    available_balance REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS family_members (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    relationship TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_network (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    member_id TEXT NOT NULL REFERENCES family_members(id),
    role TEXT NOT NULL,                 -- e.g. "Helper", "Backup"
    can_pay_bills INTEGER NOT NULL DEFAULT 0,
    can_review_alerts INTEGER NOT NULL DEFAULT 0,
    can_change_beneficiaries INTEGER NOT NULL DEFAULT 0  -- always kept at 0 in this prototype, see decision_engine.py
);

CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    delegate_id TEXT NOT NULL REFERENCES family_members(id),
    purpose TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_limit REAL NOT NULL,
    per_transaction_limit REAL,         -- optional hard cap PER transaction (e.g. "hasta $500 por pago de CFE").
                                         -- NULL means "no extra cap beyond the monthly total".
    allowed_categories TEXT NOT NULL,   -- JSON list, e.g. ["CFE","Agua","Farmacia"]
    status TEXT NOT NULL DEFAULT 'active',   -- active | expired | ended_early
    source_text TEXT                    -- the free-text request the owner typed in, if any
);

CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL REFERENCES missions(id),
    action TEXT NOT NULL,               -- e.g. "transferencias", "retiros", "cambio_beneficiarios"
    allowed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    mission_id TEXT REFERENCES missions(id),
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL,               -- APPROVED | REVIEW | BLOCKED
    reasons TEXT NOT NULL,              -- JSON list of human-readable reasons
    exception_eligible INTEGER NOT NULL DEFAULT 0  -- BLOCKED purely by a spending cap -> family can ask for a one-time exception
);

CREATE TABLE IF NOT EXISTS behavior_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    category TEXT NOT NULL,
    avg_amount REAL NOT NULL,
    std_amount REAL NOT NULL,
    frequency_per_month REAL NOT NULL,
    UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    transaction_id TEXT REFERENCES transactions(id),
    type TEXT NOT NULL,                 -- anomaly | boundary | blocked_attempt
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    alert_id TEXT NOT NULL REFERENCES alerts(id),
    approved_by TEXT NOT NULL,
    decision TEXT NOT NULL,             -- approved | denied
    timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    transaction_id TEXT REFERENCES transactions(id),
    action TEXT NOT NULL,
    reasons TEXT NOT NULL,              -- JSON list
    timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS continuity_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    trigger_label TEXT NOT NULL,        -- e.g. "Si no puedo administrar mis finanzas"
    delegate_id TEXT NOT NULL REFERENCES family_members(id),
    backup_id TEXT REFERENCES family_members(id),
    allowed_categories TEXT NOT NULL,   -- JSON list
    monthly_limit REAL NOT NULL,
    days INTEGER NOT NULL DEFAULT 30,
    active INTEGER NOT NULL DEFAULT 0,
    activated_at TEXT
);

CREATE TABLE IF NOT EXISTS exception_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    mission_id TEXT NOT NULL REFERENCES missions(id),
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    requested_by TEXT NOT NULL,          -- delegate's name, e.g. "Laura"
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | denied
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resulting_transaction_id TEXT REFERENCES transactions(id)
);
"""


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor(commit: bool = False):
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


def init_db(reset: bool = False):
    """Create all tables. If reset=True, wipe the file first (used by seed.py)."""
    if reset and DB_PATH.exists():
        DB_PATH.unlink()
    conn = get_connection()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
