#!/usr/bin/env bash
# Generate every panel in parallel: bash gen_all.sh [names...]
cd "$(dirname "$0")"
PY=../../.venv/Scripts/python.exe
declare -A AR=([02_problem]=4:3 [03_solution]=16:9 [04_architecture]=16:9 [05_competitive]=21:9 [06_feasibility]=21:9 [07_impact]=21:9)
names=("$@"); [ ${#names[@]} -eq 0 ] && names=("${!AR[@]}")
for n in "${names[@]}"; do
  PYTHONUTF8=1 timeout 280 "$PY" gen_panel.py "prompts/$n.txt" "panels/$n.png" "${AR[$n]}" > "panels/$n.log" 2>&1 &
done
wait
for n in "${names[@]}"; do echo "$n: $(tail -1 panels/$n.log)"; done
