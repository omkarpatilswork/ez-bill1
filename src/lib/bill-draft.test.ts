import { describe, expect, it } from 'vitest';
import { buildBillDescription, parseBillDescription } from './bill-format';
import { draftFromBill, draftFromReading, draftProblems, draftToRow, emptyDraft } from './bill-draft';
import { findLikelyDuplicate } from './duplicates';

const READING = {
  merchant_name: 'Blue Tokai Coffee', aggregator: 'Not Found', merchant_address: 'Koregaon Park, Pune', amount: 412, subtotal: 392.38,
  tax_amount: 19.62, tax_details: 'CGST 2.5% + SGST 2.5%', discount: null, date_time: '2026-10-19 13:20:00', bill_invoice_number: 'BT-4471',
  payment_method: 'UPI', category: 'Food & Dining', currency: 'INR',
  line_items: [{ name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 }, { name: 'Almond Croissant', quantity: 1, unit_price: 92, total_price: 92 }],
};

describe('buildBillDescription', () => {
  it('is read back unchanged by parseBillDescription', () => {
    const bill = {
      category: 'Food & Dining', aggregator: 'Swiggy', address: 'Koregaon Park, Pune', invoice: 'BT-4471', payment: 'UPI', subtotal: 392.38,
      tax: 19.62, taxDetails: 'CGST 2.5% + SGST 2.5%', discount: 20, source: 'scan' as const, notes: 'team lunch',
      items: [{ name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 }],
    };
    expect(parseBillDescription(buildBillDescription(bill))).toMatchObject(bill);
  });
  it('keeps the email subject, the subscription mark and an NFC table', () => {
    const email = parseBillDescription(buildBillDescription({ source: 'email', emailSubject: 'Your order | Swiggy', isSubscription: true, invoice: '9' }));
    expect(email).toMatchObject({ source: 'email', emailSubject: 'Your order | Swiggy', isSubscription: true, invoice: '9' });
    expect(parseBillDescription(buildBillDescription({ source: 'nfc', table: 'Table 3' }))).toMatchObject({ source: 'nfc', table: 'Table 3' });
  });
  it('cannot be broken by a "|" typed into a field', () => {
    const back = parseBillDescription(buildBillDescription({ invoice: 'A|B', notes: 'x | Tax: 999', source: 'manual' }));
    expect(back.invoice).toBe('A / B');
    expect(back.tax).toBeNull();
  });
});

describe('draftFromReading', () => {
  it('takes what the reader found', () => {
    const draft = draftFromReading(READING);
    expect(draft).toMatchObject({ merchant: 'Blue Tokai Coffee', amount: '412', date: '2026-10-19', category: 'Food & Dining', invoice: 'BT-4471', payment: 'UPI', tax: '19.62' });
    expect(draft.items).toEqual([{ name: 'Cappuccino', quantity: '2', total: '320' }, { name: 'Almond Croissant', quantity: '1', total: '92' }]);
  });
  it('leaves empty what the reader did not find, the date included', () => {
    const draft = draftFromReading({ merchant_name: 'Not Found', amount: 0, date_time: 'Not Found', bill_invoice_number: 'Not Found', payment_method: 'Not Found', category: 'Not Found' });
    expect(draft).toMatchObject({ merchant: '', amount: '', date: '', invoice: '', payment: '', discount: '' });
    expect(draftProblems(draft)).toEqual(['Name the shop', 'Enter the total', 'Pick the date']);
  });
  it('does not invent a discount when the lines and the total disagree', () => {
    expect(draftFromReading({ ...READING, amount: 300 }).discount).toBe('');
  });
  it('falls back to the given currency only when the bill names none', () => {
    expect(draftFromReading({ ...READING, currency: 'usd' }).currency).toBe('USD');
    expect(draftFromReading({ ...READING, currency: 'Not Found' }, 'AED').currency).toBe('AED');
  });
});

describe('draftToRow', () => {
  const categories = [{ id: 'c-meals', name: 'Meals' }, { id: 'c-other', name: 'Other' }];
  it('writes a row the rest of the app reads back as the same bill', () => {
    const row = draftToRow(draftFromReading(READING), 'scan', {}, categories);
    expect(row).toMatchObject({ merchant: 'Blue Tokai Coffee', amount: 412, currency: 'INR', expense_date: '2026-10-19', category_id: 'c-meals', cost_center: 'UPI', title: 'Invoice BT-4471', status: 'draft' });
    const again = draftFromBill({ ...row });
    expect(again).toMatchObject({ merchant: 'Blue Tokai Coffee', amount: '412', category: 'Food & Dining', invoice: 'BT-4471', tax: '19.62' });
    expect(again.items).toHaveLength(2);
  });
  it('keeps what the screen does not show when a bill is corrected', () => {
    const stored = { merchant: 'Netflix', amount: 649, expense_date: '2026-10-01', description: 'Category: Subscription | [Subscription] | From email: Your Netflix receipt' };
    const kept = parseBillDescription(stored.description);
    const row = draftToRow({ ...draftFromBill(stored), amount: '699' }, kept.source, kept);
    expect(row.amount).toBe(699);
    expect(row.cost_center).toBe('Subscription');
    expect(parseBillDescription(row.description)).toMatchObject({ source: 'email', emailSubject: 'Your Netflix receipt', isSubscription: true });
  });
  it('starts a typed-in bill empty', () => expect(draftProblems(emptyDraft('INR', '2026-10-19'))).toEqual(['Name the shop', 'Enter the total']));
});

describe('findLikelyDuplicate', () => {
  const bills = [
    { id: 'a', merchant: 'Blue Tokai Coffee', amount: 412, expense_date: '2026-10-19', description: 'Invoice: BT-4471 | [scan]', created_at: '2026-10-19T08:00:00Z' },
    { id: 'b', merchant: 'Namma Metro', amount: 30, expense_date: '2026-10-19', description: '[manual]', created_at: '2026-10-19T09:00:00Z' },
  ];
  it('finds the same invoice number with the same total, however it is spaced', () => {
    expect(findLikelyDuplicate({ merchant: 'BLUE TOKAI', amount: 412, date: '2026-10-20', invoice: 'bt 4471' }, bills)).toMatchObject({ bill: { id: 'a' }, reason: 'invoice' });
  });
  it('points at the same shop, total and day as a weaker match', () => {
    expect(findLikelyDuplicate({ merchant: 'namma metro', amount: 30, date: '2026-10-19' }, bills)).toMatchObject({ bill: { id: 'b' }, reason: 'same-day' });
  });
  it('lets through a different total or a different day', () => {
    expect(findLikelyDuplicate({ merchant: 'Namma Metro', amount: 45, date: '2026-10-19' }, bills)).toBeNull();
    expect(findLikelyDuplicate({ merchant: 'Namma Metro', amount: 30, date: '2026-10-18' }, bills)).toBeNull();
  });
  it('does not match a bill against itself while it is being corrected', () => {
    expect(findLikelyDuplicate({ merchant: 'Namma Metro', amount: 30, date: '2026-10-19', ignoreId: 'b' }, bills)).toBeNull();
  });
});
