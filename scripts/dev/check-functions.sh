#!/usr/bin/env bash
# Type-check and unit-test the Supabase edge functions with Deno.
# Remote imports (deno.land, esm.sh) are mapped to npm: equivalents, so this works
# where only the npm registry is reachable. Deno itself comes from npm.
# Usage: scripts/dev/check-functions.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO="npx -y deno@2"
MAP=$(mktemp -t import_map.XXXX.json)
trap 'rm -f "$MAP"' EXIT
cat > "$MAP" <<JSON
{ "imports": {
  "https://deno.land/std@0.168.0/http/server.ts": "$ROOT/scripts/dev/std-serve-shim.ts",
  "https://esm.sh/@supabase/supabase-js@2.39.3": "npm:@supabase/supabase-js@2.39.3",
  "https://esm.sh/@supabase/supabase-js@2": "npm:@supabase/supabase-js@2"
} }
JSON
cd "$ROOT/supabase/functions"
$DENO check --quiet --no-lock --import-map="$MAP" --node-modules-dir=none */index.ts
echo "deno check: all functions OK"
$DENO test --quiet --no-lock --import-map="$MAP" --node-modules-dir=none _shared/
