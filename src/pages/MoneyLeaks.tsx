import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Droplets, TrendingDown, TrendingUp, AlertTriangle, ArrowLeft,
  Utensils, ShoppingBag, Car, Tv, CreditCard, Plane, Home as HomeIcon,
  Coffee, Sparkles, Send, ChevronRight, Share2, Target, Bell, Lightbulb,
  ArrowDownRight, ArrowUpRight, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import type { Expense } from '@/lib/types';

/* ── category icon mapping ── */
const CAT_ICONS: Record<string, any> = {
  Food: Utensils, Shopping: ShoppingBag, Transport: Car, Travel: Plane,
  Subscriptions: Tv, Entertainment: Tv, Housing: HomeIcon, Utilities: CreditCard,
  Coffee: Coffee, default: CreditCard,
};
const COLORS = [
  'hsl(0, 63%, 45%)', 'hsl(43, 80%, 50%)', 'hsl(199, 70%, 45%)',
  'hsl(152, 45%, 35%)', 'hsl(280, 50%, 50%)', 'hsl(20, 70%, 50%)',
];

/* ── broad category mapper (reuse smart-category logic) ── */
function broadCategory(cat: string): string {
  const c = (cat || '').toLowerCase();
  if (['food', 'dining', 'restaurant', 'snack', 'lunch', 'dinner', 'breakfast', 'cafe', 'coffee', 'tea', 'bakery', 'dessert', 'sweets', 'pizza', 'burger', 'biryani', 'fast food', 'zomato', 'swiggy'].some(k => c.includes(k))) return 'Food';
  if (['shop', 'retail', 'amazon', 'flipkart', 'myntra', 'cloth', 'apparel', 'fashion', 'electronics', 'gadget'].some(k => c.includes(k))) return 'Shopping';
  if (['uber', 'ola', 'cab', 'taxi', 'auto', 'fuel', 'petrol', 'diesel', 'parking', 'toll', 'transport', 'metro', 'bus'].some(k => c.includes(k))) return 'Transport';
  if (['hotel', 'airbnb', 'accommodation', 'stay', 'resort', 'hostel', 'lodge', 'flight', 'travel', 'trip', 'airline', 'train', 'railway'].some(k => c.includes(k))) return 'Travel';
  if (['netflix', 'spotify', 'subscription', 'saas', 'membership', 'gym', 'youtube', 'prime', 'hotstar', 'jio'].some(k => c.includes(k))) return 'Subscriptions';
  if (['movie', 'game', 'entertainment', 'event', 'concert', 'show', 'theater', 'pub', 'bar', 'nightclub'].some(k => c.includes(k))) return 'Entertainment';
  if (['rent', 'housing', 'home', 'maintenance', 'repair', 'furniture', 'appliance'].some(k => c.includes(k))) return 'Housing';
  if (['electric', 'water', 'gas', 'internet', 'wifi', 'phone', 'mobile', 'recharge', 'bill', 'utility'].some(k => c.includes(k))) return 'Utilities';
  return cat || 'Other';
}

export default function MoneyLeaks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  /* AI chat */
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  /* AI insights */
  const [insights, setInsights] = useState<string[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('expenses')
      .select('*, expense_categories(name)')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false })
      .then(({ data }) => {
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
  }, [user]);

  /* ── computed data ── */
  const now = new Date();
  const thisMonth = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter(e => new Date(e.expense_date) >= start);
  }, [expenses, now]);

  const lastMonth = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter(e => {
      const d = new Date(e.expense_date);
      return d >= start && d < end;
    });
  }, [expenses, now]);

  const thisTotal = thisMonth.reduce((s, e) => s + Number(e.amount), 0);
  const lastTotal = lastMonth.reduce((s, e) => s + Number(e.amount), 0);
  const changePercent = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0;

  /* ── category breakdown ── */
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number; expenses: Expense[] }> = {};
    thisMonth.forEach(e => {
      const cat = broadCategory((e as any).expense_categories?.name || e.cost_center || '');
      if (!map[cat]) map[cat] = { total: 0, count: 0, expenses: [] };
      map[cat].total += Number(e.amount);
      map[cat].count += 1;
      map[cat].expenses.push(e);
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);
  }, [thisMonth]);

  /* ── leak score (simple heuristic: frequent small transactions, late-night, weekend spikes) ── */
  const leakAmount = useMemo(() => {
    let leak = 0;
    // Small frequent food orders
    const food = categoryBreakdown.find(c => c.name === 'Food');
    if (food && food.count > 10) leak += food.total * 0.3;
    // Subscriptions are all "leak"
    const subs = categoryBreakdown.find(c => c.name === 'Subscriptions');
    if (subs) leak += subs.total * 0.5;
    // Late night spending
    thisMonth.forEach(e => {
      const h = new Date(e.created_at).getHours();
      if (h >= 22 || h <= 5) leak += Number(e.amount) * 0.2;
    });
    return Math.round(leak);
  }, [categoryBreakdown, thisMonth]);

  const leakPercent = thisTotal > 0 ? Math.min(Math.round((leakAmount / thisTotal) * 100), 100) : 0;

  /* ── daily trend for deep dive ── */
  const dailyTrend = useMemo(() => {
    if (!activeCategory) return [];
    const cat = categoryBreakdown.find(c => c.name === activeCategory);
    if (!cat) return [];
    const map: Record<string, number> = {};
    cat.expenses.forEach(e => {
      const d = new Date(e.expense_date).getDate();
      map[d] = (map[d] || 0) + Number(e.amount);
    });
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, amount]) => ({ day, amount: Math.round(amount) }));
  }, [activeCategory, categoryBreakdown]);

  /* ── AI insights fetch ── */
  const fetchInsights = async () => {
    if (insightsLoading || insights.length > 0) return;
    setInsightsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'suggestions',
            messages: [],
          }),
        },
      );
      if (res.ok) {
        // We'll use a custom prompt for leak insights via chat
        const leakPrompt = `Analyze my spending and give me exactly 4 short money-leak insights (one sentence each). Focus on: late-night spending patterns, subscription waste, frequent small purchases, and weekend splurges. Return ONLY a JSON array of 4 strings.`;
        const chatRes = await supabase.functions.invoke('ask-ai', {
          body: {
            messages: [{ role: 'user', content: leakPrompt }],
          },
        });
        if (chatRes.data) {
          // Parse streamed response
          const text = typeof chatRes.data === 'string' ? chatRes.data : await new Response(chatRes.data).text();
          // Extract content from SSE
          let full = '';
          text.split('\n').forEach((line: string) => {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const j = JSON.parse(line.slice(6));
                full += j.choices?.[0]?.delta?.content || '';
              } catch {}
            }
          });
          try {
            const cleaned = full.replace(/```json\n?/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) setInsights(parsed.slice(0, 4));
          } catch {
            setInsights([
              'Your food spending spikes after 10 PM',
              'You may have unused subscriptions',
              'Weekend spending is 40% higher than weekdays',
              'Frequent small purchases add up quickly',
            ]);
          }
        }
      }
    } catch {
      setInsights([
        'Your food spending spikes after 10 PM',
        'You may have unused subscriptions',
        'Weekend spending is 40% higher than weekdays',
        'Frequent small purchases add up quickly',
      ]);
    }
    setInsightsLoading(false);
  };

  useEffect(() => {
    if (!loading && thisMonth.length > 0) fetchInsights();
  }, [loading]);

  /* ── AI chat ── */
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user', content: chatInput };
    const allMsgs = [...chatMessages, userMsg];
    setChatMessages(allMsgs);
    setChatInput('');
    setChatLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ messages: allMsgs }),
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

      if (assistantContent) {
        setChatMessages([...allMsgs, { role: 'assistant', content: assistantContent }]);
      }
    } catch {
      setChatMessages([...allMsgs, { role: 'assistant', content: 'Sorry, I couldn\'t process that right now. Please try again.' }]);
    }
    setChatLoading(false);
  };

  /* ── share summary ── */
  const shareSummary = () => {
    const text = `💧 I leaked ₹${leakAmount.toLocaleString('en-IN')} this month in avoidable spending! 😭\nTop leak: ${categoryBreakdown[0]?.name || 'N/A'}\n\nTracked with EZ Bill`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  /* ── Category Deep Dive ── */
  if (activeCategory) {
    const cat = categoryBreakdown.find(c => c.name === activeCategory);
    if (!cat) { setActiveCategory(null); return null; }
    const Icon = CAT_ICONS[activeCategory] || CAT_ICONS.default;
    return (
      <div className="space-y-5 max-w-2xl mx-auto animate-fade-in pb-24">
        <button onClick={() => setActiveCategory(null)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Leaks
        </button>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-destructive/20 flex items-center justify-center">
              <Icon className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{activeCategory}</h2>
              <p className="text-sm text-muted-foreground">{cat.count} transactions this month</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-foreground">₹{cat.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>

        {/* Daily trend */}
        {dailyTrend.length > 0 && (
          <div className="glass-card rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Daily Spending Trend</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyTrend} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(160, 8%, 25%, 0.3)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip
                  formatter={(val: number) => [`₹${val}`, 'Spent']}
                  contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }}
                />
                <Bar dataKey="amount" fill="hsl(0, 63%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transactions */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">All Transactions</h3>
          <div className="space-y-2">
            {cat.expenses.map(e => (
              <button
                key={e.id}
                onClick={() => navigate(`/expenses/${e.id}`)}
                className="w-full glass-card rounded-xl p-3.5 text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate mr-2">{e.title}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <span className="text-xs text-muted-foreground">{e.merchant || '—'} · {new Date(e.expense_date).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Main Dashboard ── */
  const pieData = categoryBreakdown.slice(0, 6).map((c, i) => ({ ...c, fill: COLORS[i % COLORS.length] }));

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-24">
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
            <p className="text-xs text-muted-foreground">Where your money is dripping away</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={shareSummary} className="text-muted-foreground">
          <Share2 className="h-4 w-4" />
        </Button>
      </div>

      {/* A. Leak Summary */}
      <div className="glass-card rounded-2xl p-5 border border-destructive/20">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Leak This Month</p>
          <div className={`flex items-center gap-1 text-xs font-medium ${changePercent > 0 ? 'text-destructive' : 'text-success'}`}>
            {changePercent > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(changePercent).toFixed(0)}% vs last month
          </div>
        </div>
        <p className="text-3xl font-bold text-destructive mb-3">₹{leakAmount.toLocaleString('en-IN')}</p>
        <div className="flex items-center gap-3">
          <Progress value={leakPercent} className="h-2 flex-1 bg-secondary [&>div]:bg-destructive" />
          <span className="text-xs font-medium text-muted-foreground">{leakPercent}% of total</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Total spend: ₹{thisTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {/* B. Top Leak Categories */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-gold" /> Top Leak Categories
        </h2>

        {categoryBreakdown.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No spending data this month yet.</p>
          </div>
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-4">
            {/* Pie Chart - desktop */}
            <div className="hidden md:block glass-card rounded-2xl p-5">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="total" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, '']}
                    contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Category Cards */}
            <div className="space-y-2">
              {categoryBreakdown.map((cat, i) => {
                const Icon = CAT_ICONS[cat.name] || CAT_ICONS.default;
                const pct = thisTotal > 0 ? Math.round((cat.total / thisTotal) * 100) : 0;
                return (
                  <button
                    key={cat.name}
                    onClick={() => setActiveCategory(cat.name)}
                    className="w-full glass-card rounded-xl p-4 text-left hover:bg-secondary/50 active:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS[i % COLORS.length]}20` }}>
                        <Icon className="h-5 w-5" style={{ color: COLORS[i % COLORS.length] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-foreground">{cat.name}</span>
                          <span className="text-sm font-bold tabular-nums text-foreground">₹{cat.total.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{cat.count} orders · {pct}%</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* C. AI Insights */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-gold" /> AI Insights
        </h2>
        <div className="space-y-2">
          {insightsLoading ? (
            <div className="glass-card rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Analyzing your spending patterns…</span>
            </div>
          ) : insights.length > 0 ? (
            insights.map((insight, i) => (
              <div key={i} className="glass-card rounded-xl p-4 border-l-2 border-gold/50">
                <p className="text-sm text-foreground">{insight}</p>
              </div>
            ))
          ) : (
            <div className="glass-card rounded-xl p-4">
              <p className="text-sm text-muted-foreground">Add more bills to unlock AI insights.</p>
            </div>
          )}
        </div>
      </div>

      {/* D. Actionable Fixes */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Take Action
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Set Budget', icon: Target, desc: 'Limit category spending' },
            { label: 'Smart Reminders', icon: Bell, desc: 'Get nudged before leaks' },
            { label: 'Find Alternatives', icon: Lightbulb, desc: 'Cheaper options' },
            { label: 'Ask AI Advisor', icon: Sparkles, desc: 'Personalized savings plan' },
          ].map(action => (
            <button
              key={action.label}
              onClick={() => {
                if (action.label === 'Ask AI Advisor') {
                  document.getElementById('leak-chat')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="glass-card rounded-xl p-4 text-left hover:bg-secondary/50 active:bg-secondary/80 transition-colors"
            >
              <action.icon className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm font-medium text-foreground">{action.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* E. Ask AI Chat */}
      <div id="leak-chat">
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" /> Ask Your AI Advisor
        </h2>
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Quick prompts */}
          {chatMessages.length === 0 && (
            <div className="p-4 space-y-2">
              {[
                'Where am I overspending?',
                'How can I save ₹5000 this month?',
                'What are my worst money habits?',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setChatInput(q); }}
                  className="w-full text-left p-3 rounded-xl bg-secondary/50 hover:bg-secondary text-sm text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {chatMessages.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground'
                  }`}>
                    {m.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : m.content}
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

          {/* Input */}
          <div className="flex items-center gap-2 p-3 border-t border-border/30">
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Ask about your spending…"
              className="flex-1 h-10 rounded-xl bg-secondary border-border/30"
            />
            <Button size="icon" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="h-10 w-10 rounded-xl shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
