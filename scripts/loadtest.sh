#!/usr/bin/env bash
# loadtest.sh — smoke-load the API with autocannon (dev-only, never against prod).
#
# Usage: ./scripts/loadtest.sh [BASE_URL] [CONNECTIONS] [DURATION_S]
# Requires: npx autocannon (auto-installed on first run)

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
CONNECTIONS="${2:-50}"
DURATION="${3:-30}"

echo "==> load test: $BASE_URL  conns=$CONNECTIONS  duration=${DURATION}s"

if ! curl -fsS "$BASE_URL/health" > /dev/null; then
  echo "!! $BASE_URL/health unreachable — start the backend first" >&2
  exit 1
fi

echo "-- /health"
npx --yes autocannon -c "$CONNECTIONS" -d "$DURATION" "$BASE_URL/health"

echo "-- /readyz"
npx --yes autocannon -c "$CONNECTIONS" -d "$DURATION" "$BASE_URL/readyz"

echo "==> done. Interpretation guide:"
echo "    latency p99 < 500ms healthy; non-2xx rate ≈0 expected (429s on auth routes OK)."
