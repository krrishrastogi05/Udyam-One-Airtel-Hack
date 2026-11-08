#!/usr/bin/env bash
# Starts Udyam One on http://localhost:8000 (API + built web app)
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
if [ ! -d .venv ]; then $PY -m venv .venv; fi
. .venv/bin/activate
pip install -q -r backend/requirements.txt
if [ ! -d frontend/dist ]; then (cd frontend && npm install && npm run build); fi
cd backend && exec uvicorn app:app --host 0.0.0.0 --port 8000
