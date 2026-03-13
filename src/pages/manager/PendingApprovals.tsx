import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle } from 'lucide-react';
import type { Expense, ExpenseStatus } from '@/lib/types';

export default function PendingApprovals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [comments, setComments] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchExpenses = async () => {
    if (!user) return;
    const { data: reports } = await supabase.from('profiles').select('id').eq('manager_id', user.id);
    if (!reports?.length) { setLoading(false); return; }
    const ids = reports.map(r => (r as any).id);
    const { data } = await supabase.from('expenses').select('*').in('user_id', ids).eq('status', 'submitted');
    setExpenses((data as unknown as Expense[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, [user]);

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selected || !user) return;
    setProcessing(true);
    await supabase.from('approval_actions').insert({
      expense_id: selected.id, approver_id: user.id, action, comments, level: 'manager',
    } as any);
    const newStatus = action === 'approved' ? 'manager_approved' : 'rejected';
    await supabase.from('expenses').update({ status: newStatus } as any).eq('id', selected.id);
    await supabase.from('audit_logs').insert({
      expense_id: selected.id, user_id: user.id, action: `manager_${action}`,
      details: { comments },
    } as any);
    toast({ title: `Expense ${action}` });
    setSelected(null);
    setComments('');
    setProcessing(false);
    fetchExpenses();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Pending Approvals</h1>

      <Card>
        <CardHeader><CardTitle>Submitted by your team</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : expenses.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No pending approvals</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell className="font-medium">{exp.title}</TableCell>
                    <TableCell>${Number(exp.amount).toFixed(2)}</TableCell>
                    <TableCell>{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                    <TableCell><StatusBadge status={exp.status as ExpenseStatus} /></TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(exp)}>Review</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setComments(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review: {selected?.title}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-2 grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Amount:</span> ${Number(selected.amount).toFixed(2)}</div>
                <div><span className="text-muted-foreground">Merchant:</span> {selected.merchant || '—'}</div>
                <div><span className="text-muted-foreground">Date:</span> {new Date(selected.expense_date).toLocaleDateString()}</div>
                <div><span className="text-muted-foreground">Cost Center:</span> {selected.cost_center || '—'}</div>
              </div>
              {selected.description && <p className="text-sm">{selected.description}</p>}
              <Textarea placeholder="Add comments (optional)" value={comments} onChange={e => setComments(e.target.value)} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="destructive" disabled={processing} onClick={() => handleAction('rejected')}>
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
            <Button disabled={processing} onClick={() => handleAction('approved')}>
              <CheckCircle className="mr-2 h-4 w-4" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
