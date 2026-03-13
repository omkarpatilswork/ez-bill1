import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Calendar, Building2, FolderOpen, DollarSign, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { Expense, ExpenseStatus, ApprovalAction, AuditLog } from '@/lib/types';

const STATUS_FLOW: { status: ExpenseStatus; label: string; icon: typeof Clock }[] = [
  { status: 'draft', label: 'Draft', icon: FileText },
  { status: 'submitted', label: 'Submitted', icon: Clock },
  { status: 'manager_approved', label: 'Manager', icon: CheckCircle },
  { status: 'approved', label: 'Approved', icon: CheckCircle },
  { status: 'reimbursed', label: 'Reimbursed', icon: DollarSign },
];

function getStatusStep(status: ExpenseStatus): number {
  if (status === 'rejected') return -1;
  const idx = STATUS_FLOW.findIndex(s => s.status === status);
  return idx >= 0 ? idx : 0;
}

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
    toast({ title: 'Expense submitted', description: 'Your expense is now pending approval.' });
    navigate('/expenses');
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
    </div>
  );
  if (!expense) return (
    <div className="text-center py-20">
      <p className="text-destructive font-medium">Expense not found.</p>
      <Button asChild variant="ghost" className="mt-4"><Link to="/expenses">Back to Expenses</Link></Button>
    </div>
  );

  const currentStep = getStatusStep(expense.status as ExpenseStatus);
  const isRejected = expense.status === 'rejected';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild className="h-8 px-2">
          <Link to="/expenses"><ArrowLeft className="h-4 w-4 mr-1" /> Expenses</Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground truncate max-w-[200px]">{expense.title}</span>
      </div>

      {/* Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{expense.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Created {new Date(expense.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <StatusBadge status={expense.status as ExpenseStatus} />
      </div>

      {/* Status Flow Indicator */}
      {!isRejected && (
        <Card className="shadow-md border-0">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              {STATUS_FLOW.map((step, i) => {
                const isActive = i <= currentStep;
                const isCurrent = i === currentStep;
                const StepIcon = step.icon;
                return (
                  <div key={step.status} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                        isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                        isActive ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        <StepIcon className="h-4 w-4" />
                      </div>
                      <span className={`text-[10px] font-medium ${isCurrent ? 'text-primary' : isActive ? 'text-success' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full ${i < currentStep ? 'bg-success' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isRejected && (
        <Card className="shadow-md border-0 border-l-4 border-l-destructive">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">Expense Rejected</p>
              <p className="text-sm text-muted-foreground">This expense was not approved. Check the approval history for details.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card className="shadow-md border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Amount</p>
                <p className="text-lg font-bold text-foreground tabular-nums">${Number(expense.amount).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{expense.currency}</span></p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Merchant</p>
                <p className="font-medium">{expense.merchant || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Date</p>
                <p className="font-medium">{new Date(expense.expense_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cost Center</p>
                <p className="font-medium">{expense.cost_center || '—'}</p>
              </div>
            </div>
          </div>
          {expense.description && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-foreground leading-relaxed">{expense.description}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {expense.status === 'draft' && expense.user_id === user?.id && (
        <div className="flex gap-3">
          <Button onClick={handleSubmitDraft} className="min-h-[44px]">Submit for Approval</Button>
          <Button variant="outline" onClick={() => navigate('/expenses')} className="min-h-[44px]">Back to Expenses</Button>
        </div>
      )}

      {/* Approval History */}
      {approvals.length > 0 && (
        <Card className="shadow-md border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Approval History</CardTitle>
            <CardDescription className="text-xs">Timeline of approval decisions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvals.map(a => (
              <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30">
                <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${a.action === 'approved' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                  {a.action === 'approved' ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {a.level === 'manager' ? 'Manager' : 'Finance'} — <span className={a.action === 'approved' ? 'text-success' : 'text-destructive'}>{a.action}</span>
                    </p>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                  {a.comments && <p className="text-sm text-muted-foreground mt-0.5">{a.comments}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Audit Trail */}
      {auditLogs.length > 0 && (
        <Card className="shadow-md border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activity Log</CardTitle>
            <CardDescription className="text-xs">Complete history of actions on this expense</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative pl-4 border-l-2 border-border space-y-3">
              {auditLogs.map(log => (
                <div key={log.id} className="relative">
                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-border border-2 border-card" />
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                    <span className="text-sm font-medium">{log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                    <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
