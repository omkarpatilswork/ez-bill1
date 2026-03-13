import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/dashboard/StatCard';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Receipt, Clock, CheckCircle, DollarSign, PlusCircle,
  TrendingUp, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import type { Expense, ExpenseCategory, ExpenseStatus } from '@/lib/types';

const DONUT_COLORS = [
  'hsl(152, 57%, 42%)',
  'hsl(221, 83%, 53%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(280, 67%, 55%)',
];

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('expenses').select('*').eq('user_id', user.id).order('expense_date', { ascending: true }),
      supabase.from('expense_categories').select('*'),
    ]).then(([recentRes, allRes, catRes]) => {
      setExpenses((recentRes.data as unknown as Expense[]) || []);
      setAllExpenses((allRes.data as unknown as Expense[]) || []);
      setCategories((catRes.data as unknown as ExpenseCategory[]) || []);
      setLoading(false);
    });
  }, [user]);

  const total = allExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const pending = allExpenses.filter(e => ['submitted', 'manager_approved'].includes(e.status));
  const approved = allExpenses.filter(e => e.status === 'approved' || e.status === 'reimbursed');
  const pendingAmount = pending.reduce((s, e) => s + Number(e.amount), 0);
  const approvedAmount = approved.reduce((s, e) => s + Number(e.amount), 0);

  // Monthly chart data
  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    allExpenses.forEach(e => {
      const d = new Date(e.expense_date);
      const day = d.getDate();
      map[String(day)] = (map[String(day)] || 0) + Number(e.amount);
    });
    // Show last 15 data points
    return Object.entries(map)
      .slice(-15)
      .map(([day, amount]) => ({ day, amount: Math.round(amount * 100) / 100 }));
  }, [allExpenses]);

  // Category donut
  const categoryData = useMemo(() => {
    return categories.map(cat => ({
      name: cat.name,
      value: Math.round(allExpenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0) * 100) / 100,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [allExpenses, categories]);

  const totalCategoryAmount = categoryData.reduce((s, d) => s + d.value, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}! Here's your expense overview.
          </p>
        </div>
        <Button asChild size="lg" className="shadow-lg">
          <Link to="/expenses/new"><PlusCircle className="mr-2 h-4 w-4" /> New Expense</Link>
        </Button>
      </div>

      {/* Colorful Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Expenses"
          value={allExpenses.length}
          icon={Receipt}
          variant="primary"
          progress={100}
          description={`$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`}
        />
        <StatCard
          title="Pending"
          value={pending.length}
          icon={Clock}
          variant="warning"
          progress={allExpenses.length > 0 ? Math.round((pending.length / allExpenses.length) * 100) : 0}
          description={`$${pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatCard
          title="Approved"
          value={approved.length}
          icon={CheckCircle}
          variant="success"
          progress={allExpenses.length > 0 ? Math.round((approved.length / allExpenses.length) * 100) : 0}
          description={`$${approvedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatCard
          title="Total Spent"
          value={`$${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          variant="info"
          progress={75}
          description={`${allExpenses.length} expenses`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Spending Chart - wider */}
        <Card className="lg:col-span-3 shadow-md border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Total Spending</CardTitle>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="flex items-center text-xs font-medium text-success">
                  <ArrowUpRight className="h-3 w-3 mr-0.5" />
                  7%
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip
                  formatter={(val: number) => [`$${val.toFixed(2)}`, 'Spent']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="amount" fill="hsl(152, 57%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card className="lg:col-span-2 shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Spending by Category</CardTitle>
            <CardDescription>Breakdown of expenses</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => `$${val.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-2 w-full">
                  {categoryData.map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-2 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{cat.name}</span>
                      <span className="ml-auto font-semibold">
                        {totalCategoryAmount > 0 ? Math.round((cat.value / totalCategoryAmount) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Expenses */}
      <Card className="shadow-md border-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Expenses</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/expenses" className="text-primary text-sm font-medium">
              View All <ArrowUpRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No expenses yet. Submit your first expense!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.slice(0, 6).map(exp => (
                  <TableRow key={exp.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Link to={`/expenses/${exp.id}`} className="font-medium hover:text-primary transition-colors">
                        {exp.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{exp.merchant || '—'}</TableCell>
                    <TableCell className="font-semibold">${Number(exp.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                    <TableCell><StatusBadge status={exp.status as ExpenseStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
