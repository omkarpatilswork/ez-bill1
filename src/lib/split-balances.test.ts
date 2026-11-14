import { describe, expect, it } from 'vitest';
import { friendBalances, totalOwed, type PaymentRow, type SplitRow } from './split-balances';

const split = (id: string, friend: string, amount: number, extra: Partial<SplitRow> = {}): SplitRow =>
  ({ id, expense_id: `bill-${id}`, friend_id: null, friend_name: friend, amount, is_self: false, status: 'pending', created_at: '2026-10-19T08:00:00Z', ...extra });
const paid = (id: string, friend: string, amount: number): PaymentRow =>
  ({ id, friend_id: null, friend_name: friend, amount, direction: 'received', note: null, paid_at: '2026-10-20T08:00:00Z' });

describe('friendBalances', () => {
  it('adds up what each friend was asked for and takes off what they paid', () => {
    const out = friendBalances([split('1', 'Riya', 206), split('2', 'Riya', 150), split('3', 'Kabir', 90)], [paid('p1', 'Riya', 200)]);
    expect(out).toEqual([
      { key: 'name:Riya', name: 'Riya', shared: 356, paid: 200, owes: 156, bills: 2 },
      { key: 'name:Kabir', name: 'Kabir', shared: 90, paid: 0, owes: 90, bills: 1 },
    ]);
    expect(totalOwed(out)).toBe(246);
  });
  it('leaves out your own share', () => {
    expect(friendBalances([split('1', 'You', 206, { is_self: true }), split('2', 'Riya', 206)], [])).toHaveLength(1);
  });
  it('is zero after settling up, whatever the shares are marked', () => {
    const settled = [split('1', 'Riya', 206, { status: 'settled' }), split('2', 'Riya', 150, { status: 'settled' })];
    expect(friendBalances(settled, [paid('p1', 'Riya', 356)])[0].owes).toBe(0);
  });
  it('never shows an overpayment as a debt the other way', () => {
    expect(friendBalances([split('1', 'Riya', 100)], [paid('p1', 'Riya', 120)])[0].owes).toBe(0);
  });
  it('tells a saved friend from a stranger with the same name', () => {
    const out = friendBalances([split('1', 'Riya', 100, { friend_id: 'f-1' }), split('2', 'Riya', 50)], []);
    expect(out.map((b) => b.key).sort()).toEqual(['f-1', 'name:Riya']);
  });
});
