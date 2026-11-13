#!/usr/bin/env bash
# Rehearse the whole restore on a local PostgreSQL server, no Supabase project needed:
#   1. build a fake "Lovable" database from the migrations and fill it with demo rows
#      (awkward text included: quotes, tabs, newlines, backslashes, ₹, JSON),
#   2. pg_dump it to a custom-format archive, like Lovable's export,
#   3. export-to-sql.py → apply-migrations.mjs into an empty database → restore-data.mjs,
#   4. check that bills still point at their categories, profiles were not duplicated,
#      and the awkward text survived byte for byte.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres [PG_DUMP=...] [PG_RESTORE=...] scripts/migrate/test-restore.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
LIVE=ezbill_fake_live
TARGET=ezbill_fake_target
PG_DUMP=${PG_DUMP:-pg_dump}
export PG_RESTORE=${PG_RESTORE:-pg_restore}

echo "1. fake live database"
"$ROOT/scripts/dev/test-migrations.sh" "$LIVE" >/dev/null
psql -d "$LIVE" -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, aud, role) VALUES
 ('11111111-1111-4111-8111-111111111111', 'aarav@example.com', '$2a$10$abcdefghijklmnopqrstuv', '{"full_name":"Aarav Mehta"}', 'authenticated', 'authenticated'),
 ('22222222-2222-4222-8222-222222222222', 'test2@example.com', '$2a$10$zyxwvutsrqponmlkjihgfe', '{"full_name":"Test O''Brien"}', 'authenticated', 'authenticated');
INSERT INTO auth.identities (user_id, provider_id, provider, identity_data) VALUES
 ('11111111-1111-4111-8111-111111111111', '1234567890', 'google', '{"sub":"1234567890","email":"aarav@example.com"}');
INSERT INTO public.expenses (id, user_id, title, merchant, amount, currency, expense_date, description, status, category_id, cost_center)
SELECT 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Bill - Blue Tokai Coffee', 'Blue Tokai Coffee', 412, 'INR', '2026-10-19',
  E'Table 3 | Payment: UPI\ttab \\ backslash \'quote\' ₹412\nnew line::ITEMS::[{"name":"Cappuccino","quantity":2,"unit_price":160,"total_price":320},{"name":"Almond Croissant","quantity":1,"unit_price":92,"total_price":92}]::END_ITEMS::',
  'draft', id, 'UPI' FROM public.expense_categories WHERE name = 'Food & Dining';
INSERT INTO public.expense_receipts (expense_id, file_path, file_name)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001/receipt.jpg', 'receipt.jpg');
INSERT INTO public.tag_pending_bills (tag_id, file_path, amount, created_by, extracted)
VALUES ('t3', '22222222-2222-4222-8222-222222222222/x.jpg', 412, '22222222-2222-4222-8222-222222222222', '{"merchant_name":"Blue Tokai Coffee","amount":412}');
SQL
psql -d "$LIVE" -tAc "SELECT 'live: '||(SELECT count(*) FROM auth.users)||' users, '||(SELECT count(*) FROM public.profiles)||' profiles (made by the sign-up trigger), '||(SELECT count(*) FROM public.expenses)||' bills'"

echo "2. export (pg_dump custom format)"
"$PG_DUMP" -Fc -f "$WORK/export.dump" -d "$LIVE"

echo "3. convert, migrate an empty target, restore"
python3 "$ROOT/scripts/migrate/export-to-sql.py" "$WORK/export.dump" "$WORK/out" >/dev/null
psql -qc "DROP DATABASE IF EXISTS $TARGET" -c "CREATE DATABASE $TARGET" >/dev/null
psql -d "$TARGET" -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/dev/supabase-shim.sql" >/dev/null 2>&1
export SUPABASE_SQL_LOCAL=$TARGET
node "$ROOT/scripts/migrate/apply-migrations.mjs" local | tail -1
node "$ROOT/scripts/migrate/apply-migrations.mjs" local | head -1   # second run: nothing pending
node "$ROOT/scripts/migrate/restore-data.mjs" local "$WORK/out" | grep -E "Columns|Loading|BAD|verified"
echo "   guard on a second run:"
node "$ROOT/scripts/migrate/restore-data.mjs" local "$WORK/out" 2>&1 | sed 's/^/   /' || true

echo "4. checks"
fail=0
check() { if [ "$(psql -d "$TARGET" -tAc "$2")" = "t" ]; then echo "   ok   $1"; else echo "   FAIL $1"; fail=1; fi; }
check "bills keep their category" "SELECT bool_and(c.id IS NOT NULL) FROM public.expenses e LEFT JOIN public.expense_categories c ON c.id = e.category_id"
ids() { psql -d "$1" -tAc "SELECT string_agg(id::text || name, ',' ORDER BY name) FROM public.expense_categories"; }
if [ "$(ids "$LIVE")" = "$(ids "$TARGET")" ]; then echo "   ok   categories are the live ones (same ids), seeds replaced"; else echo "   FAIL categories differ from live"; fail=1; fi
check "one profile per user, none extra" "SELECT (SELECT count(*) FROM public.profiles) = (SELECT count(*) FROM auth.users)"
h() { psql -d "$1" -tAc "SELECT md5(string_agg(e::text, '|' ORDER BY id)) FROM public.expenses e"; }
if [ "$(h "$LIVE")" = "$(h "$TARGET")" ] && psql -d "$TARGET" -tAc "SELECT description FROM public.expenses" | grep -q "backslash 'quote' ₹412"; then
  echo "   ok   bill rows identical to live, awkward text included (md5)"; else echo "   FAIL bill rows differ from live"; fail=1; fi
check "jsonb survived" "SELECT extracted->>'merchant_name' = 'Blue Tokai Coffee' FROM public.tag_pending_bills"
check "migration history recorded" "SELECT count(*) = $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) FROM supabase_migrations.schema_migrations"
psql -d "$TARGET" -qc "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('33333333-3333-4333-8333-333333333333', 'new@example.com', '{\"full_name\":\"New User\"}')" >/dev/null
check "sign-up trigger fires again after the load" "SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = '33333333-3333-4333-8333-333333333333')"
exit $fail
