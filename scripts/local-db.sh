#!/bin/bash
# Recreates a local "trainer" Postgres (16) for testing migrations:
# a stub of Supabase (roles, auth, vault, cron, net) + the pre-migration base
# tables (scripts/local-db-bootstrap.sql), then every migration in order
# (pg_cron / pg_net "create extension" lines stripped: the stubs stand in).
# Cloud container: run as root after `pg_ctlcluster 16 main start`.
#   scripts/local-db.sh && su postgres -c "psql -d trainer"
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PSQL=(su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d trainer")
su postgres -c "dropdb --if-exists trainer && createdb trainer"
"${PSQL[@]}" < "$ROOT/scripts/local-db-bootstrap.sql" 2>&1 | grep -v "wal_level\|HINT" || true
for f in "$ROOT"/supabase/migrations/*.sql; do
  sed -E 's/^create extension if not exists (pg_cron|pg_net)[^;]*;//' "$f" | "${PSQL[@]}" >/dev/null 2>&1 \
    || { echo "FAILED: $f"; exit 1; }
done
echo "trainer DB ready ($(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations)"
