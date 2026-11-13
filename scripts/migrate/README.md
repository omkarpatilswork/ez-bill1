# Moving the database off Lovable Cloud

Scripts for Phase 1: build the schema in the new Supabase project and load the data
from Lovable's export. They talk to Supabase only over HTTPS (Management API), so no
database password or direct Postgres connection is needed. Set `SUPABASE_ACCESS_TOKEN`
to a personal access token; in a Claude cloud session the network proxy injects it and
any placeholder works.

The export and everything made from it hold user data, password hashes included. Keep
them in `backups/` (git-ignored) or outside the repo, and never commit them.

| Step | Command |
|---|---|
| 0. Tools (pg_restore 18) | `scripts/dev/install-pg-tools.sh` |
| 1. Drift check | `scripts/migrate/schema-diff.sh backups/export.dump` (needs a local Postgres; differences become new migrations) |
| 2. Schema | `node scripts/migrate/apply-migrations.mjs <ref>` (records history like `supabase db push`) |
| 3. Convert data | `scripts/migrate/export-to-sql.py backups/export.dump backups/restore [--without-files]` |
| 4. Load + verify | `node scripts/migrate/restore-data.mjs <ref> backups/restore` |
| 5. Backfill + integrity report | `node scripts/migrate/run-sql.mjs <ref> scripts/migrate/post-restore.sql` (adds the profiles/roles the live database's missing sign-up trigger never created; every count but users/bills should be 0) |
| 6. Functions | `SUPABASE_ACCESS_TOKEN=sbp_<40 zeros in a cloud session> npx supabase functions deploy --remote=<ref> --use-api --yes` |

`restore-data.mjs` refuses to run if the project already has users or bills, loads in
one transaction with triggers off (so the sign-up trigger does not create duplicate
profiles), replaces the categories and NFC tags that migrations seed with the exported
ones (bills point at their ids), and compares row counts afterwards.

`test-restore.sh` rehearses steps 2 to 4 on a local Postgres with made-up data.
