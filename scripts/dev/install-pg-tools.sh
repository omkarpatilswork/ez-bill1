#!/usr/bin/env bash
# Install PostgreSQL 18 client and server tools (pg_restore, pg_dump, psql, postgres)
# from conda-forge into .tools/pg (git-ignored), without root or apt. pg_restore 18
# reads exports made by any older Postgres, e.g. Lovable Cloud's.
# Used where apt.postgresql.org is unreachable (Claude cloud sessions).
# Usage: scripts/dev/install-pg-tools.sh   then   export PATH="$PWD/.tools/pg/env/bin:$PATH"
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DEST="$ROOT/.tools/pg"
mkdir -p "$DEST/mm"
if [ ! -x "$DEST/mm/bin/micromamba" ]; then
  # micromamba is a single static binary published on conda-forge.
  curl -fsSL -o "$DEST/micromamba.tar.bz2" "https://conda.anaconda.org/conda-forge/linux-64/micromamba-2.10.0-0.tar.bz2"
  tar xjf "$DEST/micromamba.tar.bz2" -C "$DEST/mm" bin/micromamba
fi
MAMBA_ROOT_PREFIX="$DEST/mamba" "$DEST/mm/bin/micromamba" create -y -q -p "$DEST/env" -c conda-forge --override-channels "postgresql=18"
"$DEST/env/bin/pg_restore" --version
