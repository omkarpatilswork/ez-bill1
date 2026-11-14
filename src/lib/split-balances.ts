/**
 * Who owes what. One definition for every screen: a friend's balance is all
 * the shares ever split to them, minus everything they have paid back. A
 * share's "settled" mark is a label, not arithmetic, so settling up cannot
 * make a balance go negative.
 */
export interface SplitRow {
  id: string;
  expense_id: string;
  friend_id: string | null;
  friend_name: string;
  amount: number;
  is_self: boolean | null;
  status: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  friend_id: string | null;
  friend_name: string;
  amount: number;
  direction: string;
  note: string | null;
  paid_at: string;
}

export interface FriendBalance {
  key: string;
  name: string;
  shared: number;
  paid: number;
  /** What they still owe. Never below zero: an overpayment shows as settled. */
  owes: number;
  bills: number;
}

/** A friend is known by id when saved as one, else by the name typed on the split. */
export const friendKey = (row: { friend_id: string | null; friend_name: string }) => row.friend_id || `name:${row.friend_name}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function friendBalances(splits: SplitRow[], payments: PaymentRow[]): FriendBalance[] {
  const byKey = new Map<string, FriendBalance & { seen: Set<string> }>();
  for (const s of splits) {
    if (s.is_self) continue;
    const key = friendKey(s);
    const b = byKey.get(key) ?? { key, name: s.friend_name, shared: 0, paid: 0, owes: 0, bills: 0, seen: new Set<string>() };
    b.shared += Number(s.amount) || 0;
    b.seen.add(s.expense_id);
    byKey.set(key, b);
  }
  for (const p of payments) {
    const b = byKey.get(friendKey(p));
    if (b && p.direction === 'received') b.paid += Number(p.amount) || 0;
  }
  return [...byKey.values()]
    .map(({ seen, ...b }) => ({ ...b, shared: round2(b.shared), paid: round2(b.paid), owes: Math.max(0, round2(b.shared - b.paid)), bills: seen.size }))
    .sort((a, b) => b.owes - a.owes || a.name.localeCompare(b.name));
}

export const totalOwed = (balances: FriendBalance[]) => round2(balances.reduce((s, b) => s + b.owes, 0));

export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
