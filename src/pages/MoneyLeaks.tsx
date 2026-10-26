import SEO from '@/components/SEO';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Droplets, ArrowLeft, Utensils, ShoppingBag, Plane, Tv, CreditCard,
  Sparkles, Send, Share2, Target, Lightbulb, ArrowDownRight, ArrowUpRight,
  Loader2, Settings, Wallet, AlertTriangle, Zap, TrendingDown, Bell, Repeat, ChevronRight,
  ChevronLeft, Coins, Copy, Check, Plus, Mail, BellRing, CalendarDays,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Expense } from '@/lib/types';
import {
  computeLeaks, computeIdealBudget, safeDailySpend, toLeakCategory, leakGrade,
  type MoneyProfile, type LeakResult, type LeakCategory,
} from '@/lib/leak-engine';
import { detectSubscriptions } from '@/lib/subscription-engine';
import MoneyProfileQuiz from '@/components/money-leaks/MoneyProfileQuiz';

const CAT_ICONS: Record<string, any> = {
  Food: Utensils, Travel: Plane, Shopping: ShoppingBag,
  Subscriptions: Tv, Utilities: CreditCard, Misc: Wallet,
};
const CAT_COLOR: Record<string, string> = {
  Food: 'hsl(20, 75%, 55%)', Travel: 'hsl(199, 70%, 50%)', Shopping: 'hsl(280, 55%, 55%)',
  Subscriptions: 'hsl(330, 65%, 55%)', Utilities: 'hsl(199, 50%, 45%)', Misc: 'hsl(160, 8%, 50%)',
};

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const monthLabel = (d: Date) => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const shiftMonth = (d: Date, delta: number) => new Date(d.getFullYear(), d.getMonth() + delta, 1);

const GRADE_TONE_COLOR: Record<string, string> = {
  good: 'hsl(152, 55%, 45%)', watch: 'hsl(43, 80%, 50%)',
  warn: 'hsl(25, 80%, 55%)', bad: 'hsl(0, 75%, 55%)',
};

export default function MoneyLeaks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<MoneyProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<LeakCategory | null>(null);

  /* Month selector */
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const isCurrentMonth = selectedMonth.getFullYear() === new Date().getFullYear() && selectedMonth.getMonth() === new Date().getMonth();

  /* Survival mode (persisted) */
  const [balance, setBalance] = useState<string>('');
  const [salaryDay, setSalaryDay] = useState<string>('1');
  const [alertEnabled, setAlertEnabled] = useState<boolean>(false);

  /* AI chat */
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profRes, expRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('expenses').select('*, expense_categories(name)').eq('user_id', user.id).order('expense_date', { ascending: false }),
      ]);
      const p = profRes.data as any;
      if (p) {
        setProfile({
          income_range: p.income_range,
          age_group: p.age_group,
          city_tier: p.city_tier,
          living_situation: p.living_situation,
          job_type: p.job_type,
          financial_goal: p.financial_goal,
          monthly_rent: p.monthly_rent,
          monthly_emi: p.monthly_emi,
          money_profile_completed: p.money_profile_completed || false,
        });
        if (p.survival_balance != null) setBalance(String(p.survival_balance));
        if (p.salary_day != null) setSalaryDay(String(p.salary_day));
        setAlertEnabled(!!p.leak_alerts_enabled);
      }
      setExpenses((expRes.data as unknown as Expense[]) || []);
      setLoading(false);
    })();
  }, [user]);

  /* Compute leak data for the selected month */
  const leakData: LeakResult | null = useMemo(() => {
    if (!profile || !profile.money_profile_completed) return null;
    const monthStart = selectedMonth;
    const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
    const prevStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
    const inMonth = (e: Expense, start: Date, end: Date) => {
      const d = new Date(e.expense_date);
      return d >= start && d < end;
    };
    const thisMonth = expenses
      .filter(e => inMonth(e, monthStart, monthEnd))
      .map(e => ({
        amount: Number(e.amount), expense_date: e.expense_date, created_at: e.created_at,
        category_name: (e as any).expense_categories?.name, merchant: e.merchant, cost_center: e.cost_center,
      }));
    const lastMonth = expenses
      .filter(e => inMonth(e, prevStart, monthStart))
      .map(e => ({
        amount: Number(e.amount), expense_date: e.expense_date, created_at: e.created_at,
        category_name: (e as any).expense_categories?.name, merchant: e.merchant, cost_center: e.cost_center,
      }));
    return computeLeaks(thisMonth, lastMonth, profile, selectedMonth);
  }, [profile, expenses, selectedMonth]);

  const ideal = useMemo(() => profile ? computeIdealBudget(profile) : null, [profile]);

  const subSummary = useMemo(() => {
    return detectSubscriptions(expenses.map(e => ({
      id: e.id, amount: Number(e.amount), expense_date: e.expense_date,
      merchant: e.merchant, title: e.title,
    })));
  }, [expenses]);

  const lastTotal = useMemo(() => {
    if (!profile) return 0;
    const prevStart = shiftMonth(selectedMonth, -1);
    const monthStart = selectedMonth;
    return expenses
      .filter(e => { const d = new Date(e.expense_date); return d >= prevStart && d < monthStart; })
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses, profile, selectedMonth]);

  const changePercent = lastTotal > 0 && leakData ? ((leakData.totalActual - lastTotal) / lastTotal) * 100 : 0;

  /* Survival mode calc */
  const balanceNum = Number(balance) || 0;
  const today = new Date().getDate();
  const salaryDayNum = Math.min(28, Math.max(1, Number(salaryDay) || 1));
  const daysLeft = today < salaryDayNum
    ? salaryDayNum - today
    : (new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - today + salaryDayNum);
  const safeSpend = safeDailySpend(balanceNum, daysLeft);

  /* Save profile (from quiz) */
  const saveProfile = async (data: MoneyProfile) => {
    if (!user) return;
    // Use upsert so it works even if a profile row doesn't yet exist for this user
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      income_range: data.income_range,
      age_group: data.age_group,
      city_tier: data.city_tier,
      living_situation: data.living_situation,
      job_type: data.job_type,
      financial_goal: data.financial_goal,
      monthly_rent: data.monthly_rent ?? null,
      monthly_emi: data.monthly_emi ?? null,
      money_profile_completed: true,
    } as any, { onConflict: 'id' });
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    setProfile({ ...data, money_profile_completed: true });
    toast({ title: 'Money profile saved 🎯', description: 'Your personalized leak insights are ready.' });
  };

  /* Persist survival-mode inputs silently */
  const saveSurvivalField = async (patch: { survival_balance?: number; salary_day?: number; leak_alerts_enabled?: boolean }) => {
    if (!user) return;
    await supabase.from('profiles').update(patch as any).eq('id', user.id);
  };

  /* Leak alerts */
  const toggleAlerts = async () => {
    const next = !alertEnabled;
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      toast({ title: 'Notifications are blocked', description: 'Enable them in your browser settings to get leak nudges.', variant: 'destructive' });
      return;
    }
    setAlertEnabled(next);
    await saveSurvivalField({ leak_alerts_enabled: next });
    toast({
      title: next ? 'Leak alerts on 🔔' : 'Leak alerts off',
      description: next ? "We'll nudge you here when a leak starts growing." : undefined,
    });
  };

  /* AI chat */
  const sendChat = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatLoading) return;
    const userMsg = { role: 'user', content: text };
    const allMsgs = [...chatMessages, userMsg];
    setChatMessages(allMsgs);
    setChatInput('');
    setChatLoading(true);

    // Rich leak context so answers are specific
    let ctx = '';
    if (leakData && profile) {
      const catLines = leakData.perCategory
        .filter(c => c.actual > 0)
        .map(c => `- ${c.category}: spent ${fmt(c.actual)} vs ideal ${fmt(c.ideal)}${c.leak > 0 ? ` (leak ${fmt(c.leak)}, mostly ${c.topMerchant || 'various'})` : ''}`)
        .join('\n');
      ctx = [
        `User context for ${monthLabel(selectedMonth)}:`,
        `Total spent ${fmt(leakData.totalActual)} vs ideal ${fmt(leakData.totalIdeal)}, leak ${fmt(leakData.totalLeak)} (${leakData.leakPercent}%).`,
        `Leak score ${leakData.leakScore}/100 (${leakGrade(leakData.leakScore).label}). Goal: ${profile.financial_goal}.`,
        leakData.pacing ? `Projected month-end spend ${fmt(leakData.pacing.projectedMonthEnd)}.` : '',
        balanceNum > 0 ? `Survival mode: ${fmt(balanceNum)} balance, safe daily ${fmt(safeSpend)} for ${daysLeft} days until salary.` : '',
        'Categories:',
        catLines,
        leakData.patterns.length ? `Patterns: ${leakData.patterns.join(' | ')}` : '',
        'Format amounts in ₹ (Indian Rupees, never $). Use markdown tables when comparing. Keep replies under 4 lines and give specific numbers + one concrete action.',
      ].filter(Boolean).join('\n');
    }
    const messagesWithCtx = ctx ? [{ role: 'system', content: ctx }, ...allMsgs] : allMsgs;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ messages: messagesWithCtx }),
        },
      );
      if (!res.ok || !res.body) throw new Error('Failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setChatMessages([...allMsgs, { role: 'assistant', content: assistantContent }]);
            }
          } catch {}
        }
      }
    } catch {
      setChatMessages([...allMsgs, { role: 'assistant', content: '⚠️ Advisor unavailable right now. Try again shortly.' }]);
    }
    setChatLoading(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages, chatLoading]);

  const shareSummary = () => {
    if (!leakData) return;
    const grade = leakGrade(leakData.leakScore).label;
    const text = `💧 Money leak check — ${monthLabel(selectedMonth)}\nLeaked: ${fmt(leakData.totalLeak)} (${leakData.leakPercent}% of spending)\nHealth: ${leakData.leakScore}/100 · ${grade}\nBiggest leak: ${leakData.perCategory[0]?.category || 'N/A'}\n\nTracked with EZZ BILLZ`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard.writeText(text); toast({ title: 'Copied to clipboard' }); }
  };

  /* ─────────── Render ─────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  /* Show quiz only on first time (profile not yet completed) */
  if (!profile?.money_profile_completed) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto pb-24">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Droplets className="h-5 w-5 text-primary" /> Money Leaks
            </h1>
            <p className="text-xs text-muted-foreground">Find where your money is dripping away</p>
          </div>
        </div>
        <MoneyProfileQuiz initial={profile || undefined} onSubmit={saveProfile} />
      </div>
    );
  }

  /* Category deep dive */
  if (activeCategory && leakData) {
    const cat = leakData.perCategory.find(c => c.category === activeCategory);
    if (!cat) { setActiveCategory(null); return null; }
    const Icon = CAT_ICONS[activeCategory] || Wallet;
    const color = CAT_COLOR[activeCategory];

    // Daily breakdown for this category
    const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    const catExpenses = expenses.filter(e => {
      const d = new Date(e.expense_date);
      if (d < selectedMonth || d >= monthEnd) return false;
      const text = `${(e as any).expense_categories?.name || ''} ${e.merchant || ''} ${e.cost_center || ''}`.toLowerCase();
      return toLeakCategory(text) === activeCategory;
    });
    const dailyMap: Record<string, number> = {};
    catExpenses.forEach(e => { const d = new Date(e.expense_date).getDate(); dailyMap[d] = (dailyMap[d] || 0) + Number(e.amount); });
    const dailyTrend = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, amount: Math.round(dailyMap[i + 1] || 0) }));

    // Top merchants for this category
    const merchantMap: Record<string, number> = {};
    catExpenses.forEach(e => {
      const m = (e.merchant || '').trim();
      if (m) merchantMap[m] = (merchantMap[m] || 0) + Number(e.amount);
    });
    const topMerchants = Object.entries(merchantMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const idealPerDay = Math.round(cat.ideal / daysInMonth);

    return (
      <div className="space-y-5 max-w-2xl mx-auto animate-fade-in pb-24">
        <button onClick={() => setActiveCategory(null)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Leaks
        </button>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}25` }}>
              <Icon className="h-6 w-6" style={{ color }} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">{activeCategory}</h2>
              <p className="text-sm text-muted-foreground">{monthLabel(selectedMonth)} · {cat.count} transactions</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Actual</p>
              <p className="text-lg font-bold text-foreground">{fmt(cat.actual)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Ideal</p>
              <p className="text-lg font-bold text-muted-foreground">{fmt(cat.ideal)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Leak</p>
              <p className={`text-lg font-bold ${cat.leak > 0 ? 'text-destructive' : 'text-success'}`}>{fmt(cat.leak)}</p>
            </div>
          </div>
          {cat.leak > 0 && (
            <div className="mt-4 bg-destructive/10 border border-destructive/25 rounded-xl p-3">
              <p className="text-xs text-foreground">
                Plug this leak and you'd keep <span className="font-bold text-destructive">{fmt(cat.leak * 12)}</span> more every year.
              </p>
            </div>
          )}
        </div>

        {cat.count > 0 && (
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Daily Spend</h3>
              <span className="text-[10px] text-muted-foreground">dashed line = ideal/day ({fmt(idealPerDay)})</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={dailyTrend} barSize={7}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(160, 8%, 25%, 0.3)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} width={44} />
                <Tooltip formatter={(val: number) => [fmt(val), 'Spent']}
                  contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }} />
                <ReferenceLine y={idealPerDay} stroke="hsl(43, 80%, 50%)" strokeDasharray="4 4" />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                  {dailyTrend.map((d, i) => (
                    <Cell key={i} fill={d.amount > idealPerDay ? 'hsl(0, 75%, 55%)' : color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {topMerchants.length > 0 && (
          <div className="glass-card rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Where it goes</h3>
            <div className="space-y-2.5">
              {topMerchants.map(([m, t]) => (
                <div key={m} className="flex items-center gap-3">
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{m}</span>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden w-24">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t / cat.actual) * 100)}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground w-16 text-right">{fmt(t)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">All Transactions</h3>
          <div className="space-y-2">
            {catExpenses.length === 0 && (
              <div className="glass-card rounded-xl p-5 text-center text-sm text-muted-foreground">No transactions in this category this month.</div>
            )}
            {catExpenses.map(e => (
              <button key={e.id} onClick={() => navigate(`/expenses/${e.id}`)}
                className="w-full glass-card rounded-xl p-3.5 text-left hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate mr-2">{e.title}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{fmt(Number(e.amount))}</span>
                </div>
                <span className="text-xs text-muted-foreground">{e.merchant || '—'} · {new Date(e.expense_date).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* Main dashboard */
  if (!leakData || !ideal) return null;
  const topLeak = leakData.perCategory[0];
  const grade = leakGrade(leakData.leakScore);
  const hasData = leakData.totalActual > 0;

  /* Ring gauge geometry */
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  const dash = (Math.min(100, leakData.leakScore) / 100) * CIRC;

  const suggestions = hasData ? [
    'Where am I leaking the most money?',
    topLeak?.leak > 0 ? `How do I cut my ${topLeak.category} spend?` : 'Which category is closest to going over?',
    `Build me a plan to save ${fmt(Math.max(1000, Math.round(leakData.totalLeak * 0.5)))} next month`,
    balanceNum > 0 ? `Can I afford a weekend plan with ${fmt(balanceNum)} left?` : 'How much should I save monthly?',
  ] : [
    'How do I start tracking my spending?',
    'What counts as a money leak?',
    'Give me a simple monthly budget rule',
  ];

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-24">
      <SEO title="Money Leaks" description="Find recurring charges, duplicate subscriptions, and small leaks draining your budget with EZZ BILLZ." path="/money-leaks" />

      {/* Header + month selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/')} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors md:hidden shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Droplets className="h-5 w-5 text-gold" /> Money Leaks
            </h1>
            <p className="text-xs text-muted-foreground">Personalized for your lifestyle</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => navigate('/profile')} className="text-muted-foreground gap-1.5" title="Edit your money profile in Account">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Edit profile</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={shareSummary} className="text-muted-foreground">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
          className="h-8 w-8 rounded-full glass-button flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/40">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{monthLabel(selectedMonth)}</span>
        </div>
        <button onClick={() => !isCurrentMonth && setSelectedMonth(shiftMonth(selectedMonth, 1))} disabled={isCurrentMonth}
          className="h-8 w-8 rounded-full glass-button flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 1. SUMMARY HERO — leak amount + health ring */}
      <div
        className="rounded-3xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsla(0, 70%, 30%, 0.16), hsla(160, 12%, 10%, 0.55))',
          backdropFilter: 'blur(28px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
          border: '1px solid hsla(0, 70%, 50%, 0.2)',
          boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.05), 0 12px 32px -12px hsla(0, 70%, 40%, 0.3)',
        }}
      >
        <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl opacity-40 pointer-events-none"
          style={{ background: 'hsla(0, 70%, 50%, 0.35)' }} />

        <div className="flex items-start justify-between gap-4 relative">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              {hasData ? `Leaked in ${selectedMonth.toLocaleDateString('en-IN', { month: 'long' })}` : monthLabel(selectedMonth)}
            </p>
            {hasData ? (
              <>
                <p className={`text-4xl font-bold tabular-nums ${leakData.totalLeak > 0 ? 'text-destructive' : 'text-success'}`}>{fmt(leakData.totalLeak)}</p>
                {lastTotal > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${changePercent > 0 ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'}`}>
                      {changePercent > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(changePercent).toFixed(0)}% vs last month
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold text-foreground leading-snug">No spending<br />tracked yet</p>
            )}
          </div>

          {/* Health ring */}
          <div className="flex flex-col items-center shrink-0 relative">
            <svg width="92" height="92" viewBox="0 0 92 92">
              <circle cx="46" cy="46" r={R} fill="none" stroke="hsla(160, 8%, 22%, 0.7)" strokeWidth="7" />
              <circle
                cx="46" cy="46" r={R} fill="none"
                stroke={GRADE_TONE_COLOR[grade.tone]}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC}`}
                transform="rotate(-90 46 46)"
                style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.4s ease' }}
              />
              <text x="46" y="44" textAnchor="middle" fill="hsl(60, 10%, 95%)" fontSize="20" fontWeight="700">{leakData.leakScore}</text>
              <text x="46" y="58" textAnchor="middle" fill="hsl(160, 8%, 55%)" fontSize="9">/100</text>
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: GRADE_TONE_COLOR[grade.tone] }}>
              {grade.label}
            </span>
          </div>
        </div>

        {hasData && (
          <>
            <div className="flex items-center gap-3 mt-4">
              <Progress value={leakData.leakPercent} className="h-2 flex-1 bg-secondary [&>div]:bg-destructive" />
              <span className={`text-xs font-semibold tabular-nums ${leakData.leakPercent > 0 ? 'text-destructive' : 'text-success'}`}>
                {leakData.leakPercent > 0 ? `${leakData.leakPercent}% of spending leaked` : 'No leaks this month 🎉'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-4 mt-2 border-t border-border/30 relative">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Spent</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{fmt(leakData.totalActual)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Ideal</p>
                <p className="text-sm font-bold text-muted-foreground tabular-nums">{fmt(leakData.totalIdeal)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{isCurrentMonth ? 'On pace for' : 'Month total'}</p>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  {leakData.pacing ? fmt(leakData.pacing.projectedMonthEnd) : fmt(leakData.totalActual)}
                </p>
              </div>
            </div>

            {topLeak && topLeak.leak > 0 && (
              <Button
                onClick={() => setActiveCategory(topLeak.category)}
                className="w-full mt-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl relative"
              >
                <Zap className="h-4 w-4 mr-2" /> Fix My Biggest Leak — {topLeak.category}
              </Button>
            )}
          </>
        )}

        {!hasData && (
          <div className="flex flex-col sm:flex-row gap-2 mt-4 relative">
            <Button onClick={() => navigate('/expenses/new')} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
              <Plus className="h-4 w-4 mr-2" /> Add a bill
            </Button>
            <Button onClick={() => navigate('/email-bills')} variant="outline" className="flex-1 rounded-xl border-border/40 bg-secondary/40 hover:bg-secondary/60">
              <Mail className="h-4 w-4 mr-2" /> Scan Gmail
            </Button>
          </div>
        )}
      </div>

      {/* Profile entry point */}
      <button
        onClick={() => navigate('/profile')}
        className="w-full glass-card rounded-xl px-4 py-2.5 flex items-center justify-between text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="text-xs text-muted-foreground truncate mr-2">
          Personalized for: <span className="text-foreground font-medium">{profile?.financial_goal || '—'}</span> · {profile?.city_tier?.replace('_', ' ') || '—'} · {profile?.living_situation || '—'}
          {ideal && ideal.fixed > 0 && <> · <span className="text-foreground font-medium">{fmt(ideal.fixed)}</span> fixed commitments</>}
        </span>
        <span className="flex items-center gap-1 text-xs text-primary font-medium shrink-0">
          Edit <ChevronRight className="h-3 w-3" />
        </span>
      </button>

      {/* 2. TOP LEAK CATEGORIES */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-gold" /> Where Your Money Leaks
        </h2>

        {!hasData ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No spending data this month. Add bills to see your leaks.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {leakData.perCategory.filter(c => c.actual > 0).map(cat => {
              const Icon = CAT_ICONS[cat.category] || Wallet;
              const color = CAT_COLOR[cat.category];
              const overPct = cat.ideal > 0 ? Math.round((cat.actual / cat.ideal) * 100) : 0;
              const isOver = cat.leak > 0;
              return (
                <button key={cat.category} onClick={() => setActiveCategory(cat.category)}
                  className="w-full glass-card rounded-2xl p-4 text-left hover:bg-secondary/40 active:bg-secondary/60 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}25` }}>
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{cat.category}</span>
                        <span className="text-sm font-bold tabular-nums text-foreground">{fmt(cat.actual)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground truncate">
                          {cat.count} txns · ideal {fmt(cat.ideal)}{cat.topMerchant ? ` · mostly ${cat.topMerchant}` : ''}
                        </span>
                        {isOver
                          ? <span className="text-destructive font-medium shrink-0">+{fmt(cat.leak)} leak</span>
                          : <span className="text-success font-medium shrink-0">on track</span>}
                      </div>
                    </div>
                  </div>
                  <Progress value={Math.min(150, overPct)} className={`h-1.5 bg-secondary ${isOver ? '[&>div]:bg-destructive' : '[&>div]:bg-success'}`} />
                  {isOver && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Plug it and keep <span className="text-gold font-semibold">{fmt(cat.leak * 12)}</span>/yr
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. WHY — Behavioral patterns */}
      {leakData.patterns.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-gold" /> Why It's Happening
          </h2>
          <div className="space-y-2">
            {leakData.patterns.map((p, i) => (
              <div key={i} className="glass-card rounded-xl p-4 border-l-2 border-gold/60">
                <p className="text-sm text-foreground">{p}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SMALL SPENDS */}
      {hasData && leakData.smallSpends.count >= 5 && (
        <div className="glass-card rounded-2xl p-5 border border-gold/20">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5 text-gold" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Death by a thousand cuts</p>
              <p className="text-[11px] text-muted-foreground">{leakData.smallSpends.count} spends under {fmt(leakData.smallSpends.threshold)}</p>
            </div>
            <p className="text-sm font-bold tabular-nums text-gold">{fmt(leakData.smallSpends.total)}</p>
          </div>
          <p className="text-xs text-muted-foreground">Small taps don't feel like spending — until they add up to real money.</p>
        </div>
      )}

      {/* SUBSCRIPTION LEAK */}
      {subSummary.subscriptions.length > 0 && (
        <button onClick={() => navigate('/subscriptions')}
          className="w-full glass-card rounded-2xl p-4 text-left hover:bg-secondary/40 active:bg-secondary/60 transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Repeat className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-semibold text-foreground">Subscription Leak</span>
                <span className="text-sm font-bold text-destructive tabular-nums">
                  {fmt(subSummary.leakMonthly)}/mo
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {subSummary.subscriptions.length} subs · {subSummary.subscriptions.filter(s => s.status !== 'active').length} unused or duplicate · review them
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </button>
      )}

      {/* 5. SURVIVAL MODE — persisted */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Survival Mode
        </h2>
        <div className="glass-card rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium block mb-1.5">Current balance</label>
              <Input
                type="number" inputMode="numeric" value={balance}
                onChange={e => setBalance(e.target.value)}
                onBlur={() => saveSurvivalField({ survival_balance: Number(balance) || 0 })}
                placeholder="₹" className="h-10 rounded-xl bg-secondary/50 border-border/30"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium block mb-1.5">Salary day</label>
              <Input
                type="number" inputMode="numeric" min="1" max="28" value={salaryDay}
                onChange={e => setSalaryDay(e.target.value)}
                onBlur={() => saveSurvivalField({ salary_day: salaryDayNum })}
                className="h-10 rounded-xl bg-secondary/50 border-border/30"
              />
            </div>
          </div>
          {balanceNum > 0 ? (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
              <p className="text-[10px] uppercase text-primary tracking-wider font-medium mb-1">Safe to spend daily</p>
              <p className="text-3xl font-bold text-foreground mb-1 tabular-nums">{fmt(safeSpend)}</p>
              <p className="text-xs text-muted-foreground">{daysLeft} days until salary · stay at or under {fmt(safeSpend)}/day</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Enter your balance to see your safe daily limit — it's saved for next time</p>
          )}

          {/* Leak alerts toggle */}
          <button
            onClick={toggleAlerts}
            className="w-full mt-4 flex items-center justify-between gap-3 rounded-xl bg-secondary/40 border border-border/30 px-4 py-3 text-left hover:bg-secondary/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {alertEnabled
                ? <BellRing className="h-4 w-4 text-gold shrink-0" />
                : <Bell className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Leak alerts</p>
                <p className="text-[11px] text-muted-foreground truncate">{alertEnabled ? 'On — we\'ll nudge you when leaks grow' : 'Off — tap to get nudged before leaks grow'}</p>
              </div>
            </div>
            <div className={`h-5 w-9 rounded-full p-0.5 shrink-0 transition-colors ${alertEnabled ? 'bg-primary' : 'bg-secondary border border-border/40'}`}>
              <div className={`h-4 w-4 rounded-full bg-background transition-transform ${alertEnabled ? 'translate-x-4' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* 6. ACTION ENGINE */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Take Action
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: 'Cut Top Leak', icon: TrendingDown,
              desc: topLeak && topLeak.leak > 0 ? `Save ~${fmt(topLeak.leak * 0.5)}/mo` : 'Review your spending',
              onClick: () => topLeak && setActiveCategory(topLeak.category),
            },
            {
              label: 'Leak Alerts', icon: BellRing,
              desc: alertEnabled ? 'Alerts are on' : 'Turn on nudges',
              onClick: toggleAlerts,
            },
            {
              label: 'Find Alternatives', icon: Lightbulb,
              desc: hasData ? 'Cheaper merchants' : 'Spending tips',
              onClick: () => sendChat(hasData ? 'Suggest cheaper alternatives for my top spending categories' : 'How do I build a simple monthly budget?'),
            },
            {
              label: 'Monthly Summary', icon: CalendarDays,
              desc: 'Full month in one page',
              onClick: () => navigate('/summary'),
            },
          ].map(action => (
            <button key={action.label} onClick={action.onClick}
              className="glass-card rounded-xl p-4 text-left hover:bg-secondary/50 active:bg-secondary/80 transition-colors">
              <action.icon className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm font-medium text-foreground">{action.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 7. AI ADVISOR */}
      <div id="leak-chat">
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" /> Ask Your AI Advisor
        </h2>
        <div className="glass-card rounded-2xl overflow-hidden">
          {chatMessages.length === 0 && (
            <div className="p-4 space-y-2">
              {suggestions.map(q => (
                <button key={q} onClick={() => sendChat(q)}
                  className="w-full text-left p-3 rounded-xl bg-secondary/40 hover:bg-secondary text-sm text-foreground transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          {chatMessages.length > 0 && (
            <div className="max-h-[320px] overflow-y-auto p-4 space-y-3">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
                  {m.role === 'assistant' && chatMessages[i + 1] === undefined && !chatLoading && m.content && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(m.content); toast({ title: 'Copied to clipboard' }); }}
                      className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                      title="Copy reply"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                    {m.role === 'assistant'
                      ? <div className="prose prose-sm prose-invert max-w-none [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1 [&_li]:marker:text-gold [&_code]:text-gold"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
                      : m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          <div className="flex items-center gap-2 p-3 border-t border-border/30">
            <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Ask about your spending…"
              className="flex-1 h-10 rounded-xl bg-secondary border-border/30" />
            <Button size="icon" onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()} className="h-10 w-10 rounded-xl shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
