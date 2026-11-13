import { describe, expect, it } from 'vitest';
import { findDuplicateGroups } from './duplicates';

const bill = (id: string, over: Partial<Parameters<typeof findDuplicateGroups>[0][number]> = {}) => ({
  id, merchant: 'Blue Tokai Coffee', amount: 412, expense_date: '2026-10-19', description: '', created_at: `2026-10-19T13:2${id}:00+05:30`, ...over,
});

describe('findDuplicateGroups', () => {
  it('groups bills that share an invoice number on the same day, oldest first', () => {
    const groups = findDuplicateGroups([
      bill('2', { description: 'Invoice: BT-0342 | [scan]', merchant: 'BLUE TOKAI' }),
      bill('1', { description: 'Tapped at Table 3 | [nfc] | Invoice: bt-0342' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('invoice');
    expect(groups[0].bills.map((b) => b.id)).toEqual(['1', '2']);
  });

  it('marks same shop, amount and day without an invoice as the weak kind', () => {
    const groups = findDuplicateGroups([bill('1'), bill('2')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('same-day');
  });

  it('keeps apart bills with different invoice numbers, even at the same shop for the same amount', () => {
    expect(findDuplicateGroups([
      bill('1', { description: 'Invoice: A-1' }),
      bill('2', { description: 'Invoice: A-2' }),
    ])).toEqual([]);
  });

  it('keeps apart different days, amounts and shops', () => {
    expect(findDuplicateGroups([
      bill('1'), bill('2', { expense_date: '2026-10-20' }), bill('3', { amount: 413 }), bill('4', { merchant: 'Third Wave Coffee' }),
    ])).toEqual([]);
  });

  it('does not group bills that have neither an invoice number nor a shop name', () => {
    expect(findDuplicateGroups([bill('1', { merchant: '' }), bill('2', { merchant: null })])).toEqual([]);
  });
});
