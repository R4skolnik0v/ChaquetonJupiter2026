"""
seed.py
--------
Run with:  python3 -m app.seed   (run.sh does this automatically)

Provisions EVERY demo scenario defined in scenarios.py, in one pass, using
the single shared `provision_scenario()` function -- there is no
`if scenario == "maria"` branching here or anywhere else. This is what lets
the frontend switch between María, Carlos, Elena, Roberto and Patricia (or
a brand-new "empezar desde cero" scenario) without ever restarting this
backend: all of it is just rows in one SQLite file, namespaced by user_id.

Nothing in the hackathon demo scripts (see each scenario's "presets" list
in scenarios.py) is pre-seeded as a decided transaction -- those are meant
to be fired LIVE through POST /api/transactions/simulate, so judges watch
the real Decision Engine reason about them in real time.
"""

from .database import init_db, db_cursor
from .scenarios import SCENARIOS, provision_scenario


def seed():
    init_db(reset=True)
    with db_cursor(commit=True) as cur:
        for scenario in SCENARIOS:
            provision_scenario(cur, scenario)

    print(f"Seed complete -- {len(SCENARIOS)} scenarios provisioned:")
    for s in SCENARIOS:
        print(f"  {s['emoji']}  {s['id']:10s} - {s['name']}")


if __name__ == "__main__":
    seed()
