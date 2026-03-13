import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Receipt } from 'lucide-react';
import type { Expense, ExpenseStatus } from '@/lib/types';

const STATUSES: ExpenseStatus[] = ['draft', 'submitted', 'manager_approved', 'approved', 'rejected', 'reimbursed'];

export default function MyExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    let query = supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter as ExpenseStatus);
    query.then(({ data }) => {
      setExpenses((data as unknown as Expense[]) || []);
      setLoading(false);
    });
  }, [user, statusFilter]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">My Expenses</h1>
        <Button asChild className="w-full sm:w-auto"><Link to="/expenses/new"><PlusCircle className="mr-2 h-4 w-4" /> New Expense</Link></Button>
      </div>

      <div className="flex gap-4 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No expenses found.</p>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="block sm:hidden space-y-3">
                {expenses.map(exp => (
                  <Link key={exp.id} to={`/expenses/${exp.id}`} className="block rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate mr-2">{exp.title}</span>
                      <StatusBadge status={exp.status as ExpenseStatus} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{exp.merchant || '—'}</span>
                      <span className="font-semibold text-foreground">${Number(exp.amount).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(exp.expense_date).toLocaleDateString()}</p>
                  </Link>
                ))}
              </div>
              {/* Desktop table */}
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell>
                        <Link to={`/expenses/${exp.id}`} className="text-primary hover:underline font-medium">{exp.title}</Link>
                      </TableCell>
                      <TableCell>{exp.merchant || '—'}</TableCell>
                      <TableCell>${Number(exp.amount).toFixed(2)}</TableCell>
                      <TableCell>{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                      <TableCell><StatusBadge status={exp.status as ExpenseStatus} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
