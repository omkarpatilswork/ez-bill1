import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle } from 'lucide-react';
import type { Expense, ExpenseStatus } from '@/lib/types';

const STATUSES: ExpenseStatus[] = ['draft', 'submitted', 'manager_approved', 'approved', 'rejected', 'reimbursed'];

export default function AllExpenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewExpense, setReviewExpense] = useState<Expense | null>(null);
  const [comments, setComments] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchExpenses = async () => {
    let query = supabase.from('expenses').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter as ExpenseStatus);
    const { data } = await query;
    setExpenses((data as unknown as Expense[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, [statusFilter]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleBatchAction = async (action: 'approved' | 'rejected') => {
    if (!user || selectedIds.size === 0) return;
    setProcessing(true);
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    for (const id of selectedIds) {
      await supabase.from('approval_actions').insert({
        expense_id: id, approver_id: user.id, action, comments: 'Batch action', level: 'finance',
      } as any);
      await supabase.from('expenses').update({ status: newStatus } as any).eq('id', id);
      await supabase.from('audit_logs').insert({
        expense_id: id, user_id: user.id, action: `finance_${action}`, details: { batch: true },
      } as any);
    }
    toast({ title: `${selectedIds.size} expenses ${action}` });
    setSelectedIds(new Set());
    setProcessing(false);
    fetchExpenses();
  };

  const handleSingleAction = async (action: 'approved' | 'rejected') => {
    if (!reviewExpense || !user) return;
    setProcessing(true);
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    await supabase.from('approval_actions').insert({
      expense_id: reviewExpense.id, approver_id: user.id, action, comments, level: 'finance',
    } as any);
    await supabase.from('expenses').update({ status: newStatus } as any).eq('id', reviewExpense.id);
    await supabase.from('audit_logs').insert({
      expense_id: reviewExpense.id, user_id: user.id, action: `finance_${action}`, details: { comments },
    } as any);
    toast({ title: `Expense ${action}` });
    setReviewExpense(null);
    setComments('');
    setProcessing(false);
    fetchExpenses();
  };

  const handleMarkReimbursed = async () => {
    if (!user || selectedIds.size === 0) return;
    setProcessing(true);
    for (const id of selectedIds) {
      await supabase.from('expenses').update({ status: 'reimbursed' } as any).eq('id', id);
      await supabase.from('audit_logs').insert({
        expense_id: id, user_id: user.id, action: 'marked_reimbursed', details: {},
      } as any);
    }
    toast({ title: `${selectedIds.size} expenses marked as reimbursed` });
    setSelectedIds(new Set());
    setProcessing(false);
    fetchExpenses();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold">All Expenses</h1>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 min-h-[44px]"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto min-h-[44px]" onClick={() => handleBatchAction('approved')} disabled={processing}>
              <CheckCircle className="mr-1 h-4 w-4" /> Approve ({selectedIds.size})
            </Button>
            <Button size="sm" variant="destructive" className="w-full sm:w-auto min-h-[44px]" onClick={() => handleBatchAction('rejected')} disabled={processing}>
              <XCircle className="mr-1 h-4 w-4" /> Reject ({selectedIds.size})
            </Button>
            <Button size="sm" variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={handleMarkReimbursed} disabled={processing}>
              Mark Reimbursed ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"><Checkbox checked={selectedIds.size === expenses.length && expenses.length > 0} onCheckedChange={c => setSelectedIds(c ? new Set(expenses.map(e => e.id)) : new Set())} /></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell><Checkbox checked={selectedIds.has(exp.id)} onCheckedChange={() => toggleSelect(exp.id)} /></TableCell>
                      <TableCell className="font-medium">{exp.title}</TableCell>
                      <TableCell>${Number(exp.amount).toFixed(2)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                      <TableCell><StatusBadge status={exp.status as ExpenseStatus} /></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setReviewExpense(exp)}>Review</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewExpense} onOpenChange={() => { setReviewExpense(null); setComments(''); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader><DialogTitle>Review: {reviewExpense?.title}</DialogTitle></DialogHeader>
          {reviewExpense && (
            <div className="space-y-4">
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Amount:</span> ${Number(reviewExpense.amount).toFixed(2)}</div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={reviewExpense.status as ExpenseStatus} /></div>
                <div><span className="text-muted-foreground">Date:</span> {new Date(reviewExpense.expense_date).toLocaleDateString()}</div>
                <div><span className="text-muted-foreground">Merchant:</span> {reviewExpense.merchant || '—'}</div>
              </div>
              <Textarea className="min-h-[44px]" placeholder="Comments..." value={comments} onChange={e => setComments(e.target.value)} />
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="destructive" className="w-full sm:w-auto min-h-[44px]" disabled={processing} onClick={() => handleSingleAction('rejected')}>
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
            <Button className="w-full sm:w-auto min-h-[44px]" disabled={processing} onClick={() => handleSingleAction('approved')}>
              <CheckCircle className="mr-2 h-4 w-4" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
