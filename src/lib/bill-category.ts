/**
 * Which broad category a bill belongs to, for the redesigned screens.
 *
 * Same buckets and the same rules as the two older copies (BillRow and
 * MonthlySummary; see AGENTS.md). Those move onto this module when the
 * category mapping is reworked; until then, change all three together.
 */
import { smartCategoryFromMerchant } from '@/lib/smart-category';
import { parseBillDescription } from '@/lib/bill-format';

export const BROAD_CATEGORIES = [
  'Food & Dining', 'Grocery', 'Fuel', 'Toll & Parking', 'Shopping', 'Subscriptions', 'Travel',
  'Transport', 'Hotel & Stay', 'Medical', 'Entertainment', 'Education', 'Utilities', 'Office', 'Other',
] as const;
export type BroadCategory = (typeof BROAD_CATEGORIES)[number];

const BROAD_CATEGORY_MAP: Record<string, BroadCategory> = {
  'food & dining': 'Food & Dining', food: 'Food & Dining', dining: 'Food & Dining',
  meals: 'Food & Dining', restaurant: 'Food & Dining', grocery: 'Grocery',
  supermarket: 'Grocery', 'petrol & fuel': 'Fuel', petrol: 'Fuel', fuel: 'Fuel',
  toll: 'Toll & Parking', parking: 'Toll & Parking', shopping: 'Shopping',
  retail: 'Shopping', utilities: 'Utilities', software: 'Subscriptions',
  subscription: 'Subscriptions', travel: 'Travel', flight: 'Travel', train: 'Travel',
  transportation: 'Transport', transport: 'Transport', cab: 'Transport',
  accommodation: 'Hotel & Stay', hotel: 'Hotel & Stay', stay: 'Hotel & Stay',
  medical: 'Medical', health: 'Medical', pharmacy: 'Medical',
  entertainment: 'Entertainment', education: 'Education', office: 'Office', other: 'Other',
};

export function toBroadCategory(category: string): BroadCategory {
  const lower = category.toLowerCase().trim();
  if (BROAD_CATEGORY_MAP[lower]) return BROAD_CATEGORY_MAP[lower];
  for (const [key, broad] of Object.entries(BROAD_CATEGORY_MAP)) {
    if (lower.includes(key)) return broad;
  }
  return 'Other';
}

interface CategorisableBill {
  title?: string | null;
  merchant?: string | null;
  description?: string | null;
  cost_center?: string | null;
}

/** The category saved on the bill if there is one, otherwise a guess from the merchant. */
export function billCategory(bill: CategorisableBill): BroadCategory {
  const saved = parseBillDescription(bill.description).category;
  if (saved && saved !== 'Other') return toBroadCategory(saved);
  const text = `${bill.title ?? ''} ${bill.merchant ?? ''} ${bill.description ?? ''} ${bill.cost_center ?? ''}`;
  return toBroadCategory(smartCategoryFromMerchant(text) || 'Other');
}
