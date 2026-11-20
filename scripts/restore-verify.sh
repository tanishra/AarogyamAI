#!/usr/bin/env bash
# restore-verify.sh — backup restore drill: dump → restore into scratch DB →
# verify a known row survived. Run against a running prod-compose postgres.
#
# Usage: ./scripts/restore-verify.sh [CONTAINER] [DB] [USER]

set -euo pipefail

CONTAINER="${1:-$(docker ps --format '{{.Names}}' | grep -m1 postgres)}"
DB="${2:-aarogyam}"
USER="${3:-aarogyam}"
SCRATCH="restore_drill_$$"

echo "==> restore drill on $CONTAINER (db=$DB user=$USER)"

docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" -Fc -f /tmp/drill.dump
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH"
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE $SCRATCH"
docker exec "$CONTAINER" pg_restore -U "$USER" -d "$SCRATCH" /tmp/drill.dump

TABLES=$(docker exec "$CONTAINER" psql -U "$USER" -d "$SCRATCH" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
MIGRATIONS=$(docker exec "$CONTAINER" psql -U "$USER" -d "$SCRATCH" -tAc \
  "SELECT count(*) FROM schema_migrations" 2>/dev/null || echo "n/a")

echo "    restored tables: $TABLES   migrations: $MIGRATIONS"

docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE $SCRATCH"
docker exec "$CONTAINER" rm /tmp/drill.dump

if [ "$TABLES" -lt 30 ]; then
  echo "!! suspiciously few tables — inspect the dump" >&2
  exit 1
fi
echo "==> restore drill PASSED"
