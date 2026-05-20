import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Receipt, PlusCircle, ArrowUpRight, TrendingUp, Search,
  Mail, Users as UsersIcon, Headphones, RefreshCw, User, Sparkles,
  Smartphone, Zap, ShieldCheck, X, Droplets, Heart, Scan, Bot,
  ChevronRight, Upload, Camera, MessageCircle, ShieldQuestion,
  Utensils, Fuel, ParkingCircle, ShoppingBag, Repeat, Plane, Car, Hotel,
  Pill, Gamepad2, GraduationCap, Briefcase, MoreHorizontal,
} from 'lucide-react';
import { smartCategoryFromMerchant } from '@/lib/smart-category';
import { getCurrencySymbol } from '@/lib/countries';
import BillRow from '@/components/bills/BillRow';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import type { Expense } from '@/lib/types';
import SEO from '@/components/SEO';

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
  'Food & Dining': Utensils, Grocery: ShoppingBag, Fuel: Fuel,
  'Toll & Parking': ParkingCircle, Shopping: ShoppingBag, Subscriptions: Repeat,
  Travel: Plane, Transport: Car, 'Hotel & Stay': Hotel, Medical: Pill,
  Entertainment: Gamepad2, Education: GraduationCap, Utilities: Zap, Office: Briefcase, Other: MoreHorizontal,
};
function toBroadCategory(cat: string): string {
  const lower = cat.toLowerCase().trim();
  if (BROAD_CATEGORY_MAP[lower]) return BROAD_CATEGORY_MAP[lower];
  for (const [key, broad] of Object.entries(BROAD_CATEGORY_MAP)) {
    if (lower.includes(key)) return broad;
  }
  return 'Other';
}
function getSmartCategory(expense: Expense): string {
  const descMatch = (expense.description || '').match(/Category:\s*([^|]+)/);
  if (descMatch) { const saved = descMatch[1].trim(); if (saved && saved !== 'Other') return saved; }
  const combined = `${expense.title} ${expense.merchant} ${expense.description} ${expense.cost_center}`;
  return smartCategoryFromMerchant(combined) || 'Other';
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [billSelectorFor, setBillSelectorFor] = useState<'split' | 'support' | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('expenses').select('*').eq('user_id', user.id).order('expense_date', { ascending: true }),
    ]).then(([recentRes, allRes]) => {
      setExpenses((recentRes.data as unknown as Expense[]) || []);
      setAllExpenses((allRes.data as unknown as Expense[]) || []);
      setLoading(false);
    });
  }, [user]);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const last30 = allExpenses.filter(e => new Date(e.expense_date) >= thirtyDaysAgo);
  const prev30 = allExpenses.filter(e => {
    const d = new Date(e.expense_date);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });
  const totalLast30 = last30.reduce((s, e) => s + Number(e.amount), 0);
  const totalPrev30 = prev30.reduce((s, e) => s + Number(e.amount), 0);
  const pctChange = totalPrev30 > 0 ? Math.round(((totalLast30 - totalPrev30) / totalPrev30) * 100) : null;

  const leakEstimate = useMemo(() => {
    let leak = 0;
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthExpenses = allExpenses.filter(e => new Date(e.expense_date) >= thisMonthStart);
    thisMonthExpenses.forEach(e => {
      const h = new Date(e.created_at).getHours();
      if (h >= 22 || h <= 5) leak += Number(e.amount) * 0.2;
    });
    const foodish = thisMonthExpenses.filter(e => (e.merchant || '').toLowerCase().match(/swiggy|zomato|food|cafe|restaurant|coffee/));
    if (foodish.length > 10) leak += foodish.reduce((s, e) => s + Number(e.amount), 0) * 0.3;
    return Math.round(leak);
  }, [allExpenses, now]);

  // Category-based chart data for last 30 days
  const categoryData = useMemo(() => {
    const catMap: Record<string, number> = {};
    last30.forEach(e => {
      const cat = (e.description || '').toLowerCase();
      let label = 'Other';
      if (cat.match(/food|restaurant|cafe|swiggy|zomato|coffee|dining/)) label = 'Food';
      else if (cat.match(/travel|uber|ola|cab|fuel|petrol|flight|train/)) label = 'Travel';
      else if (cat.match(/bill|recharge|electricity|water|internet|phone/)) label = 'Bills';
      else if (cat.match(/shop|amazon|flipkart|cloth|fashion/)) label = 'Shopping';
      else if (cat.match(/health|medical|pharma|doctor|hospital/)) label = 'Health';
      else if ((e.merchant || '').toLowerCase().match(/food|restaurant|cafe|swiggy|zomato|coffee/)) label = 'Food';
      else if ((e.merchant || '').toLowerCase().match(/uber|ola|cab|fuel|petrol/)) label = 'Travel';
      else if ((e.merchant || '').toLowerCase().match(/amazon|flipkart|shop/)) label = 'Shopping';
      catMap[label] = (catMap[label] || 0) + Number(e.amount);
    });
    const colors: Record<string, string> = {
      Food: 'hsl(43, 80%, 50%)',
      Travel: 'hsl(199, 70%, 45%)',
      Bills: 'hsl(152, 45%, 35%)',
      Shopping: 'hsl(280, 50%, 55%)',
      Health: 'hsl(0, 63%, 50%)',
      Other: 'hsl(160, 8%, 40%)',
    };
    return Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount),
        fill: colors[name] || colors.Other,
      }));
  }, [last30]);

  const maxCatAmount = Math.max(...categoryData.map(d => d.amount), 1);

  const quickActions = [
    { label: 'Split', icon: UsersIcon, path: '/splits', color: 'text-primary' },
    { label: 'Subscriptions', icon: Repeat, path: '/subscriptions', color: 'text-gold' },
    { label: 'Support', icon: Headphones, path: '/support', color: 'text-info' },
    { label: 'Warranty', icon: ShieldQuestion, path: '/warranties', color: 'text-primary' },
  ];

  const firstName =
    profile?.full_name?.split(' ')[0] ||
    user?.user_metadata?.full_name?.split(' ')[0] ||
    'User';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-6">
      <SEO title="Dashboard" description="Your EZ Bill dashboard — see recent bills, monthly spending, and quick actions at a glance." path="/" />
      {/* Bill Selector Modal */}
      {billSelectorFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'hsla(160, 10%, 6%, 0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl max-h-[70vh] flex flex-col animate-slide-up glass-card border-border/20">
            <div className="flex items-center justify-between p-4 border-b border-border/20">
              <h3 className="text-base font-bold text-foreground">
                {billSelectorFor === 'split' ? 'Select Bill to Split' : 'Select Bill for Support'}
              </h3>
              <button onClick={() => setBillSelectorFor(null)} className="glass-button rounded-full h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {allExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No bills found</p>
              ) : (
                allExpenses.slice().reverse().map(exp => (
                  <BillRow
                    key={exp.id}
                    expense={exp}
                    onClick={() => {
                      setBillSelectorFor(null);
                      if (billSelectorFor === 'split') navigate(`/expenses/${exp.id}/split`);
                      else navigate(`/expenses/${exp.id}/support`);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="flex items-center justify-between md:hidden">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Welcome back</p>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight mt-0.5">
            Hi, <span className="text-gold-gradient">{firstName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {[
            { icon: RefreshCw, path: '/email-bills' },
            { icon: Sparkles, path: '/ask-ai' },
            { icon: User, path: '/profile' },
          ].map(btn => (
            <button key={btn.path} onClick={() => navigate(btn.path)}
              className="h-9 w-9 rounded-full glass-button flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-95">
              <btn.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden md:block">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Hi, {firstName} 👋</h1>
        <p className="text-muted-foreground mt-1 text-sm">Your money control dashboard</p>
      </div>

      {/* ━━━ 1. HERO — LAST 30 DAYS (2026 redesign) ━━━ */}
      <button
        onClick={() => navigate('/analytics')}
        className="group w-full text-left rounded-[28px] p-5 relative overflow-hidden transition-all active:scale-[0.985]"
        style={{
          background: 'linear-gradient(150deg, hsla(160, 14%, 13%, 0.7) 0%, hsla(160, 12%, 9%, 0.55) 60%, hsla(152, 30%, 12%, 0.55) 100%)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid hsla(0, 0%, 100%, 0.06)',
          boxShadow:
            'inset 0 1px 0 0 hsla(0,0%,100%,0.08), inset 0 -1px 0 0 hsla(0,0%,0%,0.2), 0 24px 60px -20px hsla(152, 45%, 20%, 0.5)',
        }}
      >
        {/* Ambient aurora orbs */}
        <div
          aria-hidden
          className="absolute -top-16 -right-12 h-48 w-48 rounded-full blur-3xl opacity-60 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(152, 70%, 45%, 0.35), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-10 h-44 w-44 rounded-full blur-3xl opacity-50 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(43, 80%, 50%, 0.22), transparent 70%)' }}
        />
        {/* subtle top hairline highlight */}
        <div aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, hsla(0,0%,100%,0.25), transparent)' }} />

        <div className="relative z-10">
          {/* Top row: label + meta chip */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">Last 30 days</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-foreground/70 px-2 py-0.5 rounded-full"
                style={{ background: 'hsla(0,0%,100%,0.05)', border: '1px solid hsla(0,0%,100%,0.07)' }}>
                {last30.length} bills
              </span>
              <div className="h-6 w-6 rounded-full flex items-center justify-center"
                style={{ background: 'hsla(0,0%,100%,0.06)', border: '1px solid hsla(0,0%,100%,0.08)' }}>
                <ArrowUpRight className="h-3 w-3 text-foreground/80" />
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-[28px] leading-none font-light text-foreground/60 tabular-nums">₹</span>
            <span className="text-[44px] leading-none font-semibold text-foreground tabular-nums tracking-tight">
              {Math.round(totalLast30).toLocaleString('en-IN')}
            </span>
            {pctChange !== null && (
              <span className={`ml-1 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${
                pctChange > 0
                  ? 'text-destructive'
                  : 'text-success'
              }`}
                style={{
                  background: pctChange > 0 ? 'hsla(0, 63%, 45%, 0.12)' : 'hsla(152, 55%, 40%, 0.14)',
                  border: `1px solid ${pctChange > 0 ? 'hsla(0, 63%, 55%, 0.2)' : 'hsla(152, 55%, 50%, 0.2)'}`,
                }}>
                <span className="text-[11px] leading-none">{pctChange > 0 ? '↑' : '↓'}</span>
                {Math.abs(pctChange)}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Total spent · vs previous 30 days</p>

          {/* Stacked segmented spend bar */}
          {categoryData.length > 0 && (
            <>
              <div className="mt-5 h-2 w-full rounded-full overflow-hidden flex"
                style={{ background: 'hsla(0,0%,100%,0.04)' }}>
                {categoryData.map(cat => {
                  const pct = (cat.amount / totalLast30) * 100;
                  return (
                    <div
                      key={cat.name}
                      className="h-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: cat.fill }}
                    />
                  );
                })}
              </div>

              {/* Category legend chips */}
              <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2">
                {categoryData.slice(0, 4).map(cat => {
                  const pct = Math.round((cat.amount / totalLast30) * 100);
                  return (
                    <div key={cat.name} className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cat.fill, boxShadow: `0 0 8px ${cat.fill}` }} />
                      <span className="text-[11px] text-foreground/85 truncate flex-1">{cat.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </button>

      {/* ━━━ 2. MONEY LEAKS — refined glass row ━━━ */}
      <button
        onClick={() => navigate('/money-leaks')}
        className="w-full rounded-2xl p-3.5 text-left transition-all active:scale-[0.985] flex items-center gap-3 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsla(43, 50%, 18%, 0.35), hsla(160, 12%, 10%, 0.5))',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          border: '1px solid hsla(43, 80%, 50%, 0.18)',
          boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.05), 0 8px 28px -10px hsla(43, 80%, 40%, 0.25)',
        }}
      >
        <div aria-hidden className="absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-50 pointer-events-none"
          style={{ background: 'hsla(43, 80%, 50%, 0.35)' }} />
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 relative"
          style={{
            background: 'linear-gradient(135deg, hsla(43, 80%, 50%, 0.22), hsla(43, 80%, 40%, 0.08))',
            border: '1px solid hsla(43, 80%, 50%, 0.25)',
          }}>
          <Droplets className="h-4 w-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0 relative">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">Money Leaked</p>
            {leakEstimate > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: 'hsla(43, 80%, 50%, 0.18)', color: 'hsl(var(--gold))', border: '1px solid hsla(43, 80%, 50%, 0.3)' }}>
                Avoidable
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {leakEstimate > 0
              ? `₹${leakEstimate.toLocaleString('en-IN')} · AI financial advisor found leaks`
              : 'Your personal AI financial advisor'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 relative" />
      </button>

      {/* ━━━ 3. QUICK ACTIONS — premium squircle tiles ━━━ */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((action) => {
            const tintMap: Record<string, string> = {
              'text-primary': 'hsla(152, 45%, 45%, 0.18)',
              'text-gold': 'hsla(43, 80%, 50%, 0.18)',
              'text-info': 'hsla(199, 70%, 45%, 0.18)',
            };
            const borderMap: Record<string, string> = {
              'text-primary': 'hsla(152, 45%, 45%, 0.22)',
              'text-gold': 'hsla(43, 80%, 50%, 0.22)',
              'text-info': 'hsla(199, 70%, 45%, 0.22)',
            };
            const tint = tintMap[action.color] || tintMap['text-primary'];
            const bord = borderMap[action.color] || borderMap['text-primary'];
            return (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="group flex flex-col items-center gap-2 pt-3 pb-2.5 rounded-2xl transition-all active:scale-95 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.55), hsla(160, 12%, 9%, 0.35))',
                  backdropFilter: 'blur(20px) saturate(1.4)',
                  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                  border: '1px solid hsla(0,0%,100%,0.05)',
                  boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.06)',
                }}
              >
                <div className="h-10 w-10 rounded-xl flex items-center justify-center relative"
                  style={{
                    background: `linear-gradient(135deg, ${tint}, transparent)`,
                    border: `1px solid ${bord}`,
                  }}>
                  <action.icon className={`h-[18px] w-[18px] ${action.color}`} />
                </div>
                <span className="text-[10px] text-foreground/85 font-medium leading-tight text-center">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section divider label for recent bills */}
      <div className="hidden" />

      {/* ━━━ 4. RECENT BILLS — structured list ━━━ */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold text-foreground">Recent Bills</h2>
          <Link to="/expenses" className="text-[11px] text-gold font-medium flex items-center gap-0.5">
            View All <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {expenses.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Receipt className="mx-auto h-10 w-10 mb-3 text-muted-foreground/40" />
            <p className="font-medium text-foreground mb-1 text-sm">No bills yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first bill to get started</p>
            <Button asChild size="sm" className="rounded-xl">
              <Link to="/expenses/new"><PlusCircle className="mr-2 h-4 w-4" /> New Bill</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.slice(0, 5).map((exp) => {
              const rawCat = getSmartCategory(exp);
              const broadCat = toBroadCategory(rawCat);
              const CategoryIcon = BROAD_CATEGORY_ICONS[broadCat] || Receipt;
              const isSub = broadCat === 'Subscriptions';
              const currSym = getCurrencySymbol(exp.currency || 'INR');
              return (
                <Link
                  key={exp.id}
                  to={`/expenses/${exp.id}`}
                  className="block rounded-xl bg-card border border-border/30 p-3.5 hover:bg-muted/20 active:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${isSub ? 'bg-purple-500/10' : 'bg-primary/10'}`}>
                      <CategoryIcon className={`h-5 w-5 ${isSub ? 'text-purple-500' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {exp.merchant || exp.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <span>{broadCat}</span>
                        {isSub && <span className="text-purple-400"> · Recurring</span>}
                        {exp.description && /\d+\s*item/i.test(exp.description) && (
                          <> · {exp.description.match(/(\d+\s*item[s]?)/i)?.[1]}</>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {exp.cost_center || 'UPI'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-foreground tabular-nums">
                        {currSym}{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* Desktop Charts */}
      <div className="hidden md:grid gap-5 grid-cols-1 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Category Breakdown
              </h3>
            </div>
          </div>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={categoryData} barSize={24} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, 'Spent']}
                  contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsla(160, 12%, 12%, 0.9)', backdropFilter: 'blur(16px)', color: 'hsl(60, 10%, 95%)' }}
                />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Recent Bills</h3>
            <Link to="/expenses" className="text-xs text-gold font-medium flex items-center gap-1">
              View All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {expenses.slice(0, 5).map(exp => (
              <Link key={exp.id} to={`/expenses/${exp.id}`}
                className="flex items-center justify-between p-2.5 rounded-xl glass-card-hover">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{exp.title}</p>
                  <p className="text-xs text-muted-foreground">{exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString()}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-bold tabular-nums text-foreground">₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ━━━ 5. HOW EZ BILL WORKS — refined 4-step flow ━━━ */}
      <div className="pt-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">How it works</p>
          <span className="text-[10px] text-muted-foreground/70">4 simple steps</span>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: 'Capture', sub: 'Photo, PDF or SMS', icon: Camera },
              { label: 'AI Extract', sub: 'Auto-filled data', icon: Bot },
              { label: 'Analyze', sub: 'Spend insights', icon: TrendingUp },
              { label: 'Act', sub: 'Split · Cancel · Support', icon: Sparkles },
            ].map((step, i) => (
              <div key={step.label} className="flex flex-col items-center text-center relative">
                {i < 3 && (
                  <div
                    className="absolute top-5 left-[60%] right-[-40%] h-px"
                    style={{
                      background: 'linear-gradient(90deg, hsla(152, 45%, 45%, 0.4), hsla(43, 80%, 50%, 0.2))',
                    }}
                  />
                )}
                <div className="relative h-10 w-10 rounded-xl flex items-center justify-center mb-1.5 z-10"
                  style={{
                    background: 'linear-gradient(135deg, hsla(152, 45%, 35%, 0.18), hsla(43, 80%, 50%, 0.08))',
                    border: '1px solid hsla(152, 45%, 45%, 0.2)',
                  }}>
                  <step.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-[10px] font-semibold text-foreground leading-tight">{step.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{step.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ━━━ 6. WHAT EZ BILL DOES FOR YOU — feature-led, reflects new modules ━━━ */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">What you get</p>
          <span className="text-[10px] text-gold/80 font-medium">All-in-one</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Scan, title: 'Smart OCR', desc: 'GST · UPI · handwritten', tint: 'hsla(152, 45%, 45%, 0.14)', color: 'text-primary' },
            { icon: Droplets, title: 'AI Money Leaks', desc: 'Personalised advice', tint: 'hsla(43, 80%, 50%, 0.14)', color: 'text-gold' },
            { icon: UsersIcon, title: 'Smart Split', desc: 'Friends & balances', tint: 'hsla(199, 70%, 45%, 0.14)', color: 'text-info' },
            { icon: Repeat, title: 'Subscriptions', desc: 'Track & cancel waste', tint: 'hsla(280, 50%, 55%, 0.14)', color: 'text-purple-400' },
            { icon: Headphones, title: 'Support Hub', desc: 'Reach any merchant', tint: 'hsla(199, 70%, 45%, 0.14)', color: 'text-info' },
            { icon: Bot, title: 'Ask AI', desc: 'Chat with your money', tint: 'hsla(152, 45%, 45%, 0.14)', color: 'text-primary' },
          ].map(item => (
            <div
              key={item.title}
              aria-disabled="true"
              className="rounded-xl p-3 flex items-start gap-2.5 select-none pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, hsla(160, 12%, 16%, 0.55), hsla(160, 12%, 10%, 0.35))',
                backdropFilter: 'blur(20px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                border: '1px solid hsla(160, 10%, 60%, 0.12)',
                boxShadow: 'inset 0 1px 0 0 hsla(0, 0%, 100%, 0.04)',
              }}
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: item.tint }}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground leading-tight">{item.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Trust strip */}
        <div className="flex items-center justify-around mt-3 px-2 py-2.5 rounded-xl"
          style={{ background: 'hsla(160, 12%, 14%, 0.4)', border: '1px solid hsla(160, 10%, 40%, 0.08)' }}>
          {[
            { icon: ShieldCheck, label: 'Privacy first' },
            { icon: Zap, label: 'Instant' },
            { icon: Smartphone, label: 'Mobile-first' },
          ].map(t => (
            <div key={t.label} className="flex items-center gap-1.5">
              <t.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ 7. BUILT IN INDIA — refined brand statement ━━━ */}
      <div className="pt-5 pb-2">
        <div className="relative rounded-2xl p-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, hsla(152, 45%, 25%, 0.18), hsla(43, 80%, 50%, 0.08))',
            border: '1px solid hsla(43, 80%, 50%, 0.12)',
          }}>
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-40"
            style={{ background: 'hsla(43, 80%, 50%, 0.25)' }} />
          <div className="relative text-center">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-2.5"
              style={{ background: 'hsla(160, 12%, 10%, 0.5)', border: '1px solid hsla(160, 10%, 40%, 0.15)' }}>
              <span className="text-sm leading-none">🇮🇳</span>
              <span className="text-[9px] font-bold text-foreground uppercase tracking-widest">Made in India</span>
              <Heart className="h-2.5 w-2.5 text-destructive fill-destructive" />
            </div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Built for how India pays
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[280px] mx-auto mt-1.5">
              GST invoices, UPI receipts, kirana scribbles — we read them all. Your money, your rules.
            </p>
            <div className="flex items-center justify-center flex-wrap gap-1.5 mt-3.5">
              {['INR First', 'GST Ready', 'UPI Smart', 'WhatsApp Bills'].map(tag => (
                <span key={tag} className="text-[9px] text-foreground/80 font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                  style={{ background: 'hsla(160, 12%, 10%, 0.55)', border: '1px solid hsla(43, 80%, 50%, 0.18)' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
