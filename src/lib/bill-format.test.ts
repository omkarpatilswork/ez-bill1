import { describe, expect, it } from 'vitest';
import { checkBillMath, formatAmount, lineAddsUp, parseBillDescription } from './bill-format';

const items = [
  { name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 },
  { name: 'Almond Croissant', quantity: 1, unit_price: 92, total_price: 92 },
];
const packed = (head: string, list: unknown = items) => `${head}::ITEMS::${JSON.stringify(list)}::END_ITEMS::`;

describe('parseBillDescription', () => {
  it('reads an NFC Airdrop bill as ClaimTag writes it', () => {
    const b = parseBillDescription(packed('Tapped at Table 3 | Auto-delivered via NFC tag | [nfc] | Invoice: BT-1042 | Payment: UPI'));
    expect(b.source).toBe('nfc');
    expect(b.table).toBe('Table 3');
    expect(b.invoice).toBe('BT-1042');
    expect(b.payment).toBe('UPI');
    expect(b.items).toHaveLength(2);
    expect(b.notes).toBe('');
  });

  it('does not invent a table when the tag had no label', () => {
    expect(parseBillDescription('Tapped at a table | Auto-delivered via NFC tag | [nfc]').table).toBeNull();
  });

  it('reads a Gmail bill, keeping a subject line that contains a pipe', () => {
    const b = parseBillDescription(packed('Category: Food & Dining | Invoice: 17 | 2 item(s) | From email: Your order | Swiggy receipt | [Subscription]'));
    expect(b.source).toBe('email');
    expect(b.emailSubject).toBe('Your order | Swiggy receipt');
    expect(b.isSubscription).toBe(true);
    expect(b.category).toBe('Food & Dining');
    expect(b.invoice).toBe('17');
    expect(b.notes).toBe('');
  });

  it('reads a scanned bill with tax, discount, address and a typed note', () => {
    const b = parseBillDescription(packed(
      'Category: Shopping | Aggregator: Amazon | Address: 12 MG Road, Pune | Invoice: INV/9 | Payment: Credit Card | 2 item(s) | Subtotal: 392.38 | Tax: 19.62 | TaxDetails: CGST 2.5% + SGST 2.5% | Discount: 10 | [scan] | gift for Meera',
    ));
    expect(b).toMatchObject({
      source: 'scan', category: 'Shopping', aggregator: 'Amazon', address: '12 MG Road, Pune',
      invoice: 'INV/9', payment: 'Credit Card', subtotal: 392.38, tax: 19.62,
      taxDetails: 'CGST 2.5% + SGST 2.5%', discount: 10, notes: 'gift for Meera',
    });
  });

  it('treats missing, empty and "Not Found" values as empty, never as a value', () => {
    const b = parseBillDescription('Invoice: Not Found | Payment: | Tax: 0 | [manual]');
    expect(b.invoice).toBeNull();
    expect(b.payment).toBeNull();
    expect(b.tax).toBeNull();
    expect(b.source).toBe('manual');
    expect(parseBillDescription(null).items).toEqual([]);
    expect(parseBillDescription(undefined).source).toBe('unknown');
  });

  it('survives broken item JSON and items without an end marker', () => {
    expect(parseBillDescription('[upload]::ITEMS::[{"name":"Tea"').items).toEqual([]);
    const open = parseBillDescription(`[upload]::ITEMS::${JSON.stringify(items)}`);
    expect(open.items).toHaveLength(2);
    expect(open.source).toBe('upload');
  });

  it('cleans up item numbers stored as strings and drops nameless rows', () => {
    const b = parseBillDescription(packed('[scan]', [{ name: ' Tea ', quantity: '2', unit_price: '15.50', total_price: '31' }, { name: '', total_price: 5 }]));
    expect(b.items).toEqual([{ name: 'Tea', quantity: 2, unit_price: 15.5, total_price: 31 }]);
  });
});

describe('checkBillMath', () => {
  it('passes when items equal the total', () => {
    expect(checkBillMath({ items, tax: null, discount: null }, 412)).toEqual({ status: 'ok', itemsSum: 412, viaTax: false });
  });

  it('passes when items plus tax minus discount equal the total', () => {
    expect(checkBillMath({ items, tax: 20.6, discount: 10 }, 422.6)).toEqual({ status: 'ok', itemsSum: 412, viaTax: true });
  });

  it('flags a bill whose numbers do not agree and says by how much', () => {
    const kimchi = [
      { name: 'Chicken Schezwan Fried Rice', quantity: 1, unit_price: 259, total_price: 259 },
      { name: 'Order Packing Charges', quantity: 1, unit_price: 12, total_price: 12 },
    ];
    expect(checkBillMath({ items: kimchi, tax: null, discount: null }, 284.55)).toEqual({ status: 'mismatch', itemsSum: 271, expected: 284.55, diff: 13.55 });
  });

  it('has nothing to say without items', () => {
    expect(checkBillMath({ items: [], tax: null, discount: null }, 500)).toEqual({ status: 'none' });
  });
});

describe('lineAddsUp', () => {
  it('is true only when quantity x unit price equals the line total', () => {
    expect(lineAddsUp(items[0])).toBe(true);
    // Read from a real bill: a buy-one-get-one line stored as 1 x 1,398 = 699.
    expect(lineAddsUp({ name: 'Jumbo Zinger Meal', quantity: 1, unit_price: 1398, total_price: 699 })).toBe(false);
    expect(lineAddsUp({ name: 'Tea', quantity: 1, unit_price: 0, total_price: 20 })).toBe(false);
  });
});

describe('formatAmount', () => {
  it('groups digits the Indian way', () => {
    expect(formatAmount(125916, { paise: false })).toBe('₹1,25,916');
    expect(formatAmount(412)).toBe('₹412.00');
    expect(formatAmount(778.95)).toBe('₹778.95');
  });
});
