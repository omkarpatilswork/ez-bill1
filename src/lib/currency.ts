/**
 * Rupees and dollars cannot be added together. Every total in the app counts
 * only the person's own currency (Settings, default currency; rupees when not
 * set) and says how many bills it left out.
 */

interface WithCurrency { currency?: string | null }

export function homeCurrency(profile?: { default_currency?: string | null } | null): string {
  return profile?.default_currency || 'INR';
}

/** A bill without a currency is from before the field existed: those were all rupees. */
export function billCurrency(bill: WithCurrency): string {
  return bill.currency || 'INR';
}

/** The bills that can be added up in `currency`, and how many could not. */
export function inCurrency<T extends WithCurrency>(bills: T[], currency: string): { mine: T[]; others: number } {
  const mine = bills.filter((b) => billCurrency(b) === currency);
  return { mine, others: bills.length - mine.length };
}

/** "3 bills are in another currency and not counted here." */
export function othersNote(others: number): string {
  return `${others} ${others === 1 ? 'bill is' : 'bills are'} in another currency and not counted here.`;
}
