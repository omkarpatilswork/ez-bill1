import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { TrendingUp, DollarSign, Receipt, Percent, Tag, Coins } from 'lucide-react';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { getCurrencySymbol } from '@/lib/countries';

const CHART_COLORS = [
  'hsl(152, 57%, 42%)', 'hsl(221, 83%, 53%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)', 'hsl(199, 89%, 48%)', 'hsl(280, 67%, 55%)', 'hsl(330, 65%, 50%)',
];

// Rough static exchange rates to INR (good enough for analytics display)
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

export default function Analytics() {
  const { user, profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');
  const [displayCurrency, setDisplayCurrency] = useState(profile?.default_currency || 'INR');

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

  const sym = getCurrencySymbol(displayCurrency);
  const conv = (amount: number, fromCurrency: string) => convertToTarget(amount, fromCurrency, displayCurrency);
  const fmt = (v: number) => `${sym}${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmt2 = (v: number) => `${sym}${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalAmount = filteredExpenses.reduce((s, e) => s + conv(Number(e.amount), e.currency || 'INR'), 0);
  const avgExpense = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;

  // ── Currency breakdown ──
  const currencyBreakdown = useMemo(() => {
    const map: Record<string, { count: number; originalTotal: number; convertedTotal: number }> = {};
    filteredExpenses.forEach(e => {
      const c = e.currency || 'INR';
      if (!map[c]) map[c] = { count: 0, originalTotal: 0, convertedTotal: 0 };
      map[c].count++;
      map[c].originalTotal += Number(e.amount);
      map[c].convertedTotal += conv(Number(e.amount), c);
    });
    return Object.entries(map)
      .map(([currency, data]) => ({ currency, ...data }))
      .sort((a, b) => b.convertedTotal - a.convertedTotal);
  }, [filteredExpenses, displayCurrency]);

  // ── Tax & Discount aggregation ──
  const taxDiscountStats = useMemo(() => {
    let totalTax = 0;
    let totalDiscount = 0;
    let billsWithTax = 0;
    let billsWithDiscount = 0;
    const taxTypes: Record<string, number> = {};

    filteredExpenses.forEach(e => {
      const desc = e.description || '';
      const taxStr = parseField(desc, 'Tax');
      const discStr = parseField(desc, 'Discount');
      const taxDetailsStr = parseField(desc, 'TaxDetails');
      const taxAmt = Number(taxStr) || 0;
      const discAmt = Number(discStr) || 0;

      if (taxAmt > 0) {
        totalTax += conv(taxAmt, e.currency || 'INR');
        billsWithTax++;
        // Parse tax details for breakdown
        if (taxDetailsStr) {
          // e.g. "CGST 2.5% + SGST 2.5%" or "GST 18%"
          const parts = taxDetailsStr.split(/[+,&]/);
          parts.forEach(p => {
            const name = p.trim().replace(/\s*[\d.]+%?\s*$/, '').trim() || 'Tax';
            taxTypes[name] = (taxTypes[name] || 0) + 1;
          });
        } else {
          taxTypes['Tax'] = (taxTypes['Tax'] || 0) + 1;
        }
      }
      if (discAmt > 0) {
        totalDiscount += conv(discAmt, e.currency || 'INR');
        billsWithDiscount++;
      }
    });

    return {
      totalTax: Math.round(totalTax * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      billsWithTax,
      billsWithDiscount,
      taxTypes: Object.entries(taxTypes).sort((a, b) => b[1] - a[1]),
    };
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
    return Object.entries(map)
      .map(([name, data]) => ({ name, amount: Math.round(data.amount * 100) / 100, count: data.count }))
      .sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [filteredExpenses, displayCurrency]);

  // Available currencies in user's expenses
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    set.add(profile?.default_currency || 'INR');
    expenses.forEach(e => set.add(e.currency || 'INR'));
    // Add common ones
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
          <h1 className="text-2xl sm:text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Detailed breakdown of your spending</p>
        </div>
        <div className="flex gap-2">
          <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
            <SelectTrigger className="w-[100px] border-0 glass-card min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCurrencies.map(c => (
                <SelectItem key={c} value={c}>{getCurrencySymbol(c)} {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px] border-0 glass-card min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
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

      {/* Stat Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Spent" value={fmt(totalAmount)} icon={DollarSign} variant="primary" progress={100} description={`${filteredExpenses.length} bills`} />
        <StatCard title="Avg / Bill" value={fmt(avgExpense)} icon={TrendingUp} variant="success" progress={65} description="per bill" />
        <StatCard title="Total Tax" value={fmt(taxDiscountStats.totalTax)} icon={Percent} variant="info" description={`${taxDiscountStats.billsWithTax} bills`} />
        <StatCard title="Total Discounts" value={fmt(taxDiscountStats.totalDiscount)} icon={Tag} variant="warning" description={`${taxDiscountStats.billsWithDiscount} bills`} />
      </div>

      {/* Currency Breakdown */}
      {currencyBreakdown.length > 1 && (
        <Card className="glass-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" /> Multi-Currency Breakdown
            </CardTitle>
            <CardDescription>Spending across different currencies (converted to {displayCurrency})</CardDescription>
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
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
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
                  <Percent className="h-5 w-5 text-primary" /> Tax Summary
                </CardTitle>
                <CardDescription>{taxDiscountStats.billsWithTax} bills with tax</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground mb-3">{fmt2(taxDiscountStats.totalTax)}</p>
                {taxDiscountStats.taxTypes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tax Types Found</p>
                    <div className="flex flex-wrap gap-1.5">
                      {taxDiscountStats.taxTypes.map(([name, count]) => (
                        <span key={name} className="text-xs bg-secondary/50 text-foreground px-2 py-1 rounded-md">
                          {name} <span className="text-muted-foreground">({count})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {taxDiscountStats.totalDiscount > 0 && (
            <Card className="glass-card border-0 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Tag className="h-5 w-5 text-emerald-500" /> Discount Summary
                </CardTitle>
                <CardDescription>{taxDiscountStats.billsWithDiscount} bills with discounts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-500 mb-2">{fmt2(taxDiscountStats.totalDiscount)}</p>
                <p className="text-sm text-muted-foreground">
                  You saved an average of {fmt2(taxDiscountStats.totalDiscount / taxDiscountStats.billsWithDiscount)} per discounted bill
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
              <CardTitle className="text-base sm:text-lg">Monthly Spending Trend</CardTitle>
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
            <CardTitle className="text-base sm:text-lg">Top Merchants</CardTitle>
            <CardDescription>Where you spend the most</CardDescription>
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
                        <span className="font-medium truncate">{m.name}</span>
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
