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
  ChevronRight, Upload, Camera, MessageCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import type { Expense } from '@/lib/types';

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
    { label: 'Upload Bill', icon: Upload, path: '/expenses/bulk-upload', color: 'text-primary' },
    { label: 'Scan Bill', icon: Camera, path: '/expenses/new', color: 'text-gold' },
    { label: 'Sync Gmail', icon: Mail, path: '/email-bills', color: 'text-info' },
    { label: 'WhatsApp', icon: MessageCircle, path: '/email-bills?tab=upi', color: 'text-primary' },
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
                  <button key={exp.id}
                    onClick={() => {
                      setBillSelectorFor(null);
                      if (billSelectorFor === 'split') navigate(`/expenses/${exp.id}/split`);
                      else navigate(`/expenses/${exp.id}/support`);
                    }}
                    className="w-full text-left glass-card-hover rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-foreground truncate mr-2">{exp.title}</span>
                      <span className="font-bold text-sm tabular-nums text-foreground">₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString()}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="flex items-center justify-between md:hidden">
        <div>
          <h1 className="text-xl font-bold text-foreground">Hi, {firstName} 👋</h1>
          <p className="text-xs text-muted-foreground">Your money control dashboard</p>
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

      {/* ━━━ 1. LAST 30 DAYS INSIGHTS CARD ━━━ */}
      <button
        onClick={() => navigate('/analytics')}
        className="w-full text-left glass-card rounded-2xl p-4 relative overflow-hidden transition-all active:scale-[0.98]"
      >
        <div className="liquid-shimmer absolute inset-0 z-0" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Last 30 Days</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total Spent</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground glass-button px-2 py-0.5 rounded-full">{last30.length} bills</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-gold" />
            </div>
          </div>

          <div className="flex items-end justify-between mb-3">
            <p className="text-2xl font-bold text-foreground tabular-nums">
              ₹{totalLast30.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            {pctChange !== null && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                pctChange > 0
                  ? 'text-destructive bg-destructive/10'
                  : 'text-success bg-success/10'
              }`}>
                {pctChange > 0 ? '↑' : '↓'} {Math.abs(pctChange)}% vs prev
              </span>
            )}
          </div>

          {categoryData.length > 0 && (
            <div className="space-y-1.5">
              {categoryData.map(cat => (
                <div key={cat.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14 truncate">{cat.name}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'hsla(160, 8%, 20%, 0.5)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(cat.amount / maxCatAmount) * 100}%`,
                        background: cat.fill,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">₹{cat.amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* ━━━ 2. MONEY LEAKS CARD ━━━ */}
      <button
        onClick={() => navigate('/money-leaks')}
        className="w-full rounded-xl p-3.5 text-left transition-all active:scale-[0.98] flex items-center gap-3"
        style={{
          background: 'hsla(43, 60%, 20%, 0.12)',
          border: '1px solid hsla(43, 80%, 50%, 0.12)',
        }}
      >
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'hsla(43, 80%, 50%, 0.12)' }}>
          <Droplets className="h-4 w-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Money Leaked</p>
            {leakEstimate > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold">Avoidable</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {leakEstimate > 0
              ? `₹${leakEstimate.toLocaleString('en-IN')} — Your AI financial advisor found leaks`
              : 'Your personal AI financial advisor — discover leaks'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {/* ━━━ 3. QUICK ACTIONS ━━━ */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2.5">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all active:scale-95"
              style={{
                background: 'hsla(160, 12%, 14%, 0.4)',
                border: '1px solid hsla(160, 10%, 40%, 0.08)',
              }}
            >
              <div className="h-9 w-9 rounded-lg flex items-center justify-center"
                style={{ background: 'hsla(160, 12%, 18%, 0.5)' }}>
                <action.icon className={`h-4 w-4 ${action.color}`} />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium leading-tight text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

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
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid hsla(160, 10%, 40%, 0.08)' }}>
            {expenses.slice(0, 5).map((exp, idx) => (
              <Link key={exp.id} to={`/expenses/${exp.id}`}
                className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/20 active:bg-muted/30"
                style={{
                  borderBottom: idx < Math.min(expenses.length, 5) - 1 ? '1px solid hsla(160, 10%, 40%, 0.08)' : 'none',
                  background: idx % 2 === 0 ? 'hsla(160, 12%, 12%, 0.3)' : 'transparent',
                }}
              >
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'hsla(160, 12%, 18%, 0.5)' }}>
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{exp.title}</p>
                  <p className="text-[10px] text-muted-foreground">{exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-foreground">₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{exp.status}</p>
                </div>
              </Link>
            ))}
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

      {/* ━━━ 5. HOW TO USE EZ BILL — static, non-clickable ━━━ */}
      <div className="pt-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">How to use EZ Bill</p>
        <div className="flex items-start gap-0 overflow-x-auto pb-1">
          {[
            { num: '1', label: 'Upload', sub: 'Photo or PDF', icon: Scan },
            { num: '2', label: 'AI Extracts', sub: 'Auto-fill data', icon: Bot },
            { num: '3', label: 'Analyze', sub: 'Track spending', icon: TrendingUp },
            { num: '4', label: 'Split/Claim', sub: 'Share or support', icon: UsersIcon },
          ].map((step, i) => (
            <div key={step.num} className="flex items-center shrink-0">
              <div className="flex flex-col items-center text-center w-[72px]">
                <div className="h-8 w-8 rounded-full flex items-center justify-center mb-1"
                  style={{ background: 'hsla(152, 45%, 35%, 0.12)' }}>
                  <step.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-[10px] font-semibold text-foreground leading-tight">{step.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">{step.sub}</p>
              </div>
              {i < 3 && (
                <div className="w-4 h-px mx-0.5 mt-[-12px]" style={{ background: 'hsla(160, 8%, 40%, 0.3)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ 6. WHY EZ BILL — informational, no card styling ━━━ */}
      <div className="pt-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Why EZ Bill</p>
        <div className="space-y-3">
          {[
            { icon: Scan, title: 'Smart OCR', desc: 'AI bill scanning — GST, UPI, handwritten receipts.' },
            { icon: Droplets, title: 'Money Leaks', desc: 'Discover hidden patterns. Get advice to save.' },
            { icon: ShieldCheck, title: 'Privacy First', desc: 'Your data stays secure. No unnecessary tracking.' },
            { icon: Zap, title: 'Lightning Fast', desc: 'Process bills in seconds. Instant insights.' },
          ].map(usp => (
            <div key={usp.title} className="flex items-start gap-3">
              <usp.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-foreground">{usp.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{usp.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ 7. BUILT IN INDIA — brand statement, not a card ━━━ */}
      <div className="pt-4 pb-2">
        <div className="h-px w-full mb-5" style={{ background: 'hsla(160, 8%, 30%, 0.2)' }} />
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <span className="text-lg">🇮🇳</span>
            <Heart className="h-3 w-3 text-destructive" />
          </div>
          <h3 className="text-sm font-bold text-foreground tracking-tight">
            Built in India, for India
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px] mx-auto mt-1">
            Designed for Indian bills — GST, UPI receipts, handwritten invoices. Your money, your way.
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            {['INR First', 'GST Ready', 'UPI Smart'].map(tag => (
              <span key={tag} className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                style={{ background: 'hsla(160, 8%, 20%, 0.4)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
