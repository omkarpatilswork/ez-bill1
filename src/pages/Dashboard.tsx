import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/dashboard/StatCard';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt, Clock, CheckCircle, DollarSign, PlusCircle } from 'lucide-react';
import type { Expense, ExpenseStatus } from '@/lib/types';

export default function Dashboard() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
  }, [user]);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const pending = expenses.filter(e => ['submitted', 'manager_approved'].includes(e.status));
  const approved = expenses.filter(e => e.status === 'approved' || e.status === 'reimbursed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link to="/expenses/new"><PlusCircle className="mr-2 h-4 w-4" /> New Expense</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Expenses" value={expenses.length} icon={Receipt} />
        <StatCard title="Pending" value={pending.length} icon={Clock} />
        <StatCard title="Approved" value={approved.length} icon={CheckCircle} />
        <StatCard title="Total Amount" value={`$${total.toFixed(2)}`} icon={DollarSign} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No expenses yet. Submit your first expense!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.slice(0, 5).map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell>
                      <Link to={`/expenses/${exp.id}`} className="text-primary hover:underline font-medium">{exp.title}</Link>
                    </TableCell>
                    <TableCell>${Number(exp.amount).toFixed(2)}</TableCell>
                    <TableCell>{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
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
