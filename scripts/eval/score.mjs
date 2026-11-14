/**
 * Scores a run of the bill reader against the answer sheet.
 *
 *   node scripts/eval/score.mjs --init        add a row to eval/bills/answers.csv for every bill that has none
 *   node scripts/eval/score.mjs [label]       score eval/bills/runs/<label>/ (default: baseline)
 *   node scripts/eval/score.mjs [label] --only=photo-   score only the bills whose names start with the prefix
 *
 * Writes score.md, score.json and misses.csv next to the run's results.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS, parseCsv, report, scoreRun, toCsv } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const billsDir = path.join(root, 'eval/bills');
const sheet = path.join(billsDir, 'answers.csv');
const args = process.argv.slice(2);

const billFiles = () => readdirSync(billsDir, { withFileTypes: true })
  .filter((f) => f.isFile() && !f.name.startsWith('.') && f.name !== 'answers.csv').map((f) => f.name).sort();

if (args.includes('--init')) {
  const rows = existsSync(sheet) ? parseCsv(readFileSync(sheet, 'utf8')) : [];
  const known = new Set(rows.map((r) => r.file));
  const added = billFiles().filter((f) => !known.has(f));
  for (const file of added) rows.push({ file });
  // A leading BOM makes Excel open the rupee sign and other non-English text correctly.
  writeFileSync(sheet, `﻿${toCsv(rows, COLUMNS)}`);
  console.log(`${sheet}: ${rows.length} rows (${added.length} added).`);
  process.exit(0);
}

const label = args.find((a) => !a.startsWith('--')) || 'baseline';
const runDir = path.join(billsDir, 'runs', label);
if (!existsSync(sheet)) { console.error(`No answer sheet at ${sheet}. Run with --init first.`); process.exit(1); }
if (!existsSync(runDir)) { console.error(`No run called "${label}". Run scripts/eval/run.mjs ${label} first.`); process.exit(1); }

// Only rows with at least a total or a merchant filled in count as answered.
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const answers = parseCsv(readFileSync(sheet, 'utf8')).filter((r) => r.file && r.file.startsWith(only) && (r.total || r.merchant));
const results = {};
for (const name of readdirSync(runDir).filter((n) => n.endsWith('.json') && !n.startsWith('score'))) {
  const r = JSON.parse(readFileSync(path.join(runDir, name), 'utf8'));
  if (r.file) results[r.file] = r;
}

const score = scoreRun(answers, results);
const text = report(score, label);
const suffix = only ? `-${only.replace(/[^a-z0-9]+/gi, '')}` : '';
writeFileSync(path.join(runDir, `score${suffix}.md`), text);
writeFileSync(path.join(runDir, `score${suffix}.json`), JSON.stringify({ label, only, ...score }, null, 1));
writeFileSync(path.join(runDir, `misses${suffix}.csv`), `﻿${toCsv(score.misses, ['file', 'field', 'outcome', 'expected', 'got'])}`);
console.log(text);
console.log(`${score.misses.length} misses listed in ${path.join(runDir, `misses${suffix}.csv`)}`);
