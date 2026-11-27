#!/usr/bin/env bash
# Runs every browser test against a dev server (started here if nothing listens on 5173). Needs Playwright (see README).
# Usage: app/e2e/run-all.sh [output folder]
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/ff-e2e}"; mkdir -p "$OUT/ui"
python3 e2e/make_fixtures.py "$OUT"
started=""
if ! curl -s -o /dev/null localhost:5173; then
  npm run dev -- --port 5173 > "$OUT/dev.log" 2>&1 & started=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null localhost:5173 && break; sleep 1; done
fi
export NODE_PATH="$(npm root -g)"
failed=0
for f in e2e/*.cjs; do
  name="$(basename "$f" .cjs)"; [ "$name" = etshim ] && continue
  ok=""
  for attempt in 1 2; do # one retry: a browser test can time out on a slow machine
    if node "$f" "$OUT" > "$OUT/$name.out" 2>&1 && ! grep -q '^FAIL' "$OUT/$name.out"; then ok=1; break; fi
  done
  if [ -n "$ok" ]; then echo "ok   $name ($(grep -c '^PASS' "$OUT/$name.out") checks)"; else echo "FAIL $name"; grep -m5 '^FAIL\|Error' "$OUT/$name.out"; failed=1; fi
done
[ -n "$started" ] && kill "$started" 2>/dev/null
exit $failed
