/**
 * Money Leaks engine — personalized ideal-budget model + leak calculation.
 * Pure functions. No side effects. All amounts in user's default currency (₹ assumed).
 */

export type IncomeRange = '0-25k' | '25-50k' | '50-100k' | '100-200k' | '200k+';
export type AgeGroup = '18-24' | '25-34' | '35-44' | '45+';
export type CityTier = 'tier_1' | 'tier_2' | 'tier_3';
export type LivingSituation = 'family' | 'shared' | 'alone';
export type JobType = 'remote' | 'office' | 'travel';
export type FinancialGoal = 'save' | 'balanced' | 'lifestyle';

export interface MoneyProfile {
  income_range: IncomeRange | null;
  age_group: AgeGroup | null;
  city_tier: CityTier | null;
  living_situation: LivingSituation | null;
  job_type: JobType | null;
  financial_goal: FinancialGoal | null;
  monthly_rent?: number | null;
  monthly_emi?: number | null;
  money_profile_completed: boolean;
}

/* Map income bucket → midpoint estimate (₹/month) */
export function incomeMidpoint(range: IncomeRange | null | undefined): number {
  switch (range) {
    case '0-25k': return 18000;
    case '25-50k': return 37500;
    case '50-100k': return 75000;
    case '100-200k': return 150000;
    case '200k+': return 300000;
    default: return 50000;
  }
}

export type LeakCategory = 'Food' | 'Travel' | 'Shopping' | 'Subscriptions' | 'Utilities' | 'Misc';
export const LEAK_CATEGORIES: LeakCategory[] = ['Food', 'Travel', 'Shopping', 'Subscriptions', 'Utilities', 'Misc'];

/* Base budget allocation by financial goal (% of discretionary spend) */
const BASE_PCT: Record<FinancialGoal, Record<LeakCategory, number>> = {
  save:      { Food: 20, Travel: 13, Shopping: 9,  Subscriptions: 4, Utilities: 11, Misc: 9 },
  balanced:  { Food: 24, Travel: 18, Shopping: 13, Subscriptions: 7, Utilities: 13, Misc: 13 },
  lifestyle: { Food: 26, Travel: 20, Shopping: 16, Subscriptions: 8, Utilities: 14, Misc: 16 },
};

/* Apply modifiers to category percentages */
function applyModifiers(
  base: Record<LeakCategory, number>,
  profile: MoneyProfile,
): Record<LeakCategory, number> {
  const out = { ...base };
  // City tier
  if (profile.city_tier === 'tier_1') {
    out.Food *= 1.10;
  } else if (profile.city_tier === 'tier_3') {
    out.Food *= 0.90;
  }
  // Living situation
  if (profile.living_situation === 'family') {
    out.Food *= 0.70;
  } else if (profile.living_situation === 'alone') {
    out.Food *= 1.20;
  }
  // Job type
  if (profile.job_type === 'travel') {
    out.Travel *= 1.30;
  } else if (profile.job_type === 'office') {
    out.Food *= 1.10;
  } else if (profile.job_type === 'remote') {
    out.Travel *= 0.80;
  }
  return out;
}

export interface IdealBudget {
  income: number;
  /** Fixed commitments (rent + EMI), capped at 60% of income */
  fixed: number;
  /** What's left to spend across leak categories */
  discretionary: number;
  perCategory: Record<LeakCategory, number>;
  totalBudget: number;
}

export function computeIdealBudget(profile: MoneyProfile): IdealBudget {
  const income = incomeMidpoint(profile.income_range);
  const goal = profile.financial_goal || 'balanced';
  const rent = Number(profile.monthly_rent) || 0;
  const emi = Number(profile.monthly_emi) || 0;
  // Fixed commitments cap at 60% of income so the model always leaves room to live
  const fixed = Math.min(rent + emi, Math.round(income * 0.6));
  // Discretionary pool: income minus fixed, floored at 25% of income,
  // then shaped by goal (aggressive savers get a smaller pool)
  const goalFactor = goal === 'save' ? 0.75 : goal === 'lifestyle' ? 1.15 : 1;
  const discretionary = Math.round(Math.max(Math.round(income * 0.25), income - fixed) * goalFactor);
  const adjusted = applyModifiers(BASE_PCT[goal], profile);
  const perCategory = {} as Record<LeakCategory, number>;
  let total = 0;
  for (const cat of LEAK_CATEGORIES) {
    const ideal = Math.round((discretionary * adjusted[cat]) / 100);
    perCategory[cat] = ideal;
    total += ideal;
  }
  return { income, fixed, discretionary, perCategory, totalBudget: total };
}

/* Map an expense's free-form category/merchant text to a Leak category bucket */
export function toLeakCategory(text: string): LeakCategory {
  const c = (text || '').toLowerCase();
  if (/(food|dining|restaurant|cafe|coffee|swiggy|zomato|pizza|burger|biryani|snack|lunch|dinner|breakfast|bakery|grocery)/.test(c)) return 'Food';
  if (/(uber|ola|cab|taxi|fuel|petrol|diesel|toll|parking|metro|train|flight|airline|travel|hotel|airbnb|trip|rapido)/.test(c)) return 'Travel';
  if (/(amazon|flipkart|myntra|ajio|meesho|nykaa|shop|retail|cloth|fashion|electronics|gadget)/.test(c)) return 'Shopping';
  if (/(netflix|spotify|prime|hotstar|youtube|subscription|saas|membership|gym|chatgpt|notion|figma|canva|disney)/.test(c)) return 'Subscriptions';
  if (/(electric|water|gas|internet|wifi|broadband|recharge|airtel|jio|vi|bsnl|bill|utility)/.test(c)) return 'Utilities';
  return 'Misc';
}

export interface CategoryLeak {
  category: LeakCategory;
  actual: number;
  ideal: number;
  leak: number;
  count: number;
  ratio: number; // actual / ideal
  /** Merchant that accounts for the biggest share of this category's spend */
  topMerchant: string | null;
  topMerchantTotal: number;
  /** Largest single transaction in this category */
  biggestSingle: number;
}

export interface LeakResult {
  perCategory: CategoryLeak[];
  totalActual: number;
  totalIdeal: number;
  totalLeak: number;
  leakPercent: number;
  leakScore: number; // 0-100, higher = more leaking
  patterns: string[]; // behavioral insights
  /** Frequent tiny spends — "death by a thousand cuts" */
  smallSpends: { count: number; total: number; threshold: number };
  /** Mid-month pace projection (only meaningful for the current month) */
  pacing: { projectedMonthEnd: number; elapsedDays: number; daysInMonth: number; isCurrentMonth: boolean } | null;
}

interface ExpenseLite {
  amount: number;
  expense_date: string;
  created_at: string;
  category_name?: string | null;
  merchant?: string | null;
  cost_center?: string | null;
}

const SMALL_SPEND_THRESHOLD = 200;

export function computeLeaks(
  thisMonth: ExpenseLite[],
  lastMonth: ExpenseLite[],
  profile: MoneyProfile,
  month?: Date,
): LeakResult {
  const ideal = computeIdealBudget(profile);

  const buckets: Record<LeakCategory, { total: number; count: number; merchants: Map<string, number>; biggest: number }> = {
    Food: { total: 0, count: 0, merchants: new Map(), biggest: 0 },
    Travel: { total: 0, count: 0, merchants: new Map(), biggest: 0 },
    Shopping: { total: 0, count: 0, merchants: new Map(), biggest: 0 },
    Subscriptions: { total: 0, count: 0, merchants: new Map(), biggest: 0 },
    Utilities: { total: 0, count: 0, merchants: new Map(), biggest: 0 },
    Misc: { total: 0, count: 0, merchants: new Map(), biggest: 0 },
  };

  let lateNightAmount = 0;
  let weekendAmount = 0;
  let weekdayAmount = 0;
  let smallCount = 0;
  let smallTotal = 0;

  for (const e of thisMonth) {
    const text = `${e.category_name || ''} ${e.merchant || ''} ${e.cost_center || ''}`;
    const cat = toLeakCategory(text);
    const amt = Number(e.amount) || 0;
    buckets[cat].total += amt;
    buckets[cat].count += 1;
    const merchant = (e.merchant || '').trim();
    if (merchant) buckets[cat].merchants.set(merchant, (buckets[cat].merchants.get(merchant) || 0) + amt);
    if (amt > buckets[cat].biggest) buckets[cat].biggest = amt;

    const created = new Date(e.created_at);
    const h = created.getHours();
    if (h >= 22 || h <= 2) lateNightAmount += amt;

    const day = new Date(e.expense_date).getDay();
    if (day === 0 || day === 6) weekendAmount += amt;
    else weekdayAmount += amt;

    if (amt > 0 && amt <= SMALL_SPEND_THRESHOLD) {
      smallCount += 1;
      smallTotal += amt;
    }
  }

  const perCategory: CategoryLeak[] = LEAK_CATEGORIES.map(cat => {
    const actual = Math.round(buckets[cat].total);
    const i = ideal.perCategory[cat];
    const leak = Math.max(0, actual - i);
    const ratio = i > 0 ? actual / i : 0;
    let topMerchant: string | null = null;
    let topMerchantTotal = 0;
    for (const [m, t] of buckets[cat].merchants) {
      if (t > topMerchantTotal) { topMerchant = m; topMerchantTotal = t; }
    }
    return { category: cat, actual, ideal: i, leak, count: buckets[cat].count, ratio, topMerchant, topMerchantTotal: Math.round(topMerchantTotal), biggestSingle: buckets[cat].biggest };
  }).sort((a, b) => b.leak - a.leak);

  const totalActual = perCategory.reduce((s, c) => s + c.actual, 0);
  const totalIdeal = ideal.totalBudget;
  const totalLeak = perCategory.reduce((s, c) => s + c.leak, 0);
  const leakPercent = totalActual > 0 ? Math.round((totalLeak / totalActual) * 100) : 0;

  // Leak score components (each 0-100)
  const overspendRatio = totalIdeal > 0 ? Math.min(100, (totalActual / totalIdeal) * 50) : 0;
  const txCount = thisMonth.length;
  const frequencyScore = Math.min(100, (txCount / 30) * 100);
  const lastTotal = lastMonth.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const growth = lastTotal > 0 ? ((totalActual - lastTotal) / lastTotal) * 100 : 0;
  const growthScore = Math.max(0, Math.min(100, growth + 50));
  let behavioralScore = 0;
  if (totalActual > 0) {
    behavioralScore += (lateNightAmount / totalActual) * 100;
    if (weekdayAmount > 0 && weekendAmount / Math.max(1, weekdayAmount / 5) > 1.5) behavioralScore += 30;
  }
  behavioralScore = Math.min(100, behavioralScore);

  const leakScore = Math.round(
    0.35 * overspendRatio + 0.25 * frequencyScore + 0.20 * growthScore + 0.20 * behavioralScore,
  );

  // Pacing: project month-end spend if we're mid-month
  const now = new Date();
  const anchor = month || now;
  const isCurrentMonth = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const elapsedDays = isCurrentMonth ? now.getDate() : daysInMonth;
  let pacing: LeakResult['pacing'] = null;
  if (isCurrentMonth && elapsedDays >= 3 && totalActual > 0) {
    pacing = {
      projectedMonthEnd: Math.round((totalActual / elapsedDays) * daysInMonth),
      elapsedDays,
      daysInMonth,
      isCurrentMonth,
    };
  }

  // Patterns
  const patterns: string[] = [];
  const topLeak = perCategory[0];
  if (topLeak && topLeak.leak > 0) {
    if (topLeak.topMerchant && topLeak.topMerchantTotal > 0) {
      const share = Math.round((topLeak.topMerchantTotal / Math.max(1, topLeak.actual)) * 100);
      patterns.push(`${share}% of your ${topLeak.category} spend goes to ${topLeak.topMerchant} — ₹${topLeak.topMerchantTotal.toLocaleString('en-IN')} this month`);
    }
    patterns.push(`You're ${Math.round((topLeak.ratio - 1) * 100)}% over your ${topLeak.category} budget`);
  }
  if (smallCount >= 8 && smallTotal > 0) {
    patterns.push(`${smallCount} small spends under ₹${SMALL_SPEND_THRESHOLD} added up to ₹${Math.round(smallTotal).toLocaleString('en-IN')} — death by a thousand cuts`);
  }
  if (totalActual > 0 && lateNightAmount / totalActual > 0.15) {
    patterns.push(`${Math.round((lateNightAmount / totalActual) * 100)}% of your spending happens after 10 PM`);
  }
  if (weekdayAmount > 0 && weekendAmount > 0) {
    const weekdayAvg = weekdayAmount / 5;
    const weekendAvg = weekendAmount / 2;
    if (weekendAvg > weekdayAvg * 1.5) {
      patterns.push(`Your weekend spending is ${(weekendAvg / weekdayAvg).toFixed(1)}× your weekday average`);
    }
  }
  if (pacing && totalIdeal > 0 && pacing.projectedMonthEnd > totalIdeal * 1.15) {
    patterns.push(`At this pace you'll spend ₹${pacing.projectedMonthEnd.toLocaleString('en-IN')} by month end — ${Math.round((pacing.projectedMonthEnd / totalIdeal - 1) * 100)}% over budget`);
  }
  if (growth > 20) {
    patterns.push(`Spending up ${Math.round(growth)}% vs last month`);
  }

  return {
    perCategory,
    totalActual,
    totalIdeal,
    totalLeak,
    leakPercent,
    leakScore,
    patterns: patterns.slice(0, 5),
    smallSpends: { count: smallCount, total: Math.round(smallTotal), threshold: SMALL_SPEND_THRESHOLD },
    pacing,
  };
}

/* Leak score → plain-language grade */
export function leakGrade(score: number): { label: string; tone: 'good' | 'watch' | 'warn' | 'bad' } {
  if (score >= 80) return { label: 'Gushing', tone: 'bad' };
  if (score >= 60) return { label: 'Heavy leak', tone: 'warn' };
  if (score >= 40) return { label: 'Leaking', tone: 'warn' };
  if (score >= 20) return { label: 'Nearly sealed', tone: 'watch' };
  return { label: 'Sealed tight', tone: 'good' };
}

/* Survival mode: safe daily spend until next salary */
export function safeDailySpend(currentBalance: number, daysUntilSalary: number): number {
  if (daysUntilSalary <= 0) return currentBalance;
  return Math.max(0, Math.round(currentBalance / daysUntilSalary));
}
