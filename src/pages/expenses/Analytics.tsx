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
import { TrendingUp, DollarSign, ArrowUpRight, Receipt } from 'lucide-react';
import type { Expense, ExpenseCategory } from '@/lib/types';

const CHART_COLORS = [
  'hsl(152, 57%, 42%)', 'hsl(221, 83%, 53%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)', 'hsl(199, 89%, 48%)', 'hsl(280, 67%, 55%)', 'hsl(330, 65%, 50%)',
];

export default function Analytics() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');

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

  const totalAmount = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const avgExpense = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;

  const monthlyTrend = useMemo(() => {
    const map: Record<string, { month: string; total: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      const d = new Date(e.expense_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { month: label, total: 0, count: 0 };
      map[key].total += Number(e.amount);
      map[key].count += 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => ({
      ...v, total: Math.round(v.total * 100) / 100,
    }));
  }, [filteredExpenses]);

  const categoryBreakdown = useMemo(() => {
    return categories.map(cat => ({
      name: cat.name,
      value: Math.round(filteredExpenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0) * 100) / 100,
      count: filteredExpenses.filter(e => e.category_id === cat.id).length,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredExpenses, categories]);

  const totalCategoryAmount = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  const costCenterData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const cc = e.cost_center || 'Unassigned';
      map[cc] = (map[cc] || 0) + Number(e.amount);
    });
    return Object.entries(map).map(([name, value]) => ({
      name, value: Math.round(value * 100) / 100,
    })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const topMerchants = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      const m = e.merchant || 'Unknown';
      if (!map[m]) map[m] = { amount: 0, count: 0 };
      map[m].amount += Number(e.amount);
      map[m].count += 1;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, amount: Math.round(data.amount * 100) / 100, count: data.count }))
      .sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [filteredExpenses]);

  const cumulativeData = useMemo(() => {
    let cumulative = 0;
    return monthlyTrend.map(d => {
      cumulative += d.total;
      return { ...d, cumulative: Math.round(cumulative * 100) / 100 };
    });
  }, [monthlyTrend]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Detailed breakdown of your spending</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-40 border-0 shadow-md bg-card min-h-[44px]">
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

      {/* Stat Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Spent" value={`₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={DollarSign} variant="primary" progress={100} description={`${filteredExpenses.length} bills`} />
        <StatCard title="Total Bills" value={filteredExpenses.length} icon={Receipt} variant="info" description="tracked" />
        <StatCard title="Avg / Bill" value={`₹${avgExpense.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={TrendingUp} variant="success" progress={65} description="per bill" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-5">
        <Card className="lg:col-span-3 shadow-md border-0">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Monthly Spending Trend</CardTitle>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl sm:text-3xl font-bold">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {monthlyTrend.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                  <Tooltip formatter={(val: number) => [`₹${val.toFixed(2)}`, 'Spent']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="total" fill="hsl(152, 57%, 42%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-md border-0">
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
                    <Tooltip formatter={(val: number) => `₹${val.toFixed(2)}`} />
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
        <Card className="shadow-md border-0">
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                  <Tooltip formatter={(val: number) => [`₹${val.toFixed(2)}`, 'Cumulative']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="cumulative" stroke="hsl(152, 57%, 42%)" fill="url(#gradCumulative)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Spending by Department</CardTitle>
            <CardDescription>Cost center allocation</CardDescription>
          </CardHeader>
          <CardContent>
            {costCenterData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={costCenterData} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                  <Tooltip formatter={(val: number) => [`₹${val.toFixed(2)}`, 'Amount']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {costCenterData.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Merchants */}
      <Card className="shadow-md border-0">
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
                      <span className="text-muted-foreground text-xs">₹{m.amount.toLocaleString('en-IN')} · {m.count}x</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
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
  );
}
