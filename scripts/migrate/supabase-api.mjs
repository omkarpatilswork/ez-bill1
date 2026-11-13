// Run SQL on a Supabase project over HTTPS through the Management API, so no database
// password or direct Postgres connection is needed.
//
// Needs SUPABASE_ACCESS_TOKEN (a personal access token from
// supabase.com/dashboard/account/tokens). In a Claude cloud session the network proxy
// injects the real token, so any placeholder value works there.
//
// For tests, SUPABASE_SQL_LOCAL=<psql database name> runs the SQL with local psql
// instead (PGHOST/PGPORT/PGUSER as usual), and the project ref is ignored.
import { execFileSync } from "node:child_process";

const API = "https://api.supabase.com/v1";

/**
 * Run `query` (one or more statements). Resolves to the rows of the last statement,
 * or [] when it returns none. Throws with the server's message on failure.
 */
export async function runSql(ref, query) {
  const local = process.env.SUPABASE_SQL_LOCAL;
  if (local) return runLocal(local, query);

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN (any placeholder in a Claude cloud session)");
  const res = await fetch(`${API}/projects/${encodeURIComponent(ref)}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 2000)}`);
  try {
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

/** Rows of a single SELECT, as objects. */
export async function select(ref, query) {
  if (process.env.SUPABASE_SQL_LOCAL) {
    const out = runLocal(process.env.SUPABASE_SQL_LOCAL, `SELECT coalesce(json_agg(_r), '[]') FROM (${query}) _r`, true);
    return out;
  }
  return runSql(ref, query);
}

function runLocal(db, query, json = false) {
  const out = execFileSync("psql", ["-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return json ? JSON.parse(out.trim() || "[]") : [];
}

/** A dollar-quote tag that does not occur in `text`. */
export function dollarTag(text) {
  let tag = "$m$";
  for (let i = 0; text.includes(tag); i++) tag = `$m${i}$`;
  return tag;
}
