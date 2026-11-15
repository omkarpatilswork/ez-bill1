import { describe, expect, it } from 'vitest';
import { billCurrency, homeCurrency, inCurrency, othersNote } from './currency';

describe('currency', () => {
  it('uses the profile currency, rupees when none is set', () => {
    expect(homeCurrency({ default_currency: 'USD' })).toBe('USD');
    expect(homeCurrency({ default_currency: null })).toBe('INR');
    expect(homeCurrency(null)).toBe('INR');
  });

  it('reads a bill with no currency as rupees', () => {
    expect(billCurrency({})).toBe('INR');
    expect(billCurrency({ currency: 'AED' })).toBe('AED');
  });

  it('keeps the bills in one currency and counts the rest', () => {
    const bills = [{ id: 1, currency: 'INR' }, { id: 2 }, { id: 3, currency: 'USD' }, { id: 4, currency: 'EUR' }];
    const { mine, others } = inCurrency(bills, 'INR');
    expect(mine.map((b) => b.id)).toEqual([1, 2]);
    expect(others).toBe(2);
  });

  it('words the note for one and for many', () => {
    expect(othersNote(1)).toBe('1 bill is in another currency and not counted here.');
    expect(othersNote(3)).toBe('3 bills are in another currency and not counted here.');
  });
});
