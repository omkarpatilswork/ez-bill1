#!/usr/bin/env node
// Copy every row (and, with --files, every stored file) from one Supabase project to
// another that already has the same schema (apply-migrations.mjs first). Over HTTPS
// only: rows through the Management API, files through each project's Storage API.
//
// Safety:
// - Refuses unless the target has no users and no bills, so it only fills a fresh project.
// - Reads the source only. Never writes to it.
// - Copies only columns present in both projects and not generated; stops on drift.
// - One transaction with session_replication_role = replica, so the sign-up trigger and
//   foreign-key checks do not fire while loading. Tables that migrations seed
//   (expense_categories, bill_tags) are emptied first so the source's ids win.
// - Prints counts, never row contents or keys.
//
// Usage: node scripts/migrate/copy-project.mjs <from-ref> <to-ref|-> [--dry-run] [--files]
//   <to-ref> "-" with --dry-run reads the source only (counts and column list).
import { runSql, select, dollarTag } from "./supabase-api.mjs";

const [from, to, ...flags] = process.argv.slice(2);
const dry = flags.includes("--dry-run");
const withFiles = flags.includes("--files");
if (!from || !to || (to === "-" && !dry)) {
  console.error("Usage: node scripts/migrate/copy-project.mjs <from-ref> <to-ref|-> [--dry-run] [--files]");
  process.exit(2);
}
const SEEDED = new Set(["public.expense_categories", "public.bill_tags"]);
const q = (n) => (/^[a-z_][a-z0-9_]*$/.test(n) ? n : `"${n.replace(/"/g, '""')}"`);
const qt = (t) => t.split(".").map(q).join(".");

const TABLES_SQL = `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
  WHERE (table_schema = 'public' AND table_type = 'BASE TABLE')
     OR (table_schema = 'auth' AND table_name IN ('users', 'identities'))
  ORDER BY 1`;
const COLS_SQL = `SELECT table_schema || '.' || table_name AS t, column_name AS c, is_generated AS g
  FROM information_schema.columns
  WHERE table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users', 'identities'))
  ORDER BY table_schema, table_name, ordinal_position`;

async function columns(ref) {
  const map = new Map();
  for (const r of await select(ref, COLS_SQL)) {
    if (!map.has(r.t)) map.set(r.t, []);
    map.get(r.t).push({ c: r.c, generated: r.g === "ALWAYS" });
  }
  return map;
}

// 1. Fresh-target guard.
if (to !== "-") {
  const [g] = await select(to, `SELECT (SELECT count(*) FROM auth.users)::int AS users, (SELECT count(*) FROM public.expenses)::int AS bills`);
  if (g.users !== 0 || g.bills !== 0) {
    console.error(`Target ${to} already has ${g.users} users and ${g.bills} bills. Refusing to copy over existing data.`);
    process.exit(1);
  }
}

// 2. Tables and columns on both sides.
const tables = (await select(from, TABLES_SQL)).map((r) => r.t);
const srcCols = await columns(from);
const dstCols = to === "-" ? null : await columns(to);
const plan = [];
const drift = [];
for (const t of tables) {
  const src = srcCols.get(t).filter((c) => !c.generated).map((c) => c.c);
  if (!dstCols) { plan.push({ t, cols: src }); continue; }
  const dst = dstCols.get(t);
  if (!dst) { drift.push(`${t}: missing in target`); continue; }
  const dstUsable = new Set(dst.filter((c) => !c.generated).map((c) => c.c));
  const missing = src.filter((c) => !dstUsable.has(c));
  // Auth tables may gain columns between Supabase versions; a column only the target has keeps its default.
  if (missing.length) drift.push(`${t}: ${missing.join(", ")} not in target`);
  plan.push({ t, cols: src.filter((c) => dstUsable.has(c)) });
}
if (drift.length) {
  console.error("Schema differs between the projects:\n  " + drift.join("\n  "));
  process.exit(1);
}

// 3. Read the source, one table at a time.
const parts = ["BEGIN;", "SET LOCAL session_replication_role = replica;"];
const expected = new Map();
let rows = 0;
for (const { t, cols } of plan) {
  const list = cols.map(q).join(", ");
  const [r] = await select(from, `SELECT count(*)::int AS n, coalesce(json_agg(x), '[]'::json) AS data FROM (SELECT ${list} FROM ${qt(t)}) x`);
  expected.set(t, r.n);
  rows += r.n;
  if (SEEDED.has(t)) parts.push(`DELETE FROM ${qt(t)};`);
  if (r.n === 0) continue;
  const json = JSON.stringify(r.data);
  const tag = dollarTag(json);
  parts.push(`INSERT INTO ${qt(t)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${qt(t)}, ${tag}${json}${tag});`);
}
parts.push("COMMIT;");
const sql = parts.join("\n");
console.log(`${plan.length} tables, ${rows} rows, ${(sql.length / 1024).toFixed(0)} KB of SQL${dry ? " [dry run: nothing written]" : ""}`);

// 4. Load and verify.
if (!dry) {
  await runSql(to, sql);
  const counts = new Map((await select(to, plan.map(({ t }) => `SELECT '${t}' AS t, count(*)::int AS n FROM ${qt(t)}`).join(" UNION ALL "))).map((r) => [r.t, r.n]));
  let ok = true;
  for (const { t } of plan) {
    const good = counts.get(t) === expected.get(t);
    ok &&= good;
    if (!good || expected.get(t) > 0) console.log(`${good ? "ok " : "BAD"} ${t.padEnd(40)} ${String(expected.get(t)).padStart(5)} -> ${String(counts.get(t)).padStart(5)}`);
  }
  if (!ok) { console.error("Row counts differ."); process.exit(1); }
  console.log("Rows copied and counts match.");
} else {
  for (const { t } of plan) if (expected.get(t) > 0) console.log(`    ${t.padEnd(40)} ${String(expected.get(t)).padStart(5)}`);
}

// 5. Stored files (receipts, warranty cards, pending NFC bills).
if (withFiles || dry) {
  const objects = await select(from, `SELECT bucket_id AS b, name AS n, coalesce(metadata->>'mimetype', 'application/octet-stream') AS m FROM storage.objects ORDER BY 1, 2`);
  const byBucket = objects.reduce((a, o) => ({ ...a, [o.b]: (a[o.b] || 0) + 1 }), {});
  console.log(`Stored files in the source: ${objects.length} ${JSON.stringify(byBucket)}`);
  if (withFiles && !dry) {
    const key = async (ref) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
      if (!res.ok) throw new Error(`api-keys for ${ref}: HTTP ${res.status}`);
      const keys = await res.json();
      const k = keys.find((x) => x.name === "service_role") || keys.find((x) => x.type === "secret");
      if (!k?.api_key) throw new Error(`no service key for ${ref}`);
      return k.api_key;
    };
    const [fromKey, toKey] = [await key(from), await key(to)];
    const auth = (k) => ({ Authorization: `Bearer ${k}`, apikey: k });
    let copied = 0;
    const failed = [];
    for (const o of objects) {
      const path = `${encodeURIComponent(o.b)}/${o.n.split("/").map(encodeURIComponent).join("/")}`;
      const down = await fetch(`https://${from}.supabase.co/storage/v1/object/${path}`, { headers: auth(fromKey) });
      if (!down.ok) { failed.push(`${o.b}/${o.n}: download ${down.status}`); continue; }
      const body = Buffer.from(await down.arrayBuffer());
      const up = await fetch(`https://${to}.supabase.co/storage/v1/object/${path}`, {
        method: "POST", headers: { ...auth(toKey), "Content-Type": o.m, "x-upsert": "true" }, body,
      });
      if (!up.ok) { failed.push(`${o.b}/${o.n}: upload ${up.status}`); continue; }
      copied++;
    }
    console.log(`Files copied: ${copied} of ${objects.length}`);
    if (failed.length) { console.error("Not copied:\n  " + failed.slice(0, 20).join("\n  ")); process.exit(1); }
  }
}
