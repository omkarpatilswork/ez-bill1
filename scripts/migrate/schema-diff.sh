#!/usr/bin/env bash
# Compare the schema in a Lovable export with the schema our migrations build, to catch
# drift (changes Lovable made to the live database outside supabase/migrations).
#
# Builds two local databases: one from supabase/migrations, one from the export's
# public schema plus its auth.users triggers, storage.objects policies and realtime
# publication. Then lists every column, constraint, index, policy, function, trigger,
# view, enum, RLS flag and publication entry that differs. The live database wins: any
# difference becomes a new migration.
#
# Usage: PGHOST=... PGPORT=... PGUSER=postgres [PG_RESTORE=...] scripts/migrate/schema-diff.sh EXPORT_FILE
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
EXPORT=$1
PG_RESTORE=${PG_RESTORE:-pg_restore}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
MIG=ezbill_diff_migrations
LIVE=ezbill_diff_export

"$ROOT/scripts/dev/test-migrations.sh" "$MIG" >/dev/null
psql -qc "DROP DATABASE IF EXISTS $LIVE" -c "CREATE DATABASE $LIVE" >/dev/null 2>&1
psql -d "$LIVE" -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/dev/supabase-shim.sql" >/dev/null 2>&1

# The export's public schema. Errors for objects the shim already has are expected.
"$PG_RESTORE" --schema-only --no-owner --no-privileges -n public -d "$LIVE" "$EXPORT" 2>"$WORK/restore.err" || true
# Pieces of other schemas that belong to the app: triggers on auth.users, policies on
# storage.objects, realtime publication membership, storage buckets (data).
"$PG_RESTORE" --schema-only --no-owner --no-privileges -f "$WORK/all.sql" "$EXPORT"
python3 - "$WORK/all.sql" > "$WORK/extra.sql" <<'PY'
import re, sys
sql = open(sys.argv[1], encoding="utf-8").read()
for stmt in re.split(r";\n", sql):
    s = "\n".join(l for l in stmt.splitlines() if not l.startswith("--")).strip()
    if (re.match(r"CREATE (CONSTRAINT )?TRIGGER .* ON auth\.users", s, re.S)
            or re.match(r"CREATE POLICY .* ON storage\.objects", s, re.S)
            or re.match(r"ALTER PUBLICATION supabase_realtime ADD TABLE", s)):
        print(s + ";")
PY
psql -d "$LIVE" -q -f "$WORK/extra.sql" >/dev/null 2>>"$WORK/restore.err" || true
"$PG_RESTORE" --data-only -n storage -t buckets -f - "$EXPORT" 2>/dev/null \
  | sed -n '/^COPY storage.buckets/,/^\\\./p' > "$WORK/buckets.copy" || true

SNAP=$(cat <<'SQL'
SELECT k, regexp_replace(v, '\s+', ' ', 'g') FROM (
SELECT 'column ' || c.table_schema || '.' || c.table_name || '.' || c.column_name, c.data_type || coalesce('(' || c.udt_name || ')', '') || ' null=' || c.is_nullable || ' default=' || coalesce(c.column_default, '')
  FROM information_schema.columns c WHERE c.table_schema = 'public'
UNION ALL SELECT 'rls ' || relname, relrowsecurity::text FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
UNION ALL SELECT 'constraint ' || conrelid::regclass || ' ' || conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace = 'public'::regnamespace
UNION ALL SELECT 'index ' || indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
UNION ALL SELECT 'policy ' || schemaname || '.' || tablename || ' "' || policyname || '"', cmd || ' roles=' || roles::text || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '')
  FROM pg_policies WHERE schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects')
UNION ALL SELECT 'function ' || p.oid::regprocedure, md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE pronamespace = 'public'::regnamespace
UNION ALL SELECT 'trigger ' || tgrelid::regclass || ' ' || tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t
  JOIN pg_class r ON r.oid = t.tgrelid WHERE NOT tgisinternal AND (r.relnamespace = 'public'::regnamespace OR t.tgrelid = 'auth.users'::regclass)
UNION ALL SELECT 'view ' || viewname, md5(definition) FROM pg_views WHERE schemaname = 'public'
UNION ALL SELECT 'enum ' || t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname
UNION ALL SELECT 'publication ' || schemaname || '.' || tablename, 'supabase_realtime' FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
) snapshot(k, v)
SQL
)
psql -d "$MIG" -XAt -F $'\t' -c "$SNAP" | sort > "$WORK/mig.tsv"
psql -d "$LIVE" -XAt -F $'\t' -c "$SNAP" | sort > "$WORK/live.tsv"

python3 - "$WORK/mig.tsv" "$WORK/live.tsv" <<'PY'
import sys
def load(p):
    d = {}
    for line in open(p, encoding="utf-8"):
        k, _, v = line.rstrip("\n").partition("\t")
        d[k] = v
    return d
mig, live = load(sys.argv[1]), load(sys.argv[2])
only_live = sorted(set(live) - set(mig))
only_mig = sorted(set(mig) - set(live))
changed = sorted(k for k in set(mig) & set(live) if mig[k] != live[k])
print(f"Compared {len(live)} objects from the export with {len(mig)} from the migrations.")
for title, keys in (("In the live database but not in the migrations", only_live),
                    ("In the migrations but not in the live database", only_mig),
                    ("Different", changed)):
    if keys:
        print(f"\n{title} ({len(keys)}):")
        for k in keys:
            print(f"  {k}")
            if title == "Different":
                print(f"      live:       {live[k][:300]}")
                print(f"      migrations: {mig[k][:300]}")
if not (only_live or only_mig or changed):
    print("No drift.")
PY
if [ -s "$WORK/buckets.copy" ]; then
  echo; echo "Storage buckets in the export:"; sed -n '2,$p' "$WORK/buckets.copy" | grep -v '^\\\.' | cut -f1 | sed 's/^/  /'
fi
echo; echo "Unexpected errors while building the export copy (none listed = none):"
grep -i 'error' "$WORK/restore.err" | grep -v -e 'already exists' -e 'already member of publication' -e 'transaction_timeout' -e 'errors ignored' | head -10 | sed 's/^/  /'
