import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import type { Expense, ExpenseStatus, ApprovalAction, AuditLog } from '@/lib/types';

export default function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [approvals, setApprovals] = useState<ApprovalAction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('expenses').select('*').eq('id', id).single(),
      supabase.from('approval_actions').select('*').eq('expense_id', id).order('created_at'),
      supabase.from('audit_logs').select('*').eq('expense_id', id).order('created_at'),
    ]).then(([expRes, appRes, logRes]) => {
      setExpense(expRes.data as unknown as Expense);
      setApprovals((appRes.data as unknown as ApprovalAction[]) || []);
      setAuditLogs((logRes.data as unknown as AuditLog[]) || []);
      setLoading(false);
    });
  }, [id]);

  const handleSubmitDraft = async () => {
    if (!expense || !user) return;
    await supabase.from('expenses').update({ status: 'submitted' } as any).eq('id', expense.id);
    await supabase.from('audit_logs').insert({
      expense_id: expense.id, user_id: user.id, action: 'submitted', details: {},
    } as any);
    toast({ title: 'Expense submitted for approval' });
    navigate('/expenses');
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!expense) return <p className="text-destructive">Expense not found.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{expense.title}</h1>
        <StatusBadge status={expense.status as ExpenseStatus} />
      </div>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><span className="text-sm text-muted-foreground">Amount</span><p className="font-semibold text-lg">${Number(expense.amount).toFixed(2)} {expense.currency}</p></div>
          <div><span className="text-sm text-muted-foreground">Merchant</span><p>{expense.merchant || '—'}</p></div>
          <div><span className="text-sm text-muted-foreground">Date</span><p>{new Date(expense.expense_date).toLocaleDateString()}</p></div>
          <div><span className="text-sm text-muted-foreground">Cost Center</span><p>{expense.cost_center || '—'}</p></div>
          {expense.description && (
            <div className="md:col-span-2"><span className="text-sm text-muted-foreground">Description</span><p>{expense.description}</p></div>
          )}
        </CardContent>
      </Card>

      {expense.status === 'draft' && expense.user_id === user?.id && (
        <Button onClick={handleSubmitDraft}>Submit for Approval</Button>
      )}

      {approvals.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {approvals.map(a => (
              <div key={a.id} className="flex items-start gap-3">
                <div className={`mt-1 h-2 w-2 rounded-full ${a.action === 'approved' ? 'bg-success' : 'bg-destructive'}`} />
                <div>
                  <p className="text-sm font-medium">{a.level === 'manager' ? 'Manager' : 'Finance'} — {a.action}</p>
                  {a.comments && <p className="text-sm text-muted-foreground">{a.comments}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {auditLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {auditLogs.map(log => (
              <div key={log.id} className="flex justify-between text-sm border-b last:border-0 pb-2">
                <span>{log.action}</span>
                <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
