import { toDay } from './dates';

export type BillingCycle = 'monthly' | 'yearly' | 'weekly';

const CYCLE_DAYS: Record<BillingCycle, number> = { weekly: 7, monthly: 30, yearly: 365 };
export const CYCLE_SHORT: Record<BillingCycle, string> = { weekly: 'a week', monthly: 'a month', yearly: 'a year' };

export const asCycle = (cycle?: string | null): BillingCycle => (cycle === 'yearly' || cycle === 'weekly' ? cycle : 'monthly');

/** What a subscription costs per month, whatever its billing cycle. */
export function monthlyCost(amount: number | null | undefined, cycle?: string | null): number {
  const value = Number(amount) || 0;
  const c = asCycle(cycle);
  return c === 'yearly' ? value / 12 : c === 'weekly' ? (value * 52) / 12 : value;
}

/**
 * The next charge. A date the provider stated wins while it is still ahead;
 * otherwise it is worked out from the last charge and the cycle, and is an
 * estimate (`estimated: true`), because months are not all 30 days long.
 */
export function nextCharge(
  row: { next_billing_date?: string | null; last_email_date?: string | null; billing_cycle?: string | null },
  now: Date = new Date(),
): { date: Date; estimated: boolean } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const stated = toDay(row.next_billing_date);
  if (stated && stated.getTime() >= today) return { date: stated, estimated: false };
  const last = toDay(row.last_email_date) || stated;
  if (!last) return null;
  const step = CYCLE_DAYS[asCycle(row.billing_cycle)] * 86400000;
  let next = last.getTime() + step;
  while (next < today) next += step;
  return { date: new Date(next), estimated: true };
}
