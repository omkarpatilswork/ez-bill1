/**
 * Bills that may be the same purchase saved twice.
 *
 * Two signals, kept apart because they are not equally strong:
 *   - "invoice": same invoice number on the same day. Almost certainly one purchase.
 *   - "same-day": same shop, amount and day, no invoice number to compare. Often a
 *     duplicate, but it can be two real purchases (two coffees, two metro rides),
 *     so it must never be removed without the person saying so.
 *
 * This is the app's existing rule, made honest about its weak half. The matcher
 * that also uses UPI references, time and items replaces it in the backend work.
 */
import { parseBillDescription } from '@/lib/bill-format';

interface DuplicateCandidate {
  id: string;
  merchant?: string | null;
  title?: string | null;
  amount: number;
  expense_date: string;
  description?: string | null;
  created_at: string;
}

export interface DuplicateGroup<T extends DuplicateCandidate = DuplicateCandidate> {
  key: string;
  reason: 'invoice' | 'same-day';
  /** Oldest first: the first one is the bill to keep. */
  bills: T[];
}

export function findDuplicateGroups<T extends DuplicateCandidate>(bills: T[]): DuplicateGroup<T>[] {
  const groups = new Map<string, DuplicateGroup<T>>();
  for (const bill of bills) {
    const day = bill.expense_date.slice(0, 10);
    const invoice = (parseBillDescription(bill.description).invoice || '').toLowerCase().replace(/\s+/g, '');
    const merchant = (bill.merchant || '').toLowerCase().trim();
    // Without an invoice number or a shop name there is nothing sound to match on.
    if (!invoice && !merchant) continue;
    const key = invoice ? `inv:${invoice}|${day}` : `shop:${merchant}|${Number(bill.amount).toFixed(2)}|${day}`;
    const group = groups.get(key) ?? { key, reason: invoice ? 'invoice' : 'same-day', bills: [] };
    group.bills.push(bill);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.bills.length > 1)
    .map((g) => ({ ...g, bills: [...g.bills].sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
}
