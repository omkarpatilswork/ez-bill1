/**
 * One reader for the way bills are stored today.
 *
 * Until the Phase 2 schema lands, a bill's line items, invoice number,
 * payment method, tax and source are all packed into `expenses.description`:
 *
 *   Category: Food & Dining | Invoice: 123 | Payment: UPI | 2 item(s) | Subtotal: 392.38
 *   | Tax: 19.62 | [scan] | free-text notes::ITEMS::[{...}]::END_ITEMS::
 *
 * Nine files each carry their own copy of this parsing. New screens read and
 * write through this module instead (`parseBillDescription`,
 * `buildBillDescription`), so the day the real columns exist only this file
 * changes. Whatever one writes, the other reads back unchanged.
 */

export interface BillLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export type BillSource = 'nfc' | 'email' | 'scan' | 'upload' | 'manual' | 'unknown';

export interface ParsedBill {
  items: BillLineItem[];
  category: string | null;
  invoice: string | null;
  payment: string | null;
  subtotal: number | null;
  tax: number | null;
  taxDetails: string | null;
  discount: number | null;
  /** Charges that are neither a line nor tax: service charge, packing, delivery, a tip. */
  charges: number | null;
  aggregator: string | null;
  address: string | null;
  /** Subject line of the email this bill was read from. */
  emailSubject: string | null;
  /** Table label for a bill that arrived by NFC Airdrop, e.g. "Table 3". */
  table: string | null;
  source: BillSource;
  isSubscription: boolean;
  /** Whatever the person typed as a note, with the packed fields removed. */
  notes: string;
}

const ITEMS_START = '::ITEMS::';
const ITEMS_END = '::END_ITEMS::';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function parseItems(description: string): BillLineItem[] {
  const start = description.indexOf(ITEMS_START);
  if (start < 0) return [];
  const rest = description.slice(start + ITEMS_START.length);
  const end = rest.indexOf(ITEMS_END);
  try {
    const raw = JSON.parse(end >= 0 ? rest.slice(0, end) : rest);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({
        name: String(i.name ?? '').trim(),
        quantity: num(i.quantity) || 1,
        unit_price: num(i.unit_price),
        total_price: num(i.total_price),
      }))
      .filter((i) => i.name);
  } catch {
    return [];
  }
}

const positive = (v: string | null): number | null => {
  if (v == null) return null;
  const n = num(v);
  return n > 0 ? n : null;
};

export function parseBillDescription(description: string | null | undefined): ParsedBill {
  const desc = description || '';
  const items = parseItems(desc);
  const itemsAt = desc.indexOf(ITEMS_START);
  let head = itemsAt >= 0 ? desc.slice(0, itemsAt) : desc;

  // The email subject is free text and can itself contain "|", so lift it out first.
  let emailSubject: string | null = null;
  const emailMatch = head.match(/From email:\s*([\s\S]*?)(?:\s*\|\s*\[Subscription\])?\s*$/);
  if (emailMatch) {
    emailSubject = emailMatch[1].trim() || null;
    head = head.slice(0, emailMatch.index) + (/\[Subscription\]/.test(emailMatch[0]) ? ' | [Subscription]' : '');
  }

  const parts = head.split('|').map((p) => p.trim()).filter(Boolean);
  const fields: Record<string, string> = {};
  const tags = new Set<string>();
  const notes: string[] = [];
  let table: string | null = null;

  for (const part of parts) {
    const field = part.match(/^(Category|Invoice|Payment|Subtotal|Tax|TaxDetails|Discount|Charges|Aggregator|Address):\s*(.*)$/);
    if (field) { fields[field[1]] = field[2].trim(); continue; }
    const tag = part.match(/^\[(nfc|scan|upload|manual|email|Subscription)\]$/i);
    if (tag) { tags.add(tag[1].toLowerCase()); continue; }
    if (/^\d+\s*item\(s\)$/i.test(part)) continue;
    const tapped = part.match(/^Tapped at\s+(.+)$/i);
    if (tapped) { tags.add('nfc'); table = /^a table$/i.test(tapped[1].trim()) ? null : tapped[1].trim(); continue; }
    if (/^Auto-delivered via NFC tag$/i.test(part)) { tags.add('nfc'); continue; }
    notes.push(part);
  }

  let source: BillSource = 'unknown';
  if (tags.has('nfc')) source = 'nfc';
  else if (emailSubject || tags.has('email')) source = 'email';
  else if (tags.has('scan')) source = 'scan';
  else if (tags.has('upload')) source = 'upload';
  else if (tags.has('manual')) source = 'manual';

  const text = (k: string) => (fields[k] && fields[k] !== 'Not Found' ? fields[k] : null);

  return {
    items,
    category: text('Category'),
    invoice: text('Invoice'),
    payment: text('Payment'),
    subtotal: positive(text('Subtotal')),
    tax: positive(text('Tax')),
    taxDetails: text('TaxDetails'),
    discount: positive(text('Discount')),
    charges: positive(text('Charges')),
    aggregator: text('Aggregator'),
    address: text('Address'),
    emailSubject,
    table,
    source,
    isSubscription: tags.has('subscription'),
    notes: notes.join(' | '),
  };
}

/** "|" separates the packed fields, so it cannot appear inside one. */
const safe = (v: string) => v.replace(/\s*\|\s*/g, ' / ').replace(/::ITEMS::|::END_ITEMS::/g, '').trim();
const amountText = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : '');

/**
 * Pack a bill's details into `expenses.description`. The inverse of
 * `parseBillDescription`: every field given here is read back unchanged, and
 * a field left out is simply not written.
 */
export function buildBillDescription(bill: Partial<ParsedBill>): string {
  const parts: string[] = [];
  const text = (label: string, value?: string | null) => { if (value && safe(value)) parts.push(`${label}: ${safe(value)}`); };
  const items = (bill.items || []).filter((i) => i.name.trim());

  text('Category', bill.category);
  text('Aggregator', bill.aggregator);
  text('Address', bill.address);
  text('Invoice', bill.invoice);
  text('Payment', bill.payment);
  if (items.length) parts.push(`${items.length} item(s)`);
  text('Subtotal', amountText(bill.subtotal));
  text('Tax', amountText(bill.tax));
  text('TaxDetails', bill.taxDetails);
  text('Discount', amountText(bill.discount));
  text('Charges', amountText(bill.charges));
  if (bill.source === 'nfc') parts.push(bill.table ? `Tapped at ${safe(bill.table)}` : '[nfc]');
  else if (bill.source === 'scan' || bill.source === 'upload' || bill.source === 'manual') parts.push(`[${bill.source}]`);
  else if (bill.source === 'email' && !bill.emailSubject) parts.push('[email]');
  if (bill.notes && safe(bill.notes)) parts.push(safe(bill.notes));
  // The email subject goes last: it is free text, and the reader lifts it off the end.
  if (bill.emailSubject) parts.push(`From email: ${bill.emailSubject.replace(/::ITEMS::|::END_ITEMS::/g, '').trim()}`);
  if (bill.isSubscription) parts.push('[Subscription]');

  const head = parts.join(' | ');
  if (!items.length) return head;
  const packed = items.map((i) => ({ name: i.name.trim(), quantity: i.quantity || 1, unit_price: i.unit_price || 0, total_price: i.total_price || 0 }));
  return `${head}${ITEMS_START}${JSON.stringify(packed)}${ITEMS_END}`;
}

/** What the app calls each way a bill can arrive. */
export const SOURCE_LABEL: Record<BillSource, string> = {
  nfc: 'NFC Airdrop',
  email: 'Gmail',
  scan: 'Scan',
  upload: 'Upload',
  manual: 'Typed in',
  unknown: '',
};

export type BillMath =
  | { status: 'none' }
  | { status: 'ok'; itemsSum: number; viaTax: boolean }
  | { status: 'mismatch'; itemsSum: number; expected: number; diff: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Do the numbers on this bill agree with each other? The same rule the reader
 * applies on the server (`checkArithmetic` in supabase/functions/_shared/bill-rules.ts):
 * bills print their sums in several layouts, so the total may equal the lines
 * (or the printed subtotal) alone, or with any of tax, other charges and
 * discount applied. Anything else is a mismatch the person should see,
 * because one of the numbers was probably misread.
 */
export function checkBillMath(
  bill: Pick<ParsedBill, 'items' | 'tax' | 'discount'> & { charges?: number | null; subtotal?: number | null },
  total: number,
  tolerance = 1.5,
): BillMath {
  if (!bill.items.length || !(total > 0)) return { status: 'none' };
  const itemsSum = round2(bill.items.reduce((s, i) => s + (i.total_price || 0), 0));
  if (Math.abs(itemsSum - total) <= tolerance) return { status: 'ok', itemsSum, viaTax: false };
  const tax = bill.tax || 0, charges = bill.charges || 0, discount = Math.abs(bill.discount || 0);
  const candidates: number[] = [];
  for (const base of [itemsSum, bill.subtotal || null]) {
    if (base === null) continue;
    for (const less of [0, discount]) candidates.push(base - less, base - less + tax, base - less + tax + charges, base - less + charges);
  }
  const closest = candidates.reduce((best, c) => (Math.abs(total - c) < Math.abs(total - best) ? c : best), candidates[0]);
  if (Math.abs(total - closest) <= tolerance) return { status: 'ok', itemsSum, viaTax: true };
  // What the lines come to once tax, charges and discount are applied, against the total printed.
  const withAll = round2(itemsSum + tax + charges - discount);
  return { status: 'mismatch', itemsSum, expected: total, diff: round2(total - withAll) };
}

/** True when quantity x unit price equals the line total, so the unit price is safe to show. */
export function lineAddsUp(item: BillLineItem, tolerance = 0.5): boolean {
  return item.unit_price > 0 && Math.abs(item.quantity * item.unit_price - item.total_price) <= tolerance;
}

/** ₹ amounts the Indian way: 1,25,916. Paise shown only when asked for. */
export function formatAmount(amount: number, opts: { paise?: boolean; symbol?: string } = {}): string {
  const { paise = true, symbol = '₹' } = opts;
  const n = Number(amount) || 0;
  return symbol + n.toLocaleString('en-IN', paise
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 });
}
