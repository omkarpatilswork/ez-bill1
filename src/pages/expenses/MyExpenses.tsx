import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Receipt, Utensils, Fuel, Car, ParkingCircle, ShoppingBag, Zap, MoreHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Expense } from '@/lib/types';

const CATEGORIES = [
  { label: 'All', value: 'all', icon: Receipt },
  { label: 'Food & Dining', value: 'food_dining', icon: Utensils },
  { label: 'Petrol', value: 'petrol', icon: Fuel },
  { label: 'Toll', value: 'toll', icon: Car },
  { label: 'Parking', value: 'parking', icon: ParkingCircle },
  { label: 'Shopping', value: 'shopping', icon: ShoppingBag },
  { label: 'Utilities', value: 'utilities', icon: Zap },
  { label: 'Other', value: 'other', icon: MoreHorizontal },
];

function getCategoryIcon(category: string) {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('food') || cat.includes('dining') || cat.includes('restaurant')) return Utensils;
  if (cat.includes('petrol') || cat.includes('fuel') || cat.includes('gas')) return Fuel;
  if (cat.includes('toll')) return Car;
  if (cat.includes('parking')) return ParkingCircle;
  if (cat.includes('shopping') || cat.includes('retail')) return ShoppingBag;
  if (cat.includes('utilities') || cat.includes('electric') || cat.includes('water')) return Zap;
  return Receipt;
}

function matchesCategory(expense: Expense, filter: string): boolean {
  if (filter === 'all') return true;
  const title = (expense.title || '').toLowerCase();
  const merchant = (expense.merchant || '').toLowerCase();
  const desc = (expense.description || '').toLowerCase();
  const combined = `${title} ${merchant} ${desc}`;
  
  switch (filter) {
    case 'food_dining': return /food|dining|restaurant|cafe|pizza|burger|domino|swiggy|zomato/.test(combined);
    case 'petrol': return /petrol|fuel|gas|diesel|petroleum|hp|indian oil|bharat/.test(combined);
    case 'toll': return /toll|fastag|highway/.test(combined);
    case 'parking': return /parking|park/.test(combined);
    case 'shopping': return /shopping|retail|store|mall|amazon|flipkart/.test(combined);
    case 'utilities': return /utilities|electric|water|internet|broadband|phone|recharge/.test(combined);
    case 'other': {
      const allPatterns = /food|dining|restaurant|cafe|pizza|burger|domino|swiggy|zomato|petrol|fuel|gas|diesel|petroleum|toll|fastag|highway|parking|park|shopping|retail|store|mall|amazon|flipkart|utilities|electric|water|internet|broadband|phone|recharge/;
      return !allPatterns.test(combined);
    }
    default: return true;
  }
}

function getCategoryLabel(expense: Expense): string {
  const combined = `${expense.title} ${expense.merchant} ${expense.description}`.toLowerCase();
  if (/food|dining|restaurant|cafe|pizza|burger|domino|swiggy|zomato/.test(combined)) return 'Food & Dining';
  if (/petrol|fuel|gas|diesel|petroleum/.test(combined)) return 'Petrol';
  if (/toll|fastag|highway/.test(combined)) return 'Toll';
  if (/parking|park/.test(combined)) return 'Parking';
  if (/shopping|retail|store|mall|amazon|flipkart/.test(combined)) return 'Shopping';
  if (/utilities|electric|water|internet|broadband|phone|recharge/.test(combined)) return 'Utilities';
  return 'Other';
}

export default function MyExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const { toast } = useToast();

  const fetchExpenses = () => {
    if (!user) return;
    setLoading(true);
    supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
  };

  useEffect(() => { fetchExpenses(); }, [user]);

  const filteredExpenses = expenses.filter(e => {
    if (!matchesCategory(e, categoryFilter)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.title.toLowerCase().includes(q) || (e.merchant || '').toLowerCase().includes(q) || String(e.amount).includes(q) || (e.description || '').toLowerCase().includes(q);
  });

  const totalFiltered = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-foreground">All Bills</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {filteredExpenses.length} bill{filteredExpenses.length !== 1 ? 's' : ''} · ₹{totalFiltered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search bills, merchants, amounts..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 min-h-[44px] bg-card border-border/40 rounded-xl"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {CATEGORIES.map(cat => {
          const active = categoryFilter === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                active
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-card border border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <cat.icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Receipt className="mx-auto h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium mb-1">{searchQuery || categoryFilter !== 'all' ? 'No matching bills' : 'No bills yet'}</p>
          <p className="text-sm">{searchQuery ? 'Try adjusting your search or category.' : 'Add your first bill to get started.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredExpenses.map(exp => {
            const CategoryIcon = getCategoryIcon(getCategoryLabel(exp));
            const catLabel = getCategoryLabel(exp);
            return (
              <Link
                key={exp.id}
                to={`/expenses/${exp.id}`}
                className="block rounded-xl bg-card border border-border/30 p-3.5 hover:bg-muted/20 active:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <CategoryIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {exp.merchant || exp.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {catLabel}
                      {exp.description && /\d+\s*item/i.test(exp.description) && (
                        <> · {exp.description.match(/(\d+\s*item[s]?)/i)?.[1]}</>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {exp.cost_center ? exp.cost_center : 'UPI'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-foreground tabular-nums">
                      ₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
