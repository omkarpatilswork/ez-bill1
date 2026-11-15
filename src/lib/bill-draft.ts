/**
 * A bill while it is being checked, before it is saved: what the review
 * screen edits. Every source (scan, upload, typed in, an existing bill being
 * corrected) becomes one of these, so there is one screen and one save.
 *
 * Rule: a field the reader could not find stays empty. Nothing is filled in
 * with a guess the person might not notice, the date included.
 */
import { BROAD_CATEGORIES, billCategory, toBroadCategory, type BroadCategory } from '@/lib/bill-category';
import { buildBillDescription, parseBillDescription, type BillLineItem, type BillSource, type ParsedBill } from '@/lib/bill-format';
import { smartCategoryFromMerchant } from '@/lib/smart-category';

export interface DraftItem { name: string; quantity: string; total: string }

export interface BillDraft {
  merchant: string;
  amount: string;
  date: string;
  category: BroadCategory;
  payment: string;
  invoice: string;
  subtotal: string;
  tax: string;
  taxDetails: string;
  discount: string;
  /** Service charge, packing, delivery, a tip: on the bill, but neither a line nor tax. */
  charges: string;
  currency: string;
  aggregator: string;
  address: string;
  notes: string;
  items: DraftItem[];
}

const found = (v: unknown): string => {
  const s = v == null ? '' : String(v).trim();
  return !s || /^not found$/i.test(s) || /^(null|undefined|n\/a)$/i.test(s) ? '' : s;
};
const money = (v: unknown): string => {
  const s = found(v);
  if (!s) return '';
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : '';
};
export const toNumber = (v: string): number => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function emptyDraft(currency = 'INR', date = ''): BillDraft {
  return {
    merchant: '', amount: '', date, category: 'Other', payment: '', invoice: '', subtotal: '', tax: '', taxDetails: '',
    discount: '', charges: '', currency, aggregator: '', address: '', notes: '', items: [],
  };
}

/** What the reader sent back, as a draft. `fallbackCurrency` is used when the bill does not say. */
export function draftFromReading(data: Record<string, unknown> | null | undefined, fallbackCurrency = 'INR'): BillDraft {
  const d = data || {};
  const merchant = found(d.merchant_name);
  const said = found(d.category);
  const guess = merchant ? smartCategoryFromMerchant(merchant, said) : '';
  const category = said && toBroadCategory(said) !== 'Other' ? toBroadCategory(said) : toBroadCategory(guess || said || 'Other');
  const currency = found(d.currency).toUpperCase();
  const date = found(d.date_time).slice(0, 10);
  const lines = Array.isArray(d.line_items) ? d.line_items : [];
  return {
    merchant,
    amount: money(d.amount),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    category,
    payment: found(d.payment_method),
    invoice: found(d.bill_invoice_number),
    subtotal: money(d.subtotal),
    tax: money(d.tax_amount),
    taxDetails: found(d.tax_details),
    discount: money(d.discount),
    charges: money(d.charges),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : fallbackCurrency,
    aggregator: found(d.aggregator),
    address: found(d.merchant_address),
    notes: '',
    items: lines.filter((i) => i && typeof i === 'object' && found((i as Record<string, unknown>).name)).map((i) => {
      const item = i as Record<string, unknown>;
      return { name: found(item.name), quantity: String(Number(item.quantity) || 1), total: money(item.total_price) || money(Number(item.unit_price) * (Number(item.quantity) || 1)) };
    }),
  };
}

interface StoredBill {
  merchant?: string | null;
  title?: string | null;
  amount: number;
  currency?: string | null;
  expense_date: string;
  description?: string | null;
  cost_center?: string | null;
}

/** An existing bill, opened to be corrected. */
export function draftFromBill(bill: StoredBill): BillDraft {
  const parsed = parseBillDescription(bill.description);
  const text = (n: number | null) => (n ? String(n) : '');
  return {
    merchant: bill.merchant || bill.title || '',
    amount: String(Number(bill.amount) || ''),
    date: bill.expense_date.slice(0, 10),
    category: billCategory(bill),
    payment: parsed.payment || '',
    invoice: parsed.invoice || '',
    subtotal: text(parsed.subtotal),
    tax: text(parsed.tax),
    taxDetails: parsed.taxDetails || '',
    discount: text(parsed.discount),
    charges: text(parsed.charges),
    currency: bill.currency || 'INR',
    aggregator: parsed.aggregator || '',
    address: parsed.address || '',
    notes: parsed.notes,
    items: parsed.items.map((i) => ({ name: i.name, quantity: String(i.quantity || 1), total: String(i.total_price || '') })),
  };
}

export function draftItems(draft: BillDraft): BillLineItem[] {
  return draft.items.filter((i) => i.name.trim()).map((i) => {
    const quantity = toNumber(i.quantity) || 1;
    const total = toNumber(i.total);
    return { name: i.name.trim(), quantity, total_price: total, unit_price: Math.round((total / quantity) * 100) / 100 };
  });
}

/** What still stops this draft from being saved, in the person's words. Empty when it can be saved. */
export function draftProblems(draft: BillDraft): string[] {
  const problems: string[] = [];
  if (!draft.merchant.trim()) problems.push('Name the shop');
  if (!(toNumber(draft.amount) > 0)) problems.push('Enter the total');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) problems.push('Pick the date');
  return problems;
}

/**
 * The row to write to `expenses`. `keep` carries what the review screen does
 * not show (the email subject, the table an NFC bill came from, the
 * subscription mark), so correcting a bill never drops them.
 */
export function draftToRow(draft: BillDraft, source: BillSource, keep: Partial<ParsedBill> = {}, categories: { id: string; name: string }[] = []) {
  const items = draftItems(draft);
  const category = BROAD_CATEGORIES.includes(draft.category) ? draft.category : 'Other';
  const invoice = draft.invoice.trim();
  return {
    title: invoice ? `Invoice ${invoice}` : `Bill - ${draft.merchant.trim()}`,
    merchant: draft.merchant.trim(),
    amount: Math.round(toNumber(draft.amount) * 100) / 100,
    currency: draft.currency || 'INR',
    expense_date: draft.date,
    category_id: categories.find((c) => toBroadCategory(c.name) === category)?.id ?? null,
    // Older screens still read the payment method from this column.
    cost_center: keep.isSubscription ? 'Subscription' : draft.payment.trim(),
    description: buildBillDescription({
      ...keep,
      category, source,
      aggregator: draft.aggregator, address: draft.address, invoice, payment: draft.payment,
      subtotal: toNumber(draft.subtotal) || null, tax: toNumber(draft.tax) || null, taxDetails: draft.taxDetails,
      discount: toNumber(draft.discount) || null, charges: toNumber(draft.charges) || null, notes: draft.notes, items,
    }),
    status: 'draft', // every bill is a "draft": a leftover name, see AGENTS.md
  };
}
