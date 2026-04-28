/**
 * Subscription Engine — detect recurring merchants from expenses and classify usage.
 * Pure functions. No side effects.
 *
 * A "subscription" is detected when the same normalized merchant appears at
 * roughly regular cadence (weekly / monthly / yearly) with similar amounts.
 */

export type SubscriptionStatus = 'active' | 'low_use' | 'unused' | 'duplicate';
export type SubscriptionCadence = 'weekly' | 'monthly' | 'yearly';

export interface DetectedSubscription {
  merchant: string;            // normalized display name
  rawKey: string;              // normalization key
  monthlyCost: number;         // amortized to monthly
  lastChargeDate: string;      // ISO date
  nextRenewalDate: string;     // ISO date (estimate)
  daysSinceLastUse: number;    // = days since last charge (proxy for usage)
  occurrences: number;
  cadence: SubscriptionCadence;
  status: SubscriptionStatus;
  category: string;            // OTT / SaaS / Telecom / Fitness / Other
  expenseIds: string[];
}

export interface SubscriptionSummary {
  subscriptions: DetectedSubscription[];
  totalMonthly: number;
  activeMonthly: number;
  leakMonthly: number;         // unused + low-use
  duplicates: { category: string; merchants: string[] }[];
}

interface ExpenseLite {
  id: string;
  amount: number;
  expense_date: string;
  merchant?: string | null;
  title?: string | null;
  category_name?: string | null;
}

/* ---------- Normalization & categorization ---------- */

function normalizeMerchant(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pvt|ltd|inc|llc|india|payment|subscription|monthly|annual|premium|plan|recharge|bill)\b/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

function prettyName(raw: string): string {
  const cleaned = (raw || '').replace(/[_\-]+/g, ' ').trim();
  return cleaned.split(/\s+/).slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function categorize(merchant: string): string {
  const m = merchant.toLowerCase();
  if (/(netflix|prime|hotstar|disney|sony|zee|jio cinema|youtube|spotify|gaana|apple music|wynk)/.test(m)) return 'OTT';
  if (/(chatgpt|openai|claude|notion|figma|canva|github|gitlab|adobe|microsoft|google one|icloud|dropbox|slack|zoom)/.test(m)) return 'SaaS';
  if (/(airtel|jio|vi |vodafone|bsnl|act|hathway|broadband|wifi|fiber)/.test(m)) return 'Telecom';
  if (/(cult|gym|fitness|yoga|cure fit)/.test(m)) return 'Fitness';
  if (/(swiggy one|zomato gold|amazon prime|flipkart plus)/.test(m)) return 'Membership';
  return 'Other';
}

/* ---------- Detection ---------- */

interface Charge {
  expenseId: string;
  date: Date;
  amount: number;
  rawMerchant: string;
}

function inferCadence(intervalsDays: number[]): SubscriptionCadence | null {
  if (intervalsDays.length === 0) return null;
  const median = [...intervalsDays].sort((a, b) => a - b)[Math.floor(intervalsDays.length / 2)];
  if (median >= 5 && median <= 10) return 'weekly';
  if (median >= 25 && median <= 35) return 'monthly';
  if (median >= 350 && median <= 380) return 'yearly';
  // Allow loose monthly (28-45) when only 2 occurrences
  if (intervalsDays.length === 1 && median >= 28 && median <= 45) return 'monthly';
  return null;
}

function amortizeMonthly(amount: number, cadence: SubscriptionCadence): number {
  if (cadence === 'weekly') return amount * 4.33;
  if (cadence === 'yearly') return amount / 12;
  return amount;
}

export function detectSubscriptions(expenses: ExpenseLite[]): SubscriptionSummary {
  // Group by normalized merchant
  const groups = new Map<string, Charge[]>();
  for (const e of expenses) {
    const source = e.merchant || e.title || '';
    const key = normalizeMerchant(source);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push({
      expenseId: e.id,
      date: new Date(e.expense_date),
      amount: Number(e.amount) || 0,
      rawMerchant: source,
    });
    groups.set(key, arr);
  }

  const subs: DetectedSubscription[] = [];
  const today = new Date();

  for (const [key, charges] of groups) {
    if (charges.length < 2) continue;
    charges.sort((a, b) => a.date.getTime() - b.date.getTime());

    const intervals: number[] = [];
    for (let i = 1; i < charges.length; i++) {
      intervals.push(Math.round((charges[i].date.getTime() - charges[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)));
    }
    const cadence = inferCadence(intervals);
    if (!cadence) continue;

    // Amount stability check — within 30% of median
    const amounts = charges.map(c => c.amount).sort((a, b) => a - b);
    const medianAmt = amounts[Math.floor(amounts.length / 2)];
    const stable = charges.every(c => medianAmt > 0 && Math.abs(c.amount - medianAmt) / medianAmt <= 0.3);
    if (!stable) continue;

    const last = charges[charges.length - 1];
    const daysSinceLast = Math.round((today.getTime() - last.date.getTime()) / (1000 * 60 * 60 * 24));
    const cadenceDays = cadence === 'weekly' ? 7 : cadence === 'yearly' ? 365 : 30;
    const next = new Date(last.date.getTime() + cadenceDays * 24 * 60 * 60 * 1000);
    const monthlyCost = Math.round(amortizeMonthly(medianAmt, cadence));

    let status: SubscriptionStatus;
    if (daysSinceLast > cadenceDays * 2) status = 'unused';
    else if (daysSinceLast > cadenceDays * 1.3) status = 'low_use';
    else status = 'active';

    const display = prettyName(last.rawMerchant) || prettyName(key);
    subs.push({
      merchant: display,
      rawKey: key,
      monthlyCost,
      lastChargeDate: last.date.toISOString(),
      nextRenewalDate: next.toISOString(),
      daysSinceLastUse: daysSinceLast,
      occurrences: charges.length,
      cadence,
      status,
      category: categorize(display),
      expenseIds: charges.map(c => c.expenseId),
    });
  }

  // Detect duplicates within same category (e.g. Netflix + Prime + Hotstar all OTT)
  const byCat = new Map<string, string[]>();
  for (const s of subs) {
    if (s.status === 'unused') continue;
    const arr = byCat.get(s.category) || [];
    arr.push(s.merchant);
    byCat.set(s.category, arr);
  }
  const duplicates: { category: string; merchants: string[] }[] = [];
  for (const [cat, merchants] of byCat) {
    if (merchants.length >= 2 && (cat === 'OTT' || cat === 'Telecom' || cat === 'Membership')) {
      duplicates.push({ category: cat, merchants });
      // Mark second+ as duplicate
      const targetSubs = subs.filter(s => s.category === cat && s.status !== 'unused');
      targetSubs.sort((a, b) => b.monthlyCost - a.monthlyCost);
      targetSubs.slice(1).forEach(s => { s.status = 'duplicate'; });
    }
  }

  subs.sort((a, b) => b.monthlyCost - a.monthlyCost);

  const totalMonthly = subs.reduce((s, x) => s + x.monthlyCost, 0);
  const activeMonthly = subs.filter(x => x.status === 'active').reduce((s, x) => s + x.monthlyCost, 0);
  const leakMonthly = subs.filter(x => x.status === 'unused' || x.status === 'low_use' || x.status === 'duplicate')
    .reduce((s, x) => s + x.monthlyCost, 0);

  return { subscriptions: subs, totalMonthly, activeMonthly, leakMonthly, duplicates };
}

/* Cancellation deep links for popular services */
export const CANCEL_LINKS: Record<string, string> = {
  netflix: 'https://www.netflix.com/cancelplan',
  spotify: 'https://www.spotify.com/account/subscription/',
  'amazon prime': 'https://www.amazon.in/gp/your-account/manageyourprime',
  'prime video': 'https://www.amazon.in/gp/video/settings',
  hotstar: 'https://www.hotstar.com/in/subscribe/myaccount',
  'disney hotstar': 'https://www.hotstar.com/in/subscribe/myaccount',
  youtube: 'https://www.youtube.com/paid_memberships',
  'youtube premium': 'https://www.youtube.com/paid_memberships',
  chatgpt: 'https://chat.openai.com/#settings/Subscription',
  openai: 'https://platform.openai.com/account/billing',
  notion: 'https://www.notion.so/my-account',
  canva: 'https://www.canva.com/settings/billing-and-plans',
  figma: 'https://www.figma.com/settings',
  adobe: 'https://account.adobe.com/plans',
  cult: 'https://www.cult.fit/profile/membership',
  cultfit: 'https://www.cult.fit/profile/membership',
};

export function getCancelLink(merchant: string): string | null {
  const m = merchant.toLowerCase();
  for (const key of Object.keys(CANCEL_LINKS)) {
    if (m.includes(key)) return CANCEL_LINKS[key];
  }
  return null;
}

/**
 * Detect "likely subscriptions" from expenses where the merchant matches a
 * popular subscription catalog, even with only ONE charge so far. This
 * complements detectSubscriptions() which requires 2+ recurring charges.
 *
 * @param expenses recent expenses
 * @param matcher  function returning a stable key + display name for known services
 */
export interface LikelySubscription {
  serviceKey: string;
  serviceName: string;
  category: string;
  lastAmount: number;
  lastDate: string;
  occurrences: number;
  expenseIds: string[];
}

export function detectLikelySubscriptions(
  expenses: ExpenseLite[],
  matcher: (text: string) => { key: string; name: string; category: string } | null,
): LikelySubscription[] {
  const map = new Map<string, LikelySubscription>();
  for (const e of expenses) {
    const text = `${e.merchant || ''} ${e.title || ''}`;
    const m = matcher(text);
    if (!m) continue;
    const ex = map.get(m.key);
    if (!ex) {
      map.set(m.key, {
        serviceKey: m.key,
        serviceName: m.name,
        category: m.category,
        lastAmount: Number(e.amount) || 0,
        lastDate: e.expense_date,
        occurrences: 1,
        expenseIds: [e.id],
      });
    } else {
      ex.occurrences++;
      ex.expenseIds.push(e.id);
      if (new Date(e.expense_date) > new Date(ex.lastDate)) {
        ex.lastDate = e.expense_date;
        ex.lastAmount = Number(e.amount) || ex.lastAmount;
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime(),
  );
}
