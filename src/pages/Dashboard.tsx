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
  ChevronRight, Flag,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Expense } from '@/lib/types';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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
  const last30 = allExpenses.filter(e => new Date(e.expense_date) >= thirtyDaysAgo);
  const totalLast30 = last30.reduce((s, e) => s + Number(e.amount), 0);
  const total = allExpenses.reduce((s, e) => s + Number(e.amount), 0);

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

  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    last30.forEach(e => {
      const d = new Date(e.expense_date);
      const day = d.getDate();
      map[String(day)] = (map[String(day)] || 0) + Number(e.amount);
    });
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, amount]) => ({ day, amount: Math.round(amount * 100) / 100 }));
  }, [last30]);

  const filteredRecent = expenses.filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.title.toLowerCase().includes(q) || (e.merchant || '').toLowerCase().includes(q) || String(e.amount).includes(q);
  });

  const quickActions = [
    { label: 'Split Bills', icon: UsersIcon, action: () => setBillSelectorFor('split'), color: 'text-primary' },
    { label: 'Bill Support', icon: Headphones, action: () => setBillSelectorFor('support'), color: 'text-gold' },
    { label: 'Scan Email', icon: Mail, path: '/email-bills', color: 'text-info' },
    { label: 'UPI Bills', icon: Smartphone, path: '/email-bills?tab=upi', color: 'text-primary' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/expenses?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const firstName =
    profile?.full_name?.split(' ')[0] ||
    user?.user_metadata?.full_name?.split(' ')[0] ||
    'User';

  const howToSteps = [
    { num: 1, title: 'Upload Your Bill', desc: 'Take a photo or upload a PDF using the + button.', icon: Scan },
    { num: 2, title: 'AI Processes Your Data', desc: 'Extracts merchant, items, amounts, and dates automatically.', icon: Bot },
    { num: 3, title: 'Review & Analyze', desc: 'Review data, track spending with smart insights.', icon: TrendingUp },
    { num: 4, title: 'Split or Claim', desc: 'Split with friends or claim warranty support.', icon: UsersIcon },
  ];

  const usps = [
    { icon: Scan, title: 'Smart OCR', desc: 'AI-powered bill scanning that works with Indian formats — GST, UPI, handwritten receipts.' },
    { icon: Droplets, title: 'Money Leaks', desc: 'Discover hidden spending patterns and get AI-powered advice to save money.' },
    { icon: ShieldCheck, title: 'Privacy First', desc: 'Your data stays secure. No unnecessary tracking, ever.' },
    { icon: Zap, title: 'Lightning Fast', desc: 'Process bills in seconds. Instant categorization & insights.' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto md:max-w-none animate-fade-in">
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
          <p className="text-xs text-muted-foreground">Manage your bills smartly</p>
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
        <p className="text-muted-foreground mt-1 text-sm">Manage your bills smartly</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search bills, merchants, or amounts…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 h-11 rounded-2xl border-border/20 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/50"
          style={{
            background: 'hsla(160, 12%, 14%, 0.5)',
            backdropFilter: 'blur(16px)',
          }}
        />
      </form>

      {/* Dashboard Summary Card */}
      <div className="glass-card rounded-2xl p-5 animate-slide-up liquid-shimmer relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last 30 Days</p>
            <span className="text-xs text-gold font-medium glass-button px-2 py-0.5 rounded-full">{last30.length} bills</span>
          </div>
          <p className="text-3xl font-bold text-foreground mb-3">
            ₹{totalLast30.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {monthlyData.length > 0 && (
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={monthlyData} barSize={6}>
                <Bar dataKey="amount" fill="hsl(152, 45%, 35%)" radius={[3, 3, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Money Leak Card */}
      {leakEstimate > 0 && (
        <button
          onClick={() => navigate('/money-leaks')}
          className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.98] animate-slide-up"
          style={{
            background: 'hsla(0, 63%, 45%, 0.08)',
            backdropFilter: 'blur(28px)',
            border: '1px solid hsla(0, 63%, 45%, 0.15)',
            boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.04), 0 8px 32px -8px hsla(0, 63%, 45%, 0.15)',
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: 'hsla(0, 63%, 45%, 0.15)' }}>
              <Droplets className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">💧 Money Leak Detected</p>
              <p className="text-xs text-muted-foreground">You lost ₹{leakEstimate.toLocaleString('en-IN')} this month in avoidable spending</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-gold shrink-0" />
          </div>
          <p className="text-xs text-gold font-medium">See Why →</p>
        </button>
      )}

      {/* Recent Bills */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Recent Bills</h2>
          <Link to="/expenses" className="text-xs text-gold font-medium flex items-center gap-1">
            View All <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {filteredRecent.length === 0 ? (
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
            {filteredRecent.slice(0, 5).map(exp => (
              <Link key={exp.id} to={`/expenses/${exp.id}`}
                className="glass-card-hover block rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-foreground truncate mr-2">{exp.title}</span>
                  <span className="font-bold text-sm tabular-nums text-foreground">₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => action.action ? action.action() : navigate(action.path!)}
              className="flex flex-col items-center gap-1.5 min-w-[64px] shrink-0"
            >
              <div className="h-12 w-12 rounded-xl glass-button flex items-center justify-center transition-transform active:scale-95">
                <action.icon className={`h-5 w-5 ${action.color}`} />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Charts */}
      <div className="hidden md:grid gap-5 grid-cols-1 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Spending Trend
              </h3>
              <p className="text-2xl font-bold text-foreground mt-1">
                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(160, 8%, 25%, 0.3)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
              <Tooltip
                formatter={(val: number) => [`₹${val.toFixed(2)}`, 'Spent']}
                contentStyle={{ borderRadius: '16px', border: 'none', background: 'hsla(160, 12%, 12%, 0.9)', backdropFilter: 'blur(16px)', color: 'hsl(60, 10%, 95%)' }}
              />
              <Bar dataKey="amount" fill="hsl(152, 45%, 35%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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

      {/* ── How to Use EZBill ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">How to Use EZ Bill</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {howToSteps.map(step => (
            <div key={step.num} className="glass-card-hover rounded-2xl p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl glass-button flex items-center justify-center shrink-0">
                <step.icon className="h-4 w-4 text-gold" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Money Leaks Promo ── */}
      <button
        onClick={() => navigate('/money-leaks')}
        className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.98] relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsla(152, 45%, 20%, 0.4), hsla(199, 70%, 25%, 0.3))',
          backdropFilter: 'blur(28px)',
          border: '1px solid hsla(152, 45%, 35%, 0.2)',
          boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.06), 0 8px 32px -8px hsla(152, 45%, 35%, 0.2)',
        }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Droplets className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold text-foreground">Money Leaks</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/20 text-gold ml-auto">New</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Your personal AI financial advisor. Discover where your money is leaking, get actionable insights, and save more every month.
          </p>
          <div className="flex items-center gap-2 text-xs text-gold font-medium">
            Explore Money Leaks <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </button>

      {/* ── USPs ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Why EZ Bill?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {usps.map(usp => (
            <div key={usp.title} className="glass-card-hover rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-xl glass-button flex items-center justify-center shrink-0">
                  <usp.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{usp.title}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-12">{usp.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Built in India 🇮🇳 ── */}
      <div className="glass-card rounded-2xl p-6 text-center relative overflow-hidden">
        <div className="liquid-shimmer absolute inset-0 z-0" />
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl">🇮🇳</span>
            <Heart className="h-4 w-4 text-destructive" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            Built in India, for India
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Designed for Indian bills — GST, UPI receipts, handwritten invoices, and more. Your money, your language, your way.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider glass-button px-3 py-1 rounded-full">INR First</span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider glass-button px-3 py-1 rounded-full">GST Ready</span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider glass-button px-3 py-1 rounded-full">UPI Smart</span>
          </div>
        </div>
      </div>
    </div>
  );
}
