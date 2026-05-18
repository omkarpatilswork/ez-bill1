import {
  Receipt, Repeat, Utensils, Fuel, ParkingCircle, ShoppingBag,
  Plane, Car, Hotel, Pill, Gamepad2, GraduationCap, Briefcase,
  Zap, MoreHorizontal,
} from 'lucide-react';
import { smartCategoryFromMerchant } from '@/lib/smart-category';
import { getCurrencySymbol } from '@/lib/countries';

interface MinimalExpense {
  id: string;
  title: string;
  amount: number;
  merchant?: string | null;
  description?: string | null;
  cost_center?: string | null;
  currency?: string | null;
  expense_date: string;
}

const BROAD_CATEGORY_MAP: Record<string, string> = {
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
const BROAD_CATEGORY_ICONS: Record<string, any> = {
  'Food & Dining': Utensils, Grocery: ShoppingBag, Fuel,
  'Toll & Parking': ParkingCircle, Shopping: ShoppingBag, Subscriptions: Repeat,
  Travel: Plane, Transport: Car, 'Hotel & Stay': Hotel, Medical: Pill,
  Entertainment: Gamepad2, Education: GraduationCap, Utilities: Zap,
  Office: Briefcase, Other: MoreHorizontal,
};
function toBroadCategory(cat: string): string {
  const lower = cat.toLowerCase().trim();
  if (BROAD_CATEGORY_MAP[lower]) return BROAD_CATEGORY_MAP[lower];
  for (const [key, broad] of Object.entries(BROAD_CATEGORY_MAP)) {
    if (lower.includes(key)) return broad;
  }
  return 'Other';
}
function getSmartCategory(e: MinimalExpense): string {
  const descMatch = (e.description || '').match(/Category:\s*([^|]+)/);
  if (descMatch) {
    const saved = descMatch[1].trim();
    if (saved && saved !== 'Other') return saved;
  }
  const combined = `${e.title} ${e.merchant ?? ''} ${e.description ?? ''} ${e.cost_center ?? ''}`;
  return smartCategoryFromMerchant(combined) || 'Other';
}

interface BillRowProps {
  expense: MinimalExpense;
  onClick?: () => void;
  rightBadge?: React.ReactNode;
  as?: 'button' | 'div';
}

export default function BillRow({ expense, onClick, rightBadge, as = 'button' }: BillRowProps) {
  const rawCat = getSmartCategory(expense);
  const broadCat = toBroadCategory(rawCat);
  const CategoryIcon = BROAD_CATEGORY_ICONS[broadCat] || Receipt;
  const isSub = broadCat === 'Subscriptions';
  const currSym = getCurrencySymbol(expense.currency || 'INR');
  const itemMatch = expense.description?.match(/(\d+)\s*item/i);
  const Comp: any = as;

  return (
    <Comp
      onClick={onClick}
      className="w-full text-left block rounded-xl bg-card border border-border/30 p-3.5 hover:bg-muted/20 active:bg-muted/40 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${isSub ? 'bg-purple-500/10' : 'bg-primary/10'}`}>
          <CategoryIcon className={`h-5 w-5 ${isSub ? 'text-purple-500' : 'text-primary'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">
            {expense.merchant || expense.title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            <span>{broadCat}</span>
            {isSub && <span className="text-purple-400"> · Recurring</span>}
            {itemMatch && <> · {itemMatch[1]} item{Number(itemMatch[1]) === 1 ? '' : 's'}</>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {expense.cost_center || 'UPI'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-sm text-foreground tabular-nums">
            {currSym}{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(expense.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
          {rightBadge}
        </div>
      </div>
    </Comp>
  );
}