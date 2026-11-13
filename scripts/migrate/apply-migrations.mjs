#!/usr/bin/env node
// Apply pending supabase/migrations to a Supabase project through the Management API,
// recording each in supabase_migrations.schema_migrations exactly as `supabase db push`
// does, so the Supabase CLI sees them as applied later.
//
// Each migration runs in its own transaction together with its history row: it either
// applies fully and is recorded, or not at all. Stops at the first failure.
//
// Usage: node scripts/migrate/apply-migrations.mjs <project-ref> [--dry-run]
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runSql, select, dollarTag } from "./supabase-api.mjs";

const [ref, flag] = process.argv.slice(2);
if (!ref) {
  console.error("Usage: node scripts/migrate/apply-migrations.mjs <project-ref> [--dry-run]");
  process.exit(2);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");

await runSql(ref, `
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text NOT NULL PRIMARY KEY, statements text[], name text
  );`);
const applied = new Set((await select(ref, "SELECT version FROM supabase_migrations.schema_migrations")).map((r) => r.version));

const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
const pending = files.filter((f) => !applied.has(f.split("_")[0]));
console.log(`${files.length} migrations in the repo, ${applied.size} already applied, ${pending.length} pending`);
if (flag === "--dry-run") {
  pending.forEach((f) => console.log("  pending", f));
  process.exit(0);
}

for (const f of pending) {
  const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  const sql = readFileSync(join(dir, f), "utf8");
  const tag = dollarTag(sql + name);
  try {
    await runSql(ref, `BEGIN;
${sql}
;
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('${version}', ${tag}${name}${tag}, ARRAY[${tag}${sql}${tag}]);
COMMIT;`);
    console.log("  applied", f);
  } catch (e) {
    console.error(`  FAILED ${f}\n${e.message}`);
    process.exit(1);
  }
}
console.log("done");
