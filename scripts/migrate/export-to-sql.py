#!/usr/bin/env python3
"""Turn a Lovable Cloud database export into INSERT batches for the new Supabase project.

The export is a pg_dump custom-format archive. This script asks pg_restore for its data
(never its schema: the schema comes from supabase/migrations), keeps every table in
`public` plus auth.users and auth.identities, and writes one .sql file per table with
multi-row INSERTs, plus manifest.json (columns and row counts per table, used by
restore-data.mjs to check the target and verify the load).

Nothing here talks to a database or the network. Output holds user data (including
password hashes): write it outside the repo, e.g. backups/, which is git-ignored.

Usage:
  scripts/migrate/export-to-sql.py EXPORT_FILE OUT_DIR [--without-files] [--pg-restore PATH]

--without-files  for when stored files (bill photos, warranty cards) are not moved:
                 skips expense_receipts and tag_pending_bills rows and blanks
                 warranties.image_path, so nothing points at a missing file.
"""
import argparse
import json
import os
import re
import subprocess
import sys

COPY_RE = re.compile(r'^COPY (?P<schema>[\w"]+)\.(?P<table>[\w"]+) \((?P<cols>.*)\) FROM stdin;$')
AUTH_TABLES = {"users", "identities"}
# Tables that migrations seed. restore-data.mjs empties them before loading, so the
# exported rows (with the live database's ids, which bills point at) replace the seeds.
SEEDED_TABLES = {"public.expense_categories", "public.bill_tags"}
FILE_TABLES_SKIPPED = {"public.expense_receipts", "public.tag_pending_bills"}
ESCAPES = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\"}


def unq(name: str) -> str:
    return name[1:-1].replace('""', '"') if name.startswith('"') else name


def unescape(field: str):
    """Decode one field of COPY text format."""
    if field == r"\N":
        return None
    if "\\" not in field:
        return field
    out, i = [], 0
    while i < len(field):
        c = field[i]
        if c != "\\" or i + 1 == len(field):
            out.append(c)
            i += 1
            continue
        n = field[i + 1]
        if n in ESCAPES:
            out.append(ESCAPES[n])
            i += 2
        elif n in "01234567":
            m = re.match(r"[0-7]{1,3}", field[i + 1:])
            out.append(chr(int(m.group(), 8)))
            i += 1 + len(m.group())
        elif n == "x" and re.match(r"[0-9a-fA-F]", field[i + 2:i + 3]):
            m = re.match(r"[0-9a-fA-F]{1,2}", field[i + 2:])
            out.append(chr(int(m.group(), 16)))
            i += 2 + len(m.group())
        else:
            out.append(n)
            i += 2
    return "".join(out)


def literal(v) -> str:
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def copy_blocks(lines):
    """Yield (schema, table, columns, rows) for every COPY block in pg_restore's SQL."""
    it = iter(lines)
    for line in it:
        m = COPY_RE.match(line.rstrip("\n"))
        if not m:
            continue
        cols = [c.strip() for c in m.group("cols").split(",")]
        rows = []
        for row in it:
            row = row.rstrip("\n")
            if row == "\\.":
                break
            rows.append([unescape(f) for f in row.split("\t")])
        yield unq(m.group("schema")), unq(m.group("table")), cols, rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export_file")
    ap.add_argument("out_dir")
    ap.add_argument("--without-files", action="store_true")
    ap.add_argument("--pg-restore", default=os.environ.get("PG_RESTORE", "pg_restore"))
    ap.add_argument("--rows-per-insert", type=int, default=100)
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    proc = subprocess.Popen(
        [args.pg_restore, "--data-only", "--no-owner", "--no-privileges", "-f", "-", args.export_file],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
    )
    manifest = {"tables": [], "skipped": [], "without_files": args.without_files}
    for schema, table, cols, rows in copy_blocks(proc.stdout):
        key = f"{schema}.{table}"
        wanted = schema == "public" or (schema == "auth" and table in AUTH_TABLES)
        if not wanted:
            manifest["skipped"].append({"table": key, "rows": len(rows), "reason": "not restored"})
            continue
        if args.without_files and key in FILE_TABLES_SKIPPED:
            manifest["skipped"].append({"table": key, "rows": len(rows), "reason": "--without-files"})
            continue
        if args.without_files and key == "public.warranties" and "image_path" in cols:
            ix = cols.index("image_path")
            for r in rows:
                r[ix] = None
        order = 10 if schema == "auth" else 20
        fname = f"{order}_{schema}_{table}.sql"
        with open(os.path.join(args.out_dir, fname), "w", encoding="utf-8") as f:
            f.write(f"-- {key}: {len(rows)} rows\n")
            target = f'{schema}.{table if re.fullmatch(r"[a-z_][a-z0-9_]*", table) else chr(34) + table + chr(34)}'
            for start in range(0, len(rows), args.rows_per_insert):
                batch = rows[start:start + args.rows_per_insert]
                values = ",\n".join("(" + ", ".join(literal(v) for v in r) + ")" for r in batch)
                f.write(f"INSERT INTO {target} ({', '.join(cols)}) VALUES\n{values};\n")
        manifest["tables"].append({
            "table": key,
            "columns": [unq(c) for c in cols],
            "rows": len(rows),
            "file": fname,
            "seeded": key in SEEDED_TABLES,
        })
    stderr = proc.stderr.read()
    if proc.wait() != 0:
        print(stderr, file=sys.stderr)
        print("pg_restore failed; is it at least as new as the export's Postgres version?", file=sys.stderr)
        return 1
    manifest["tables"].sort(key=lambda t: t["file"])
    with open(os.path.join(args.out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for t in manifest["tables"]:
        print(f"{t['table']:40} {t['rows']:>7} rows  -> {t['file']}")
    for s in manifest["skipped"]:
        if s["rows"]:
            print(f"{s['table']:40} {s['rows']:>7} rows  skipped ({s['reason']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
