# Starts Udyam One on http://localhost:8000 (Windows PowerShell).
# If scripts are blocked: Set-ExecutionPolicy -Scope Process Bypass
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.11+ not found. Install from python.org and tick 'Add to PATH'." }
if (-not (Test-Path .venv)) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if (-not (Test-Path frontend\dist\index.html)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "frontend/dist missing and Node.js not found. Install Node 18+." }
  Push-Location frontend; npm install; npm run build; Pop-Location
}
Set-Location backend
& ..\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
