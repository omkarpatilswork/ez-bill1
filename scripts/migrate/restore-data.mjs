#!/usr/bin/env node
// Load the output of export-to-sql.py into a Supabase project, then check row counts.
//
// Safety: refuses to run unless the target has no users and no bills, so it can only
// fill a freshly migrated project and never overwrites anyone's data.
//
// - Checks first that every exported column exists in the target and is not a
//   generated column; stops with a list if not (schema drift).
// - Loads everything in one transaction with session_replication_role = replica, so
//   triggers (on_auth_user_created) and foreign-key checks do not fire during the load.
// - Tables that migrations seed (expense_categories, bill_tags) are emptied first, so
//   the exported rows, with the ids that restored bills point at, replace the seeds.
// - Afterwards compares row counts with the manifest.
//
// Usage: node scripts/migrate/restore-data.mjs <project-ref> <dir-from-export-to-sql> [--dry-run]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSql, select } from "./supabase-api.mjs";

const [ref, dir, flag] = process.argv.slice(2);
if (!ref || !dir) {
  console.error("Usage: node scripts/migrate/restore-data.mjs <project-ref> <dir> [--dry-run]");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const q = (name) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`);
const qualified = (key) => key.split(".").map(q).join(".");

// 1. Fresh-target guard.
const [guard] = await select(ref, `SELECT
  (SELECT count(*) FROM auth.users)::int AS users,
  (SELECT count(*) FROM public.expenses)::int AS bills`);
if (guard.users !== 0 || guard.bills !== 0) {
  console.error(`Target already has ${guard.users} users and ${guard.bills} bills. Refusing to load over existing data.`);
  process.exit(1);
}

// 2. Column check.
const cols = await select(ref, `SELECT table_schema || '.' || table_name AS t, column_name AS c, is_generated AS g
  FROM information_schema.columns
  WHERE table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users', 'identities'))`);
const target = new Map();
for (const r of cols) {
  if (!target.has(r.t)) target.set(r.t, new Map());
  target.get(r.t).set(r.c, r.g);
}
const problems = [];
for (const t of manifest.tables) {
  const tc = target.get(t.table);
  if (!tc) { problems.push(`${t.table}: table missing in target`); continue; }
  for (const c of t.columns) {
    if (!tc.has(c)) problems.push(`${t.table}.${c}: column missing in target`);
    else if (tc.get(c) === "ALWAYS") problems.push(`${t.table}.${c}: generated column in target`);
  }
}
if (problems.length) {
  console.error("Schema drift between the export and the target:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Columns OK for ${manifest.tables.length} tables.`);

// 3. Load.
const parts = ["BEGIN;", "SET LOCAL session_replication_role = replica;"];
for (const t of manifest.tables) {
  if (t.seeded) parts.push(`DELETE FROM ${qualified(t.table)};`);
  parts.push(readFileSync(join(dir, t.file), "utf8"));
}
parts.push("COMMIT;");
const sql = parts.join("\n");
console.log(`Loading ${manifest.tables.reduce((n, t) => n + t.rows, 0)} rows (${(sql.length / 1024).toFixed(0)} KB) in one transaction${flag === "--dry-run" ? " [dry run: not sent]" : ""}`);
if (flag !== "--dry-run") await runSql(ref, sql);

// 4. Verify.
const countSql = manifest.tables
  .map((t) => `SELECT '${t.table}' AS t, count(*)::int AS n FROM ${qualified(t.table)}`)
  .join(" UNION ALL ");
const counts = new Map((await select(ref, countSql)).map((r) => [r.t, r.n]));
let ok = true;
for (const t of manifest.tables) {
  const n = counts.get(t.table);
  const good = flag === "--dry-run" || n === t.rows;
  ok &&= good;
  console.log(`${good ? "ok " : "BAD"} ${t.table.padEnd(40)} expected ${String(t.rows).padStart(6)}  found ${String(n).padStart(6)}`);
}
if (!ok) process.exit(1);
console.log(flag === "--dry-run" ? "Dry run finished." : "Restore verified: row counts match the export.");
