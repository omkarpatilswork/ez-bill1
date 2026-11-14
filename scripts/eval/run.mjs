/**
 * Sends every bill in eval/bills/ to the bill reader exactly as the app does,
 * and saves what comes back. It reads only: nothing is written to the database.
 *
 *   EVAL_EMAIL=... EVAL_PASSWORD=... node scripts/eval/run.mjs [label] [--force] [--delay=4500] [--only=photo-] [--max-edge=2400] [--function=name]
 *
 * --only=prefix    read only the files whose names start with the prefix
 * --function=name  call another deployed reader, e.g. extract-receipt-next (default: extract-receipt)
 * --max-edge=N     shrink photos to at most N pixels on the long side first, as the app does
 *                  before upload (needs ImageMagick's `convert`); used to measure that step
 *
 * Results land in eval/bills/runs/<label>/ (git-ignored, like the bills).
 * A bill that was already read is skipped unless --force is given, so an
 * interrupted run can be continued and failed bills are retried. In the cloud container, start Node with
 * NODE_USE_ENV_PROXY=1 so requests go through the session's proxy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) || 'baseline';
const force = args.includes('--force');
const option = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const delay = Number(option('delay')) || 4500;
const only = option('only') || '';
const maxEdge = Number(option('max-edge')) || 0;
const fn = option('function') || 'extract-receipt';

const env = readFileSync(path.join(root, '.env'), 'utf8');
const read = (key) => (env.match(new RegExp(`${key}="?([^"\\n]+)"?`)) || [])[1];
const URL_BASE = read('VITE_SUPABASE_URL');
const ANON = read('VITE_SUPABASE_PUBLISHABLE_KEY');
const { EVAL_EMAIL, EVAL_PASSWORD } = process.env;
if (!EVAL_EMAIL || !EVAL_PASSWORD) { console.error('Set EVAL_EMAIL and EVAL_PASSWORD (the demo account).'); process.exit(1); }

const billsDir = path.join(root, 'eval/bills');
const outDir = path.join(billsDir, 'runs', label);
mkdirSync(outDir, { recursive: true });

export const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const TEXT = new Set(['.txt', '.eml', '.html', '.htm']);
const files = existsSync(billsDir)
  ? readdirSync(billsDir, { withFileTypes: true }).filter((f) => f.isFile() && !f.name.startsWith('.') && f.name !== 'answers.csv' && f.name.startsWith(only)).map((f) => f.name).sort()
  : [];
if (files.length === 0) { console.error(`No bills in ${billsDir}.`); process.exit(1); }

async function signIn() {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EVAL_EMAIL, password: EVAL_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);
  return (await res.json()).access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = await signIn();
let done = 0, skipped = 0, unsupported = 0;

for (const file of files) {
  const out = path.join(outDir, `${file}.json`);
  // Done means read: a bill that failed last time (the provider was busy) is tried again.
  if (existsSync(out) && !force && JSON.parse(readFileSync(out, 'utf8')).ok) { skipped += 1; continue; }
  const ext = path.extname(file).toLowerCase();
  let body;
  if (TYPES[ext] && maxEdge && ext !== '.pdf') {
    // Same treatment as src/lib/image-prep.ts: fit inside maxEdge, JPEG at quality 85.
    const shrunk = execFileSync('convert', [path.join(billsDir, file), '-auto-orient', '-resize', `${maxEdge}x${maxEdge}>`, '-quality', '85', 'jpg:-'], { maxBuffer: 64 * 1024 * 1024 });
    body = { file_base64: shrunk.toString('base64'), file_type: 'image/jpeg' };
  } else if (TYPES[ext]) body = { file_base64: readFileSync(path.join(billsDir, file)).toString('base64'), file_type: TYPES[ext] };
  else if (TEXT.has(ext)) body = { text_content: readFileSync(path.join(billsDir, file), 'utf8'), source_hint: 'email' };
  else { unsupported += 1; console.log(`skip  ${file} (the app cannot read ${ext || 'this'} files; convert it to JPG or PDF)`); continue; }

  const call = () => fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const started = Date.now();
  let res = await call();
  if (res.status === 401) { token = await signIn(); res = await call(); }
  const ms = Date.now() - started;
  let response = null;
  try { response = await res.json(); } catch { /* not JSON: recorded as a failure below */ }
  const ok = res.ok && response !== null && !response.error;
  writeFileSync(out, JSON.stringify({ file, ok, status: res.status, ms, response }, null, 1));
  done += 1;
  console.log(`${ok ? 'read ' : 'FAIL '} ${file}  ${(ms / 1000).toFixed(1)} s`);
  await sleep(delay);
}
console.log(`\n${done} sent, ${skipped} already done, ${unsupported} unsupported. Results: ${outDir}`);
