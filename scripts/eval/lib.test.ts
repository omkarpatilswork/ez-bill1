import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the Node scripts
import { compareField, compareItems, parseCsv, parseItems, scoreRun, toCsv } from './lib.mjs';

describe('csv', () => {
  it('round-trips cells with commas, quotes and line breaks', () => {
    const rows = [{ file: 'a.jpg', merchant: 'Social, "KP"', items: '2 x Tea = 40;\n1 x Bun = 15' }];
    expect(parseCsv(toCsv(rows, ['file', 'merchant', 'items']))).toEqual(rows);
  });
  it('reads a sheet saved by Excel (BOM, CRLF, blank lines)', () => {
    expect(parseCsv('﻿file,total\r\na.jpg,412\r\n\r\n')).toEqual([{ file: 'a.jpg', total: '412' }]);
  });
});

describe('compareField', () => {
  it('scores money to the paisa', () => {
    expect(compareField('total', '412', 412.0)).toBe('correct');
    expect(compareField('total', '284.55', 271)).toBe('wrong');
    expect(compareField('total', '412', null)).toBe('missed');
  });
  it('treats a made-up value as worse than an empty one', () => {
    expect(compareField('invoice_number', '', 'Not Found')).toBe('empty-ok');
    expect(compareField('invoice_number', '', 'INV-1')).toBe('invented');
    expect(compareField('discount', '', 0)).toBe('empty-ok');
    expect(compareField('tax', '0', 19.62)).toBe('invented');
  });
  it('matches merchants across legal suffixes and longer brand names, but not different shops', () => {
    expect(compareField('merchant', 'Blue Tokai Coffee', 'BLUE TOKAI COFFEE ROASTERS PVT. LTD.')).toBe('correct');
    expect(compareField('merchant', 'Starbucks', 'Tata Starbucks Private Limited')).toBe('correct');
    expect(compareField('merchant', 'KFC', 'KFC')).toBe('correct');
    expect(compareField('merchant', 'Swiggy', 'Zomato')).toBe('wrong');
    expect(compareField('merchant', 'Social', 'Socials Unlimited')).toBe('wrong');
  });
  it('compares dates by day and codes without punctuation or case', () => {
    expect(compareField('date', '2026-10-19', '2026-10-19 13:20:00')).toBe('correct');
    expect(compareField('date', '2026-10-19', '2026-10-18 23:59:00')).toBe('wrong');
    expect(compareField('invoice_number', 'BT-KP-1910-0342', 'bt kp 1910 0342')).toBe('correct');
    expect(compareField('payment_method', 'Credit Card', 'credit card')).toBe('correct');
  });
});

describe('items', () => {
  it('reads the answer-sheet shorthand', () => {
    expect(parseItems('2 x Cappuccino = 320; 1 × Almond Croissant = 92; Service charge')).toEqual([
      { quantity: 2, name: 'Cappuccino', total: 320 },
      { quantity: 1, name: 'Almond Croissant', total: 92 },
      { quantity: 1, name: 'Service charge', total: null },
    ]);
  });
  it('counts items found and items that are not on the bill', () => {
    const got = [{ name: 'CAPPUCCINO (REG)', quantity: 2, total_price: 320 }, { name: 'Packing charge', quantity: 1, total_price: 10 }];
    expect(compareItems('2 x Cappuccino = 320; 1 x Almond Croissant = 92', got)).toEqual({ expected: 2, found: 1, extra: 1 });
  });
});

describe('scoreRun', () => {
  it('totals a run, keeping failures and unread bills apart', () => {
    const answers = [
      { file: 'a.jpg', merchant: 'Blue Tokai Coffee', date: '2026-10-19', total: '412', invoice_number: '', payment_method: 'UPI', category: 'Food & Dining', subtotal: '', tax: '', discount: '', currency: 'INR', items: '2 x Cappuccino = 320; 1 x Almond Croissant = 92' },
      { file: 'b.jpg', merchant: 'Kimchi', date: '2026-10-31', total: '284.55', invoice_number: '0003856103100023', payment_method: '', category: 'Food & Dining', subtotal: '271', tax: '13.55', discount: '', currency: 'INR', items: '' },
      { file: 'c.pdf', merchant: 'Croma', date: '2026-10-16', total: '1299', invoice_number: '', payment_method: '', category: 'Shopping', subtotal: '', tax: '', discount: '', currency: 'INR', items: '' },
      { file: 'd.jpg', merchant: 'Uber', date: '2026-10-18', total: '286', invoice_number: '', payment_method: '', category: '', subtotal: '', tax: '', discount: '', currency: '', items: '' },
    ];
    const results = {
      'a.jpg': { ok: true, ms: 6200, response: { merchant_name: 'Blue Tokai Coffee', date_time: '2026-10-19 13:20:00', amount: 412, bill_invoice_number: 'Not Found', payment_method: 'UPI', category: 'Food & Dining', subtotal: null, tax_amount: null, discount: null, currency: 'INR', line_items: [{ name: 'Cappuccino', quantity: 2, total_price: 320 }, { name: 'Almond Croissant', quantity: 1, total_price: 92 }] } },
      'b.jpg': { ok: true, ms: 7400, response: { merchant_name: 'Kimchi', date_time: '2026-10-31 20:00:00', amount: 271, bill_invoice_number: '0003856103100023', payment_method: 'UPI', category: 'Food & Dining', subtotal: 271, tax_amount: null, discount: null, currency: 'INR', line_items: [] } },
      'c.pdf': { ok: true, ms: 100, response: { error: 'AI is busy right now.', fallback: true } },
    };
    const s = scoreRun(answers, results);
    expect([s.bills, s.read, s.failed, s.notRun]).toEqual([4, 2, 1, 1]);
    expect(s.keyFieldsRight).toBe(1);
    expect(s.fields.total).toMatchObject({ correct: 1, wrong: 1, correctPct: 50 });
    expect(s.fields.tax).toMatchObject({ missed: 1, 'empty-ok': 1 });
    expect(s.fields.payment_method).toMatchObject({ correct: 1, invented: 1 });
    expect(s.items).toMatchObject({ expected: 2, found: 2, extra: 0, foundPct: 100 });
    expect(s.seconds.median).toBe(7.4);
  });
});
