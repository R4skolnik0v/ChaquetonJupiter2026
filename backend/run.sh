#!/usr/bin/env bash
# Starts the API on http://localhost:8000
# Creates and seeds the SQLite database on first run.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
python3 -m app.seed
uvicorn app.main:app --reload --port 8000
