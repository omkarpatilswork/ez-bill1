import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Search, Headphones, Receipt, ChevronRight, Store, Bell,
} from 'lucide-react';
import type { Expense } from '@/lib/types';

type MerchantGroup = {
  key: string;
  display: string;
  count: number;
  totalAmount: number;
  lastDate: string;
  lastTitle: string;
  latestExpenseId: string;
  currency: string;
};

function normalizeMerchant(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|company|co|services?|technologies|technology|india|in)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function prettyMerchant(name: string): string {
  return name.replace(/\b\w/g, c => c.toUpperCase()).trim();
}

export default function Support() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
  }, [user]);

  const groups = useMemo<MerchantGroup[]>(() => {
    const map = new Map<string, MerchantGroup>();
    for (const e of expenses) {
      const raw = (e.merchant && e.merchant.trim()) || e.title || '';
      if (!raw) continue;
      const key = normalizeMerchant(raw) || raw.toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += Number(e.amount || 0);
        // Expenses are pre-sorted desc, so first one we see is latest.
      } else {
        map.set(key, {
          key,
          display: prettyMerchant(raw),
          count: 1,
          totalAmount: Number(e.amount || 0),
          lastDate: e.expense_date,
          lastTitle: e.title || raw,
          latestExpenseId: e.id,
          currency: e.currency || 'INR',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // Most recently used first, then by count
      const da = new Date(a.lastDate).getTime();
      const db = new Date(b.lastDate).getTime();
      if (db !== da) return db - da;
      return b.count - a.count;
    });
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.display.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: 'hsla(199, 70%, 45%, 0.12)' }}
        >
          <Headphones className="h-5 w-5 text-info" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Your Support Hub</h1>
          <p className="text-xs text-muted-foreground">
            Contacts for the brands you actually buy from
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your merchants..."
          className="w-full pl-10 pr-4 py-3 rounded-xl glass-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* Reminder hint */}
      <div className="glass-card rounded-xl p-3 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4 text-amber-400" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Open any merchant below and turn on the return-window reminder to get
          notified before the window closes.
        </p>
      </div>

      {/* Merchants list */}
      {loading ? (
        <div className="glass-card rounded-2xl p-6 text-center text-sm text-muted-foreground">
          Loading your merchants…
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Receipt className="mx-auto h-9 w-9 mb-2 text-muted-foreground/40" />
          <p className="text-sm text-foreground font-medium mb-1">
            {expenses.length === 0 ? 'No bills yet' : 'No matches'}
          </p>
          <p className="text-xs text-muted-foreground">
            {expenses.length === 0
              ? 'Add a bill to see its merchant support contacts here.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
            {filtered.length} merchant{filtered.length === 1 ? '' : 's'} from your bills
          </p>
          {filtered.map((g) => (
            <button
              key={g.key}
              onClick={() => navigate(`/expenses/${g.latestExpenseId}/support`)}
              className="w-full text-left rounded-xl glass-card p-3.5 hover:bg-muted/20 active:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Store className="h-5 w-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {g.display}
                    </p>
                    <span className="text-[10px] font-medium text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded-full shrink-0">
                      {g.count} bill{g.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    Last: {g.lastTitle} · {new Date(g.lastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-info shrink-0">
                  Get Support
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}