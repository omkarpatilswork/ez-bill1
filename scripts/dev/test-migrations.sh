#!/usr/bin/env bash
# Apply every file in supabase/migrations, in order, to a fresh database on a local
# PostgreSQL server, after a minimal stand-in for Supabase's auth/storage schemas.
# Catches ordering and syntax errors without Docker or a Supabase project.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/dev/test-migrations.sh [dbname]
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DB=${1:-ezbill_migration_test}
psql -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/dev/supabase-shim.sql" >/dev/null 2>&1 || { echo "shim failed"; exit 1; }
n=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  out=$(psql -d "$DB" -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" 2>&1) || {
    echo "FAILED: $(basename "$f")"; echo "$out" | grep -v NOTICE | head -5; exit 1; }
  n=$((n+1))
done
echo "applied $n migrations to $DB"
psql -d "$DB" -tAc "select 'public tables: '||count(*)||', without RLS: '||count(*) filter (where not rowsecurity) from pg_tables where schemaname='public'"
psql -d "$DB" -tAc "select 'buckets: '||string_agg(id, ', ' order by id) from storage.buckets"
