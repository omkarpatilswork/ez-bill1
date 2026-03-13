import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { Expense, ExpenseCategory, ExpenseStatus } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/types';

const CHART_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(280, 67%, 55%)',
  'hsl(330, 65%, 50%)',
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'hsl(215, 16%, 47%)',
  submitted: 'hsl(221, 83%, 53%)',
  manager_approved: 'hsl(38, 92%, 50%)',
  approved: 'hsl(142, 71%, 45%)',
  rejected: 'hsl(0, 84%, 60%)',
  reimbursed: 'hsl(199, 89%, 48%)',
};

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

  // Summary stats
  const totalAmount = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const pendingAmount = filteredExpenses.filter(e => ['submitted', 'manager_approved'].includes(e.status)).reduce((s, e) => s + Number(e.amount), 0);
  const approvedAmount = filteredExpenses.filter(e => ['approved', 'reimbursed'].includes(e.status)).reduce((s, e) => s + Number(e.amount), 0);
  const rejectedAmount = filteredExpenses.filter(e => e.status === 'rejected').reduce((s, e) => s + Number(e.amount), 0);
  const avgExpense = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;

  // Monthly trend
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
      ...v,
      total: Math.round(v.total * 100) / 100,
    }));
  }, [filteredExpenses]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    return categories.map(cat => ({
      name: cat.name,
      value: Math.round(filteredExpenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0) * 100) / 100,
      count: filteredExpenses.filter(e => e.category_id === cat.id).length,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredExpenses, categories]);

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, { count: number; amount: number }> = {};
    filteredExpenses.forEach(e => {
      if (!counts[e.status]) counts[e.status] = { count: 0, amount: 0 };
      counts[e.status].count += 1;
      counts[e.status].amount += Number(e.amount);
    });
    return Object.entries(counts).map(([status, data]) => ({
      status: STATUS_CONFIG[status as ExpenseStatus]?.label || status,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
      fill: STATUS_COLORS[status] || 'hsl(215, 16%, 47%)',
    }));
  }, [filteredExpenses]);

  // Cost center breakdown
  const costCenterData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const cc = e.cost_center || 'Unassigned';
      map[cc] = (map[cc] || 0) + Number(e.amount);
    });
    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
    })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // Top merchants
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
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [filteredExpenses]);

  // Cumulative spending over time
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40">
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

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">${pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-xl font-bold">${approvedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rejected</p>
                <p className="text-xl font-bold">${rejectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg / Expense</p>
                <p className="text-xl font-bold">${avgExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Spending Trend</CardTitle>
            <CardDescription>How your spending has changed over time</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyTrend.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(val: number) => [`$${val.toFixed(2)}`, 'Amount']} />
                  <Bar dataKey="total" fill="hsl(221, 83%, 53%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
            <CardDescription>Where your money goes</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {categoryBreakdown.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => `$${val.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 w-[40%]">
                  {categoryBreakdown.map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-2 text-sm">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="truncate text-muted-foreground">{cat.name}</span>
                      <span className="ml-auto font-medium">${cat.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cumulative Spending</CardTitle>
            <CardDescription>Running total of expenses over time</CardDescription>
          </CardHeader>
          <CardContent>
            {cumulativeData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cumulativeData}>
                  <defs>
                    <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cumulative']} />
                  <Area type="monotone" dataKey="cumulative" stroke="hsl(221, 83%, 53%)" fill="url(#gradCumulative)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
            <CardDescription>Current status of all expenses</CardDescription>
          </CardHeader>
          <CardContent>
            {statusBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="status" type="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(val: number, name: string) =>
                      name === 'count' ? [val, 'Count'] : [`$${val.toFixed(2)}`, 'Amount']
                    }
                  />
                  <Legend />
                  <Bar dataKey="count" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 3 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by Department</CardTitle>
            <CardDescription>Cost center allocation</CardDescription>
          </CardHeader>
          <CardContent>
            {costCenterData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costCenterData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(val: number) => [`$${val.toFixed(2)}`, 'Amount']} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {costCenterData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Merchants</CardTitle>
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
                    <div key={m.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{m.name}</span>
                        <span className="text-muted-foreground">${m.amount.toLocaleString()} ({m.count}x)</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
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
