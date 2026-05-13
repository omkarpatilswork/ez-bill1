import { useEffect, useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import type { Expense } from '@/lib/types';
import {
  computeLeaks, computeIdealBudget, safeDailySpend, toLeakCategory,
  type MoneyProfile, type LeakResult,
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

export default function MoneyLeaks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<MoneyProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  /* Survival mode */
  const [balance, setBalance] = useState<string>('');
  const [salaryDay, setSalaryDay] = useState<string>('1');

  /* AI chat */
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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
      }
      setExpenses((expRes.data as unknown as Expense[]) || []);
      setLoading(false);
    })();
  }, [user]);

  /* Compute leak data */
  const leakData: LeakResult | null = useMemo(() => {
    if (!profile || !profile.money_profile_completed) return null;
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = expenses
      .filter(e => new Date(e.expense_date) >= thisStart)
      .map(e => ({
        amount: Number(e.amount), expense_date: e.expense_date, created_at: e.created_at,
        category_name: (e as any).expense_categories?.name, merchant: e.merchant, cost_center: e.cost_center,
      }));
    const lastMonth = expenses
      .filter(e => { const d = new Date(e.expense_date); return d >= lastStart && d < thisStart; })
      .map(e => ({
        amount: Number(e.amount), expense_date: e.expense_date, created_at: e.created_at,
        category_name: (e as any).expense_categories?.name, merchant: e.merchant, cost_center: e.cost_center,
      }));
    return computeLeaks(thisMonth, lastMonth, profile);
  }, [profile, expenses]);

  const ideal = useMemo(() => profile ? computeIdealBudget(profile) : null, [profile]);

  const subSummary = useMemo(() => {
    return detectSubscriptions(expenses.map(e => ({
      id: e.id, amount: Number(e.amount), expense_date: e.expense_date,
      merchant: e.merchant, title: e.title,
    })));
  }, [expenses]);

  const lastTotal = useMemo(() => {
    if (!profile) return 0;
    const now = new Date();
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses
      .filter(e => { const d = new Date(e.expense_date); return d >= lastStart && d < thisStart; })
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses, profile]);

  const changePercent = lastTotal > 0 && leakData ? ((leakData.totalActual - lastTotal) / lastTotal) * 100 : 0;

  /* Survival mode calc */
  const balanceNum = Number(balance) || 0;
  const today = new Date().getDate();
  const salaryDayNum = Math.min(28, Math.max(1, Number(salaryDay) || 1));
  const daysLeft = today < salaryDayNum
    ? salaryDayNum - today
    : (new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - today + salaryDayNum);
  const safeSpend = safeDailySpend(balanceNum, daysLeft);

  /* Save profile */
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

  /* AI chat */
  const sendChat = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatLoading) return;
    const userMsg = { role: 'user', content: text };
    const allMsgs = [...chatMessages, userMsg];
    setChatMessages(allMsgs);
    setChatInput('');
    setChatLoading(true);

    // Prepend leak context
    const ctx = leakData ? `User context: total spend ₹${leakData.totalActual}, total leak ₹${leakData.totalLeak} (${leakData.leakPercent}%). Top leak: ${leakData.perCategory[0]?.category} (₹${leakData.perCategory[0]?.leak}). Goal: ${profile?.financial_goal}. Keep replies under 3 lines and give specific numbers + one action.` : '';
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

  const shareSummary = () => {
    if (!leakData) return;
    const text = `💧 I leaked ₹${leakData.totalLeak.toLocaleString('en-IN')} this month 💀\nBiggest mistake: ${leakData.perCategory[0]?.category || 'N/A'}\n\nTracked with EZ Bill`;
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
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const catExpenses = expenses.filter(e => {
      if (new Date(e.expense_date) < monthStart) return false;
      const text = `${(e as any).expense_categories?.name || ''} ${e.merchant || ''} ${e.cost_center || ''}`.toLowerCase();
      return toLeakCategory(text) === activeCategory;
    });
    const dailyMap: Record<string, number> = {};
    catExpenses.forEach(e => { const d = new Date(e.expense_date).getDate(); dailyMap[d] = (dailyMap[d] || 0) + Number(e.amount); });
    const dailyTrend = Object.entries(dailyMap).sort(([a], [b]) => Number(a) - Number(b)).map(([day, amount]) => ({ day, amount: Math.round(amount as number) }));

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
              <p className="text-sm text-muted-foreground">{cat.count} transactions this month</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Actual</p>
              <p className="text-lg font-bold text-foreground">₹{cat.actual.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Ideal</p>
              <p className="text-lg font-bold text-muted-foreground">₹{cat.ideal.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Leak</p>
              <p className={`text-lg font-bold ${cat.leak > 0 ? 'text-destructive' : 'text-success'}`}>
                ₹{cat.leak.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        {dailyTrend.length > 0 && (
          <div className="glass-card rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Daily Spend</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyTrend} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(160, 8%, 25%, 0.3)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip formatter={(val: number) => [`₹${val}`, 'Spent']}
                  contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }} />
                <Bar dataKey="amount" fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">All Transactions</h3>
          <div className="space-y-2">
            {catExpenses.map(e => (
              <button key={e.id} onClick={() => navigate(`/expenses/${e.id}`)}
                className="w-full glass-card rounded-xl p-3.5 text-left hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate mr-2">{e.title}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">₹{Number(e.amount).toLocaleString('en-IN')}</span>
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

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-24">
      <SEO title="Money Leaks" description="Find recurring charges, duplicate subscriptions, and small leaks draining your budget with EZ Bill." path="/money-leaks" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors md:hidden">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Droplets className="h-5 w-5 text-destructive" /> Money Leaks
            </h1>
            <p className="text-xs text-muted-foreground">Personalized for your lifestyle</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => navigate('/profile')} className="text-muted-foreground gap-1.5" title="Edit your money profile in Account">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Edit profile</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={shareSummary} className="text-muted-foreground">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 1. SUMMARY HERO */}
      <div className="glass-card rounded-3xl p-6 border border-destructive/30 bg-gradient-to-br from-destructive/10 to-transparent">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">You leaked this month</p>
            <p className="text-4xl font-bold text-destructive">₹{leakData.totalLeak.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${changePercent > 0 ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'}`}>
              {changePercent > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(changePercent).toFixed(0)}%
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">vs last month</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Progress value={leakData.leakPercent} className="h-2 flex-1 bg-secondary [&>div]:bg-destructive" />
          <span className="text-xs font-semibold text-destructive tabular-nums">{leakData.leakPercent}%</span>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/30">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Spent</p>
            <p className="text-sm font-bold text-foreground">₹{leakData.totalActual.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Ideal</p>
            <p className="text-sm font-bold text-muted-foreground">₹{leakData.totalIdeal.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Leak Score</p>
            <p className="text-sm font-bold text-gold">{leakData.leakScore}/100</p>
          </div>
        </div>

        {topLeak && topLeak.leak > 0 && (
          <Button
            onClick={() => setActiveCategory(topLeak.category)}
            className="w-full mt-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl"
          >
            <Zap className="h-4 w-4 mr-2" /> Fix My Biggest Leak — {topLeak.category}
          </Button>
        )}
      </div>

      {/* Profile entry point */}
      <button
        onClick={() => navigate('/profile')}
        className="w-full glass-card rounded-xl px-4 py-2.5 flex items-center justify-between text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="text-xs text-muted-foreground truncate mr-2">
          Personalized for: <span className="text-foreground font-medium">{profile?.financial_goal || '—'}</span> · {profile?.city_tier?.replace('_', ' ') || '—'} · {profile?.living_situation || '—'}
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

        {leakData.perCategory.filter(c => c.actual > 0).length === 0 ? (
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
                        <span className="text-sm font-bold tabular-nums text-foreground">₹{cat.actual.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{cat.count} txns · ideal ₹{cat.ideal.toLocaleString('en-IN')}</span>
                        {isOver
                          ? <span className="text-destructive font-medium">+₹{cat.leak.toLocaleString('en-IN')} leak</span>
                          : <span className="text-success font-medium">on track</span>}
                      </div>
                    </div>
                  </div>
                  <Progress value={Math.min(150, overPct)} className={`h-1.5 bg-secondary ${isOver ? '[&>div]:bg-destructive' : '[&>div]:bg-success'}`} />
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
                  ₹{subSummary.leakMonthly.toLocaleString('en-IN')}/mo
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {subSummary.subscriptions.length} subs · {subSummary.subscriptions.filter(s => s.status !== 'active').length} unused / duplicate
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </button>
      )}

      {/* 4. SURVIVAL MODE */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Survival Mode
        </h2>
        <div className="glass-card rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium block mb-1.5">Current balance</label>
              <Input
                type="number" inputMode="numeric" value={balance} onChange={e => setBalance(e.target.value)}
                placeholder="₹" className="h-10 rounded-xl bg-secondary/50 border-border/30"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium block mb-1.5">Salary day</label>
              <Input
                type="number" inputMode="numeric" min="1" max="28" value={salaryDay} onChange={e => setSalaryDay(e.target.value)}
                className="h-10 rounded-xl bg-secondary/50 border-border/30"
              />
            </div>
          </div>
          {balanceNum > 0 ? (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
              <p className="text-[10px] uppercase text-primary tracking-wider font-medium mb-1">Safe to spend daily</p>
              <p className="text-3xl font-bold text-foreground mb-1">₹{safeSpend.toLocaleString('en-IN')}</p>
              <p className="text-xs text-muted-foreground">{daysLeft} days until salary · burn rate ≤ ₹{safeSpend}/day</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Enter your balance to see your safe daily limit</p>
          )}
        </div>
      </div>

      {/* 5. ACTION ENGINE */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Take Action
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Cut Top Leak', icon: TrendingDown, desc: topLeak ? `Save ~₹${Math.round(topLeak.leak * 0.5).toLocaleString('en-IN')}/mo` : 'Reduce overspend', onClick: () => topLeak && setActiveCategory(topLeak.category) },
            { label: 'Set Reminders', icon: Bell, desc: 'Nudge before leaks', onClick: () => toast({ title: 'Coming soon', description: 'Smart reminders are on the way.' }) },
            { label: 'Find Alternatives', icon: Lightbulb, desc: 'Cheaper merchants', onClick: () => sendChat('Suggest cheaper alternatives for my top spending categories') },
            { label: 'Ask AI Advisor', icon: Sparkles, desc: 'Personal savings plan', onClick: () => document.getElementById('leak-chat')?.scrollIntoView({ behavior: 'smooth' }) },
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

      {/* 6. AI ADVISOR */}
      <div id="leak-chat">
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" /> Ask Your AI Advisor
        </h2>
        <div className="glass-card rounded-2xl overflow-hidden">
          {chatMessages.length === 0 && (
            <div className="p-4 space-y-2">
              {[
                'Where am I leaking the most money?',
                `How can I save ₹${Math.max(1000, Math.round(leakData.totalLeak * 0.5)).toLocaleString('en-IN')}?`,
                'What should I cut first?',
                'Can I afford a weekend plan?',
              ].map(q => (
                <button key={q} onClick={() => sendChat(q)}
                  className="w-full text-left p-3 rounded-xl bg-secondary/40 hover:bg-secondary text-sm text-foreground transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          {chatMessages.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                    {m.role === 'assistant'
                      ? <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>
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
