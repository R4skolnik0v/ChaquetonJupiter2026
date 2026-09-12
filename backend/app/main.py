"""
main.py
--------
Entry point. Run with:  uvicorn app.main:app --reload --port 8000
(or just ./run.sh from the backend/ folder, which also seeds the database).

Architecture reminder (see README.md for the full diagram):

  Capital One / Nessie  ->  Transaction Parser  ->  Mission/Permission Engine
       ->  Behavioral Analysis  ->  Risk Engine  ->  Decision Engine
       ->  APPROVE / REVIEW / BLOCK  ->  Audit Log

This prototype mocks the Nessie layer (see seed.py) but every router past
that point -- missions, transactions, decision engine, audit log -- is the
real logic, built so the Nessie mock can be swapped for a live API call
without touching anything downstream of `transactions.py`.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .routers import users, missions, transactions, audit, trust, continuity, scenarios, exceptions

app = FastAPI(title="Money Companion API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(missions.router)
app.include_router(transactions.router)
app.include_router(audit.router)
app.include_router(trust.router)
app.include_router(continuity.router)
app.include_router(scenarios.router)
app.include_router(exceptions.router)


@app.on_event("startup")
def on_startup():
    init_db(reset=False)  # seed.py handles a full reset; this just ensures tables exist


@app.get("/api/health")
def health():
    return {"status": "ok"}
