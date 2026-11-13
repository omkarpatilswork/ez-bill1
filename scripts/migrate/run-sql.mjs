#!/usr/bin/env node
// Run a SQL file on a Supabase project through the Management API and print the rows
// of its last statement. Usage: node scripts/migrate/run-sql.mjs <project-ref> <file.sql>
import { readFileSync } from "node:fs";
import { runSql } from "./supabase-api.mjs";

const [ref, file] = process.argv.slice(2);
if (!ref || !file) {
  console.error("Usage: node scripts/migrate/run-sql.mjs <project-ref> <file.sql>");
  process.exit(2);
}
console.table(await runSql(ref, readFileSync(file, "utf8")));
