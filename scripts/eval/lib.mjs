/**
 * Scoring for the bill-reading evaluation: pure functions, no I/O.
 *
 * One rule shapes everything here: accuracy over completeness. A field the
 * reader left empty when the bill had no such value is right; a value it made
 * up is worse than a value it missed, so the two are counted separately.
 */

export const COLUMNS = [
  'file', 'kind', 'merchant', 'date', 'total', 'invoice_number', 'payment_method', 'category',
  'subtotal', 'tax', 'discount', 'currency', 'items', 'duplicate_of', 'notes',
];

/** Fields that are compared, and what the bill reader calls each one. */
export const FIELDS = {
  merchant: 'merchant_name',
  date: 'date_time',
  total: 'amount',
  invoice_number: 'bill_invoice_number',
  payment_method: 'payment_method',
  category: 'category',
  subtotal: 'subtotal',
  tax: 'tax_amount',
  discount: 'discount',
  currency: 'currency',
};

/* ---------- CSV (quoted cells, commas and line breaks inside quotes) ---------- */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCsv(records, columns = COLUMNS) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.join(','), ...records.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/* ---------- normalising ---------- */
const EMPTY = new Set(['', 'not found', 'n/a', 'na', 'null', 'none', '-', '—', 'unknown']);
export const isEmpty = (v) => v === null || v === undefined || EMPTY.has(String(v).trim().toLowerCase());

export function num(v) {
  if (isEmpty(v)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const LEGAL = /\b(private|pvt|limited|ltd|llp|inc|co|company|india|the|restaurant|restaurants|foods?|enterprises?|technologies|services?)\b/g;
export const normMerchant = (v) => String(v ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
export const normCode = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normDate = (v) => (String(v ?? '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
const words = (v) => new Set(normMerchant(v).split(' ').filter((w) => w.length > 1));

function sameMerchant(expected, got) {
  const a = normMerchant(expected), b = normMerchant(got);
  if (!a || !b) return false;
  if (a === b) return true;
  // "Blue Tokai" against "Blue Tokai Coffee Roasters": the shorter name must be whole inside the longer one.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

/* ---------- one field ---------- */
const MONEY = new Set(['total', 'subtotal', 'tax', 'discount']);

/**
 * correct   the bill has a value and the reader got it
 * wrong     the bill has a value and the reader gave a different one
 * missed    the bill has a value and the reader left it empty
 * invented  the bill has no such value and the reader gave one
 * empty-ok  the bill has no such value and the reader left it empty
 * skipped   the answer sheet says "?": the right answer is a matter of opinion, so it is not scored
 */
export function compareField(field, expected, got) {
  if (String(expected ?? '').trim() === '?') return 'skipped';
  const want = MONEY.has(field) ? num(expected) : isEmpty(expected) ? null : String(expected).trim();
  const have = MONEY.has(field) ? num(got) : isEmpty(got) ? null : String(got).trim();
  // A discount or tax of zero is the same as none.
  const wantNone = want === null || ((field === 'discount' || field === 'tax') && want === 0);
  const haveNone = have === null || ((field === 'discount' || field === 'tax') && have === 0);
  if (wantNone) return haveNone ? 'empty-ok' : 'invented';
  if (haveNone) return 'missed';
  let same;
  if (MONEY.has(field)) same = Math.abs(want - have) <= 0.01;
  else if (field === 'merchant') same = sameMerchant(want, have);
  else if (field === 'date') same = normDate(want) !== '' && normDate(want) === normDate(have);
  else if (field === 'invoice_number') same = normCode(want) === normCode(have);
  else same = normCode(want) === normCode(have);
  return same ? 'correct' : 'wrong';
}

/* ---------- line items ---------- */
/** "2 x Cappuccino = 320; 1 x Almond Croissant = 92" */
export function parseItems(text) {
  if (isEmpty(text)) return [];
  return String(text).split(/;|\n/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(.*?)(?:\s*=\s*([\d,]+(?:\.\d+)?))?$/i);
    return { quantity: m[1] ? Number(m[1]) : 1, name: (m[2] || '').trim(), total: m[3] ? Number(m[3].replace(/,/g, '')) : null };
  }).filter((i) => i.name);
}

export const formatItems = (items) => (items || []).map((i) => `${i.quantity ?? 1} x ${i.name}${i.total_price != null ? ` = ${i.total_price}` : i.total != null ? ` = ${i.total}` : ''}`).join('; ');

function sameItem(want, have) {
  if (want.total != null && have.total != null && Math.abs(want.total - have.total) > 0.01) return false;
  const a = words(want.name), b = words(have.name);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size) >= 0.5;
}

/** How many of the bill's items the reader found, and how many it gave that are not on the bill. */
export function compareItems(expectedText, gotItems) {
  const want = parseItems(expectedText);
  const have = (gotItems || []).map((i) => ({ name: String(i.name ?? ''), quantity: Number(i.quantity) || 1, total: num(i.total_price) }));
  const used = new Set();
  let found = 0;
  for (const w of want) {
    const at = have.findIndex((h, i) => !used.has(i) && sameItem(w, h));
    if (at >= 0) { used.add(at); found += 1; }
  }
  return { expected: want.length, found, extra: have.length - used.size };
}

/* ---------- a whole run ---------- */
const pct = (a, b) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);

/**
 * answers: rows of the answer sheet. results: { [file]: { ok, ms, response } }.
 * Returns per-field counts, item recall, timing and the list of misses.
 */
export function scoreRun(answers, results) {
  const fields = Object.fromEntries(Object.keys(FIELDS).map((f) => [f, { correct: 0, wrong: 0, missed: 0, invented: 0, 'empty-ok': 0, skipped: 0 }]));
  const misses = [];
  const times = [];
  let read = 0, failed = 0, notRun = 0, keyFieldsRight = 0, itemsExpected = 0, itemsFound = 0, itemsExtra = 0;

  for (const answer of answers) {
    const result = results[answer.file];
    if (!result) { notRun += 1; continue; }
    if (!result.ok || !result.response || result.response.error) { failed += 1; misses.push({ file: answer.file, field: '(whole bill)', outcome: 'failed', expected: '', got: result.response?.error || 'no response' }); continue; }
    read += 1;
    if (Number.isFinite(result.ms)) times.push(result.ms);
    let keyRight = true;
    for (const [field, key] of Object.entries(FIELDS)) {
      const outcome = compareField(field, answer[field], result.response[key]);
      fields[field][outcome] += 1;
      if (outcome === 'wrong' || outcome === 'missed' || outcome === 'invented') {
        misses.push({ file: answer.file, field, outcome, expected: answer[field], got: result.response[key] ?? '' });
        if (field === 'merchant' || field === 'date' || field === 'total') keyRight = false;
      }
    }
    if (keyRight) keyFieldsRight += 1;
    if (String(answer.items ?? '').trim() === '?') continue;
    const items = compareItems(answer.items, result.response.line_items);
    itemsExpected += items.expected; itemsFound += items.found; itemsExtra += items.extra;
    if (items.found < items.expected || items.extra > 0) misses.push({ file: answer.file, field: 'items', outcome: 'items', expected: `${items.expected} on the bill`, got: `${items.found} found, ${items.extra} extra` });
  }

  times.sort((a, b) => a - b);
  const at = (q) => (times.length ? times[Math.min(times.length - 1, Math.floor(q * times.length))] : null);
  return {
    bills: answers.length, read, failed, notRun,
    keyFieldsRight, keyFieldsRightPct: pct(keyFieldsRight, read),
    fields: Object.fromEntries(Object.entries(fields).map(([f, c]) => {
      const present = c.correct + c.wrong + c.missed, absent = c.invented + c['empty-ok'];
      return [f, { ...c, present, correctPct: pct(c.correct, present), inventedPct: pct(c.invented, absent) }];
    })),
    items: { expected: itemsExpected, found: itemsFound, extra: itemsExtra, foundPct: pct(itemsFound, itemsExpected) },
    seconds: { median: at(0.5) === null ? null : Math.round(at(0.5) / 100) / 10, p90: at(0.9) === null ? null : Math.round(at(0.9) / 100) / 10 },
    misses,
  };
}

/** The score as a plain-language table. */
export function report(score, label) {
  const show = (v) => (v === null ? 'n/a' : `${v}%`);
  const lines = [
    `# Bill reading score: ${label}`, '',
    `${score.read} of ${score.bills} bills read. ${score.failed} failed, ${score.notRun} not run.`,
    `Merchant, date and total all right on ${score.keyFieldsRight} of ${score.read} bills (${show(score.keyFieldsRightPct)}).`,
    `Line items: ${score.items.found} of ${score.items.expected} found (${show(score.items.foundPct)}), ${score.items.extra} given that are not on the bill.`,
    `Time per bill: median ${score.seconds.median ?? 'n/a'} s, slowest tenth ${score.seconds.p90 ?? 'n/a'} s and over.`, '',
    '| Field | On the bill | Right | Wrong | Missed | Right % | Made up (bill had none) |',
    '|---|---|---|---|---|---|---|',
    ...Object.entries(score.fields).map(([f, c]) => `| ${f} | ${c.present} | ${c.correct} | ${c.wrong} | ${c.missed} | ${show(c.correctPct)} | ${c.invented} |`),
  ];
  return `${lines.join('\n')}\n`;
}
