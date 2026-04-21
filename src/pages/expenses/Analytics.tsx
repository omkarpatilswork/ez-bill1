import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Percent, Tag, Coins, Sparkles, Zap, Trophy,
  Flame, Calendar, Clock, Target, Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { getCurrencySymbol } from '@/lib/countries';

const CHART_COLORS = [
  'hsl(152, 57%, 42%)', 'hsl(43, 80%, 55%)', 'hsl(199, 89%, 48%)',
  'hsl(280, 67%, 60%)', 'hsl(0, 75%, 60%)', 'hsl(330, 65%, 55%)', 'hsl(38, 92%, 50%)',
];

const RATES_TO_INR: Record<string, number> = {
  INR: 1, USD: 83.5, EUR: 91, GBP: 106, AED: 22.7, SGD: 62.5, JPY: 0.56,
  CAD: 62, AUD: 55, CHF: 95, SAR: 22.3, MYR: 18.5, THB: 2.35, CNY: 11.5,
  KRW: 0.063, BRL: 16.5, MXN: 4.9, ZAR: 4.5, NZD: 51, SEK: 8, NOK: 7.8,
  DKK: 12.2, NGN: 0.055, HKD: 10.7, TWD: 2.6, PHP: 1.5, IDR: 0.0053,
  BDT: 0.71, PKR: 0.30, LKR: 0.27, NPR: 0.63, QAR: 22.9, KWD: 272, BHD: 221.5,
  OMR: 217,
};

function convertToTarget(amount: number, fromCurrency: string, targetCurrency: string): number {
  const fromRate = RATES_TO_INR[fromCurrency] || 1;
  const toRate = RATES_TO_INR[targetCurrency] || 1;
  return (amount * fromRate) / toRate;
}

function parseField(description: string | null | undefined, key: string): string {
  if (!description) return '';
  const match = description.match(new RegExp(`${key}:\\s*([^|]+)`));
  return match ? match[1].trim() : '';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_BUCKETS = [
  { label: 'Morning', icon: '☀️', range: [5, 11] },
  { label: 'Afternoon', icon: '🌤️', range: [12, 16] },
  { label: 'Evening', icon: '🌆', range: [17, 21] },
  { label: 'Late Night', icon: '🌙', range: [22, 28] }, // 22-23 + 0-4
];

export default function Analytics() {
  const { user, profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');
  const [displayCurrency, setDisplayCurrency] = useState(profile?.default_currency || 'INR');
  const [selectedTaxType, setSelectedTaxType] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('expenses').select('*').eq('user_id', user.id).order('expense_date', { ascending: true }),
      supabase.from('expense_categories').select('*'),
    ]).then(([expRes, catRes]) => {
      setExpenses((expRes.data as unknown as Expense[]) || []);
      setCategories((catRes.data as unknown as ExpenseCategory[]) || []);
      setLoading(false);
    });
  }, [user]);

  const filteredExpenses = useMemo(() => {
    if (timeRange === 'all') return expenses;
    const now = new Date();
    const cutoff = new Date();
    if (timeRange === '30d') cutoff.setDate(now.getDate() - 30);
    else if (timeRange === '90d') cutoff.setDate(now.getDate() - 90);
    else if (timeRange === '6m') cutoff.setMonth(now.getMonth() - 6);
    else if (timeRange === '1y') cutoff.setFullYear(now.getFullYear() - 1);
    return expenses.filter(e => new Date(e.expense_date) >= cutoff);
  }, [expenses, timeRange]);

  // Previous period for comparison
  const previousExpenses = useMemo(() => {
    if (timeRange === 'all') return [];
    const now = new Date();
    const start = new Date();
    const end = new Date();
    if (timeRange === '30d') { start.setDate(now.getDate() - 60); end.setDate(now.getDate() - 30); }
    else if (timeRange === '90d') { start.setDate(now.getDate() - 180); end.setDate(now.getDate() - 90); }
    else if (timeRange === '6m') { start.setMonth(now.getMonth() - 12); end.setMonth(now.getMonth() - 6); }
    else if (timeRange === '1y') { start.setFullYear(now.getFullYear() - 2); end.setFullYear(now.getFullYear() - 1); }
    return expenses.filter(e => {
      const d = new Date(e.expense_date);
      return d >= start && d < end;
    });
  }, [expenses, timeRange]);

  const sym = getCurrencySymbol(displayCurrency);
  const conv = (amount: number, fromCurrency: string) => convertToTarget(amount, fromCurrency, displayCurrency);
  const fmt = (v: number) => `${sym}${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmt2 = (v: number) => `${sym}${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalAmount = filteredExpenses.reduce((s, e) => s + conv(Number(e.amount), e.currency || 'INR'), 0);
  const avgExpense = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;
  const previousTotal = previousExpenses.reduce((s, e) => s + conv(Number(e.amount), e.currency || 'INR'), 0);
  const growthPct = previousTotal > 0 ? ((totalAmount - previousTotal) / previousTotal) * 100 : 0;
  const isGrowing = growthPct > 0;

  // Spend velocity (avg/day across active span)
  const velocityStats = useMemo(() => {
    if (filteredExpenses.length === 0) return { perDay: 0, daysActive: 0, totalDays: 0, projectedMonth: 0 };
    const dates = filteredExpenses.map(e => new Date(e.expense_date).getTime());
    const min = Math.min(...dates), max = Math.max(...dates);
    const totalDays = Math.max(1, Math.ceil((max - min) / 86400000) + 1);
    const uniqueDays = new Set(filteredExpenses.map(e => e.expense_date)).size;
    return {
      perDay: totalAmount / totalDays,
      daysActive: uniqueDays,
      totalDays,
      projectedMonth: (totalAmount / totalDays) * 30,
    };
  }, [filteredExpenses, totalAmount]);

  // Biggest single bill
  const biggestBill = useMemo(() => {
    if (filteredExpenses.length === 0) return null;
    return filteredExpenses.reduce((max, e) => {
      const a = conv(Number(e.amount), e.currency || 'INR');
      return a > max.amount ? { amount: a, expense: e } : max;
    }, { amount: 0, expense: filteredExpenses[0] });
  }, [filteredExpenses, displayCurrency]);

  // Currency
  const currencyBreakdown = useMemo(() => {
    const map: Record<string, { count: number; originalTotal: number; convertedTotal: number }> = {};
    filteredExpenses.forEach(e => {
      const c = e.currency || 'INR';
      if (!map[c]) map[c] = { count: 0, originalTotal: 0, convertedTotal: 0 };
      map[c].count++;
      map[c].originalTotal += Number(e.amount);
      map[c].convertedTotal += conv(Number(e.amount), c);
    });
    return Object.entries(map).map(([currency, data]) => ({ currency, ...data })).sort((a, b) => b.convertedTotal - a.convertedTotal);
  }, [filteredExpenses, displayCurrency]);

  // Tax & Discount
  const taxDiscountStats = useMemo(() => {
    let totalTax = 0, totalDiscount = 0, billsWithTax = 0, billsWithDiscount = 0;
    const taxTypes: Record<string, { count: number; amount: number; rates: Set<string> }> = {};
    filteredExpenses.forEach(e => {
      const desc = e.description || '';
      const taxAmt = Number(parseField(desc, 'Tax')) || 0;
      const discAmt = Number(parseField(desc, 'Discount')) || 0;
      const taxDetailsStr = parseField(desc, 'TaxDetails');
      if (taxAmt > 0) {
        const convertedTax = conv(taxAmt, e.currency || 'INR');
        totalTax += convertedTax;
        billsWithTax++;
        if (taxDetailsStr) {
          const parts = taxDetailsStr.split(/[+,&]/).map(p => p.trim()).filter(Boolean);
          // Try to parse rates so we can split the tax amount fairly
          const parsed = parts.map(p => {
            const m = p.match(/([\d.]+)\s*%/);
            const rate = m ? Number(m[1]) : 0;
            const name = p.replace(/\s*[\d.]+%?\s*$/, '').trim() || 'Tax';
            return { name, rate, raw: p };
          });
          const totalRate = parsed.reduce((s, x) => s + x.rate, 0);
          parsed.forEach(x => {
            if (!taxTypes[x.name]) taxTypes[x.name] = { count: 0, amount: 0, rates: new Set() };
            taxTypes[x.name].count += 1;
            if (x.rate > 0) taxTypes[x.name].rates.add(`${x.rate}%`);
            // Allocate this bill's tax across types proportionally to rate; fallback to equal split
            const share = totalRate > 0 ? x.rate / totalRate : 1 / parsed.length;
            taxTypes[x.name].amount += convertedTax * share;
          });
        } else {
          if (!taxTypes['Tax']) taxTypes['Tax'] = { count: 0, amount: 0, rates: new Set() };
          taxTypes['Tax'].count += 1;
          taxTypes['Tax'].amount += convertedTax;
        }
      }
      if (discAmt > 0) {
        totalDiscount += conv(discAmt, e.currency || 'INR');
        billsWithDiscount++;
      }
    });
    const savingsRate = totalAmount > 0 ? (totalDiscount / (totalAmount + totalDiscount)) * 100 : 0;
    return {
      totalTax: Math.round(totalTax * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      billsWithTax, billsWithDiscount,
      taxTypes: Object.entries(taxTypes)
        .map(([name, v]) => ({
          name,
          count: v.count,
          amount: Math.round(v.amount * 100) / 100,
          rates: Array.from(v.rates).sort(),
        }))
        .sort((a, b) => b.amount - a.amount),
      savingsRate,
    };
  }, [filteredExpenses, displayCurrency, totalAmount]);

  // Day of week heatmap
  const dayOfWeekStats = useMemo(() => {
    const map = DAYS.map(d => ({ day: d, total: 0, count: 0 }));
    filteredExpenses.forEach(e => {
      const d = new Date(e.expense_date).getDay();
      map[d].total += conv(Number(e.amount), e.currency || 'INR');
      map[d].count++;
    });
    const max = Math.max(...map.map(d => d.total), 1);
    return map.map(d => ({ ...d, intensity: d.total / max }));
  }, [filteredExpenses, displayCurrency]);

  const weekendVsWeekday = useMemo(() => {
    const wkend = dayOfWeekStats[0].total + dayOfWeekStats[6].total;
    const wkday = dayOfWeekStats.slice(1, 6).reduce((s, d) => s + d.total, 0);
    const wkendAvg = wkend / 2;
    const wkdayAvg = wkday / 5;
    return { wkend, wkday, wkendAvg, wkdayAvg, ratio: wkdayAvg > 0 ? wkendAvg / wkdayAvg : 0 };
  }, [dayOfWeekStats]);

  // Time of day buckets (use created_at)
  const timeOfDayStats = useMemo(() => {
    const buckets = TIME_BUCKETS.map(b => ({ ...b, total: 0, count: 0 }));
    filteredExpenses.forEach(e => {
      const h = new Date(e.created_at).getHours();
      const idx = h >= 5 && h <= 11 ? 0 : h >= 12 && h <= 16 ? 1 : h >= 17 && h <= 21 ? 2 : 3;
      buckets[idx].total += conv(Number(e.amount), e.currency || 'INR');
      buckets[idx].count++;
    });
    return buckets;
  }, [filteredExpenses, displayCurrency]);

  const monthlyTrend = useMemo(() => {
    const map: Record<string, { month: string; total: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      const d = new Date(e.expense_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { month: label, total: 0, count: 0 };
      map[key].total += conv(Number(e.amount), e.currency || 'INR');
      map[key].count += 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => ({
      ...v, total: Math.round(v.total * 100) / 100,
    }));
  }, [filteredExpenses, displayCurrency]);

  const categoryBreakdown = useMemo(() => {
    return categories.map(cat => ({
      name: cat.name,
      value: Math.round(filteredExpenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + conv(Number(e.amount), e.currency || 'INR'), 0) * 100) / 100,
      count: filteredExpenses.filter(e => e.category_id === cat.id).length,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredExpenses, categories, displayCurrency]);

  const totalCategoryAmount = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  const cumulativeData = useMemo(() => {
    let cumulative = 0;
    return monthlyTrend.map(d => {
      cumulative += d.total;
      return { ...d, cumulative: Math.round(cumulative * 100) / 100 };
    });
  }, [monthlyTrend]);

  const topMerchants = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      const m = e.merchant || 'Unknown';
      if (!map[m]) map[m] = { amount: 0, count: 0 };
      map[m].amount += conv(Number(e.amount), e.currency || 'INR');
      map[m].count += 1;
    });
    return Object.entries(map).map(([name, data]) => ({ name, amount: Math.round(data.amount * 100) / 100, count: data.count }))
      .sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [filteredExpenses, displayCurrency]);

  // Most loyal merchant (by frequency)
  const mostFrequentMerchant = useMemo(() => {
    if (topMerchants.length === 0) return null;
    return [...topMerchants].sort((a, b) => b.count - a.count)[0];
  }, [topMerchants]);

  // Highlights / fun facts
  const highlights = useMemo(() => {
    const arr: { icon: any; text: string; tone: 'good' | 'warn' | 'info' }[] = [];
    if (biggestBill && biggestBill.amount > avgExpense * 3) {
      arr.push({ icon: Trophy, text: `Your biggest bill (${fmt(biggestBill.amount)}) was ${(biggestBill.amount / avgExpense).toFixed(1)}× your average`, tone: 'info' });
    }
    if (weekendVsWeekday.ratio > 1.3) {
      arr.push({ icon: Calendar, text: `Weekends cost you ${weekendVsWeekday.ratio.toFixed(1)}× more per day than weekdays`, tone: 'warn' });
    } else if (weekendVsWeekday.ratio > 0 && weekendVsWeekday.ratio < 0.7) {
      arr.push({ icon: Calendar, text: 'You spend less on weekends — disciplined!', tone: 'good' });
    }
    const lateNight = timeOfDayStats[3];
    if (lateNight.total > totalAmount * 0.20 && totalAmount > 0) {
      arr.push({ icon: Clock, text: `${Math.round((lateNight.total / totalAmount) * 100)}% of spend happens late night`, tone: 'warn' });
    }
    if (taxDiscountStats.savingsRate > 5) {
      arr.push({ icon: Sparkles, text: `You saved ${taxDiscountStats.savingsRate.toFixed(1)}% via discounts — great deal hunting!`, tone: 'good' });
    }
    if (mostFrequentMerchant && mostFrequentMerchant.count >= 5) {
      arr.push({ icon: Flame, text: `${mostFrequentMerchant.name} is your go-to (${mostFrequentMerchant.count} visits)`, tone: 'info' });
    }
    if (timeRange !== 'all' && Math.abs(growthPct) > 10) {
      arr.push({
        icon: isGrowing ? TrendingUp : TrendingDown,
        text: `Spending is ${isGrowing ? 'up' : 'down'} ${Math.abs(growthPct).toFixed(0)}% vs previous period`,
        tone: isGrowing ? 'warn' : 'good',
      });
    }
    return arr.slice(0, 4);
  }, [biggestBill, avgExpense, weekendVsWeekday, timeOfDayStats, totalAmount, taxDiscountStats, mostFrequentMerchant, growthPct, isGrowing, timeRange]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    set.add(profile?.default_currency || 'INR');
    expenses.forEach(e => set.add(e.currency || 'INR'));
    ['INR', 'USD', 'EUR', 'GBP', 'AED'].forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [expenses, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Insights
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Your spending story, beautifully decoded</p>
        </div>
        <div className="flex gap-2">
          <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
            <SelectTrigger className="w-[100px] border-0 glass-card min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableCurrencies.map(c => (<SelectItem key={c} value={c}>{getCurrencySymbol(c)} {c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px] border-0 glass-card min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="6m">Last 6 Months</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* HERO PULSE */}
      <Card className="glass-card border-0 rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 20% 0%, hsla(152,55%,40%,0.25), transparent 60%), radial-gradient(circle at 80% 100%, hsla(43,80%,50%,0.18), transparent 60%)' }}
        />
        <CardContent className="p-5 sm:p-6 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Spending Pulse</span>
                {timeRange !== 'all' && previousTotal > 0 && (
                  <Badge variant="secondary" className={`text-[10px] gap-1 ${isGrowing ? 'text-destructive' : 'text-success'}`}>
                    {isGrowing ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(growthPct).toFixed(0)}% vs prev
                  </Badge>
                )}
              </div>
              <p className="text-4xl sm:text-5xl font-bold leading-none">{fmt(totalAmount)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                across <span className="text-foreground font-semibold">{filteredExpenses.length}</span> bills
                {velocityStats.totalDays > 0 && (
                  <> · <span className="text-foreground font-semibold">{fmt(velocityStats.perDay)}</span>/day avg</>
                )}
              </p>
            </div>
            {velocityStats.projectedMonth > 0 && timeRange !== 'all' && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Projected /month</p>
                <p className="text-2xl font-bold text-gold flex items-center justify-end gap-1.5">
                  <Target className="h-5 w-5" /> {fmt(velocityStats.projectedMonth)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((h, i) => {
            const toneStyle = h.tone === 'good'
              ? 'text-success border-success/30 bg-success/5'
              : h.tone === 'warn'
              ? 'text-gold border-gold/30 bg-gold/5'
              : 'text-info border-info/30 bg-info/5';
            return (
              <div key={i} className={`glass-card rounded-2xl p-4 border ${toneStyle}`}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5"><h.icon className="h-4 w-4" /></div>
                  <p className="text-xs sm:text-sm font-medium leading-snug text-foreground">{h.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Avg / Bill" value={fmt(avgExpense)} icon={DollarSign} variant="primary" description={`${filteredExpenses.length} bills`} />
        <StatCard title="Biggest Bill" value={biggestBill ? fmt(biggestBill.amount) : fmt(0)} icon={Trophy} variant="warning" description={biggestBill?.expense?.merchant?.slice(0, 18) || 'No data'} />
        <StatCard title="Total Tax" value={fmt(taxDiscountStats.totalTax)} icon={Percent} variant="info" description={`${taxDiscountStats.billsWithTax} bills`} />
        <StatCard title="You Saved" value={fmt(taxDiscountStats.totalDiscount)} icon={Tag} variant="success" description={`${taxDiscountStats.savingsRate.toFixed(1)}% rate`} />
      </div>

      {/* Day-of-week Heatmap + Time of day */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Weekly Rhythm
            </CardTitle>
            <CardDescription>
              {weekendVsWeekday.ratio > 0
                ? `Weekend avg: ${fmt(weekendVsWeekday.wkendAvg)} · Weekday avg: ${fmt(weekendVsWeekday.wkdayAvg)}`
                : 'Spending by day of week'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {dayOfWeekStats.map((d, i) => {
                const isWeekend = i === 0 || i === 6;
                const bg = `hsla(152, 55%, 42%, ${0.15 + d.intensity * 0.65})`;
                return (
                  <div
                    key={d.day}
                    className="rounded-xl p-2.5 text-center transition-all hover:scale-105"
                    style={{ background: bg, border: `1px solid hsla(152, 55%, 42%, ${0.2 + d.intensity * 0.4})` }}
                  >
                    <p className={`text-[10px] uppercase tracking-wider mb-1 ${isWeekend ? 'text-gold' : 'text-muted-foreground'}`}>{d.day}</p>
                    <p className="text-xs sm:text-sm font-bold text-foreground truncate">{d.total > 0 ? fmt(d.total) : '—'}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{d.count}x</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-info" /> Time of Day
            </CardTitle>
            <CardDescription>When your wallet opens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {timeOfDayStats.map((b, i) => {
                const max = Math.max(...timeOfDayStats.map(x => x.total), 1);
                const pct = (b.total / max) * 100;
                const isLateNight = b.label === 'Late Night';
                return (
                  <div key={b.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium flex items-center gap-2">
                        <span className="text-base">{b.icon}</span>
                        {b.label}
                        {isLateNight && b.total > totalAmount * 0.15 && totalAmount > 0 && (
                          <AlertTriangle className="h-3 w-3 text-gold" />
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs">{fmt(b.total)} · {b.count}x</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: isLateNight ? 'hsl(43, 80%, 55%)' : CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Currency Breakdown */}
      {currencyBreakdown.length > 1 && (
        <Card className="glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" /> Multi-Currency Breakdown
            </CardTitle>
            <CardDescription>Spending across currencies (converted to {displayCurrency})</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {currencyBreakdown.map((cb, i) => {
                const pct = totalAmount > 0 ? (cb.convertedTotal / totalAmount) * 100 : 0;
                const origSym = getCurrencySymbol(cb.currency);
                return (
                  <div key={cb.currency} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{origSym} {cb.currency}</span>
                        <span className="text-xs text-muted-foreground">{cb.count} bill{cb.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium">{origSym}{cb.originalTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        {cb.currency !== displayCurrency && (
                          <span className="text-xs text-muted-foreground ml-2">≈ {fmt2(cb.convertedTotal)}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tax & Discount Insights */}
      {(taxDiscountStats.totalTax > 0 || taxDiscountStats.totalDiscount > 0) && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {taxDiscountStats.totalTax > 0 && (
            <Card className="glass-card border-0 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Percent className="h-5 w-5 text-info" /> Tax Summary
                </CardTitle>
                <CardDescription>{taxDiscountStats.billsWithTax} bills with tax</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground mb-3">{fmt2(taxDiscountStats.totalTax)}</p>
                {taxDiscountStats.taxTypes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tap a tax type for details</p>
                    <div className="flex flex-wrap gap-1.5">
                      {taxDiscountStats.taxTypes.map(t => {
                        const isActive = selectedTaxType === t.name;
                        return (
                          <button
                            key={t.name}
                            type="button"
                            onClick={() => setSelectedTaxType(isActive ? null : t.name)}
                            className={`group flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                              isActive
                                ? 'bg-info/15 border-info/50 text-foreground'
                                : 'bg-secondary/40 border-transparent text-foreground hover:bg-secondary/60'
                            }`}
                            aria-pressed={isActive}
                          >
                            <span
                              className={`h-3 w-3 rounded-full border-2 transition-colors ${
                                isActive ? 'border-info bg-info' : 'border-muted-foreground/40'
                              }`}
                            />
                            <span className="font-medium">{t.name}</span>
                            <span className="text-muted-foreground">({t.count})</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedTaxType && (() => {
                      const t = taxDiscountStats.taxTypes.find(x => x.name === selectedTaxType);
                      if (!t) return null;
                      const sharePct = taxDiscountStats.totalTax > 0
                        ? (t.amount / taxDiscountStats.totalTax) * 100 : 0;
                      const avgPerBill = t.count > 0 ? t.amount / t.count : 0;
                      return (
                        <div className="mt-3 rounded-xl border border-info/25 bg-info/5 p-3 animate-fade-in">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-sm font-semibold text-foreground">{t.name} breakdown</p>
                            {t.rates.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {t.rates.map(r => (
                                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info font-medium">{r}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-background/40 p-2">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total</p>
                              <p className="text-sm font-bold text-foreground mt-0.5">{fmt2(t.amount)}</p>
                            </div>
                            <div className="rounded-lg bg-background/40 p-2">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Bills</p>
                              <p className="text-sm font-bold text-foreground mt-0.5">{t.count}</p>
                            </div>
                            <div className="rounded-lg bg-background/40 p-2">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Avg/bill</p>
                              <p className="text-sm font-bold text-foreground mt-0.5">{fmt2(avgPerBill)}</p>
                            </div>
                          </div>
                          <div className="mt-2.5 space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Share of total tax</span>
                              <span className="text-foreground font-medium">{sharePct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                              <div className="h-full rounded-full bg-info transition-all duration-500" style={{ width: `${Math.max(sharePct, 2)}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {taxDiscountStats.totalDiscount > 0 && (
            <Card className="glass-card border-0 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Tag className="h-5 w-5 text-success" /> Savings Snapshot
                </CardTitle>
                <CardDescription>{taxDiscountStats.billsWithDiscount} bills with discounts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-success mb-2">{fmt2(taxDiscountStats.totalDiscount)}</p>
                <p className="text-sm text-muted-foreground">
                  Avg savings of <span className="text-foreground font-medium">{fmt2(taxDiscountStats.totalDiscount / taxDiscountStats.billsWithDiscount)}</span> per discounted bill · <span className="text-success font-medium">{taxDiscountStats.savingsRate.toFixed(1)}%</span> savings rate
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-5">
        <Card className="lg:col-span-3 glass-card border-0 rounded-2xl">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2"><Zap className="h-4 w-4 text-gold" /> Monthly Trend</CardTitle>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl sm:text-3xl font-bold">{fmt2(totalAmount)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {monthlyTrend.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(160, 8%, 25%, 0.3)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `${sym}${v}`} />
                  <Tooltip formatter={(val: number) => [fmt2(val), 'Spent']} contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }} />
                  <Bar dataKey="total" fill="hsl(152, 57%, 42%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Spending by Category</CardTitle>
            <CardDescription>Where your money goes</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3} strokeWidth={0}>
                      {categoryBreakdown.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(val: number) => fmt2(val)} contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-1.5 mt-2 w-full">
                  {categoryBreakdown.map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-2 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{cat.name}</span>
                      <span className="ml-auto font-semibold">{totalCategoryAmount > 0 ? Math.round((cat.value / totalCategoryAmount) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Cumulative Spending</CardTitle>
            <CardDescription>Running total over time</CardDescription>
          </CardHeader>
          <CardContent>
            {cumulativeData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={cumulativeData}>
                  <defs>
                    <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(152, 57%, 42%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(152, 57%, 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(160, 8%, 25%, 0.3)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(160, 8%, 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `${sym}${v}`} />
                  <Tooltip formatter={(val: number) => [fmt2(val), 'Cumulative']} contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(160, 10%, 12%)', color: 'hsl(60, 10%, 95%)' }} />
                  <Area type="monotone" dataKey="cumulative" stroke="hsl(152, 57%, 42%)" fill="url(#gradCumulative)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Flame className="h-4 w-4 text-gold" /> Top Merchants
            </CardTitle>
            <CardDescription>
              {mostFrequentMerchant ? `Most loyal: ${mostFrequentMerchant.name} (${mostFrequentMerchant.count}x)` : 'Where you spend the most'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topMerchants.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topMerchants.map((m, i) => {
                  const maxAmount = topMerchants[0].amount;
                  const pct = (m.amount / maxAmount) * 100;
                  return (
                    <div key={m.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="font-medium truncate flex items-center gap-1.5">
                          {i === 0 && <Trophy className="h-3 w-3 text-gold shrink-0" />}
                          {m.name}
                        </span>
                        <span className="text-muted-foreground text-xs">{fmt(m.amount)} · {m.count}x</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/50">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
