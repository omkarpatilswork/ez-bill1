import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Store, Package, Hash, Calendar, CreditCard, IndianRupee,
  Receipt, Eye, Users, ShieldCheck, Pencil, FileText, CheckCircle, XCircle,
  Clock, DollarSign, Send
} from 'lucide-react';
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

interface LineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function parseLineItems(description: string | null | undefined): LineItem[] {
  if (!description) return [];
  // Try to parse line items stored in description (format: "Invoice: X | Payment: Y | 3 item(s) | ...")
  return [];
}

function parseField(description: string | null | undefined, key: string): string {
  if (!description) return '';
  const match = description.match(new RegExp(`${key}:\\s*([^|]+)`));
  return match ? match[1].trim() : '';
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
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ebill');
  const [showReimburse, setShowReimburse] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('expenses').select('*').eq('id', id).single(),
      supabase.from('approval_actions').select('*').eq('expense_id', id).order('created_at'),
      supabase.from('audit_logs').select('*').eq('expense_id', id).order('created_at'),
      supabase.from('expense_receipts').select('*').eq('expense_id', id).limit(1),
    ]).then(async ([expRes, appRes, logRes, receiptRes]) => {
      setExpense(expRes.data as unknown as Expense);
      setApprovals((appRes.data as unknown as ApprovalAction[]) || []);
      setAuditLogs((logRes.data as unknown as AuditLog[]) || []);

      // Get receipt signed URL
      const receipts = receiptRes.data as any[];
      if (receipts && receipts.length > 0) {
        setReceiptName(receipts[0].file_name || '');
        const { data: signedData } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receipts[0].file_path, 3600);
        if (signedData?.signedUrl) {
          setReceiptUrl(signedData.signedUrl);
        }
      }
      setLoading(false);
    });
  }, [id]);

  const handleSubmitForReimbursement = async () => {
    if (!expense || !user) return;
    await supabase.from('expenses').update({ status: 'submitted' } as any).eq('id', expense.id);
    await supabase.from('audit_logs').insert({
      expense_id: expense.id, user_id: user.id, action: 'submitted', details: {},
    } as any);
    toast({ title: 'Sent for Reimbursement', description: 'Your bill is now pending approval.' });
    navigate('/expenses');
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
    </div>
  );
  if (!expense) return (
    <div className="text-center py-20">
      <p className="text-destructive font-medium">Bill not found.</p>
      <Button asChild variant="ghost" className="mt-4"><Link to="/expenses">Back to All Bills</Link></Button>
    </div>
  );

  const invoiceNum = parseField(expense.description, 'Invoice');
  const paymentMethod = expense.cost_center || parseField(expense.description, 'Payment') || '—';
  const currentStep = getStatusStep(expense.status as ExpenseStatus);
  const isRejected = expense.status === 'rejected';
  const isInReimbursement = ['submitted', 'manager_approved', 'approved', 'reimbursed'].includes(expense.status);

  // Reimbursement view
  if (showReimburse || isInReimbursement) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-24">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => {
            if (showReimburse && !isInReimbursement) { setShowReimburse(false); return; }
            navigate('/expenses');
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Reimbursement</h1>
          <div className="ml-auto"><StatusBadge status={expense.status as ExpenseStatus} /></div>
        </div>

        {/* Status Flow */}
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
                          isActive ? 'bg-green-600 text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          <StepIcon className="h-4 w-4" />
                        </div>
                        <span className={`text-[10px] font-medium ${isCurrent ? 'text-primary' : isActive ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {step.label}
                        </span>
                      </div>
                      {i < STATUS_FLOW.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 rounded-full ${i < currentStep ? 'bg-green-600' : 'bg-muted'}`} />
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
                <p className="font-medium text-destructive">Bill Rejected</p>
                <p className="text-sm text-muted-foreground">Check the approval history below.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bill summary card */}
        <Card className="shadow-md border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bill Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={IndianRupee} label="Amount" value={`₹${Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
              <InfoRow icon={Store} label="Merchant" value={expense.merchant || '—'} />
              <InfoRow icon={Calendar} label="Date" value={new Date(expense.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
              <InfoRow icon={CreditCard} label="Payment" value={paymentMethod} />
            </div>
          </CardContent>
        </Card>

        {/* Approval History */}
        {approvals.length > 0 && (
          <Card className="shadow-md border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Approval History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvals.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30">
                  <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${a.action === 'approved' ? 'bg-green-600/20 text-green-500' : 'bg-destructive/20 text-destructive'}`}>
                    {a.action === 'approved' ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {a.level === 'manager' ? 'Manager' : 'Finance'} — <span className={a.action === 'approved' ? 'text-green-500' : 'text-destructive'}>{a.action}</span>
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

        {/* Activity Log */}
        {auditLogs.length > 0 && (
          <Card className="shadow-md border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity Log</CardTitle>
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

        {/* Submit for reimbursement if draft */}
        {expense.status === 'draft' && expense.user_id === user?.id && (
          <Button className="w-full min-h-[48px]" onClick={handleSubmitForReimbursement}>
            <Send className="h-4 w-4 mr-2" /> Send for Reimbursement
          </Button>
        )}
      </div>
    );
  }

  // ─── Default: E-Bill / Original Bill view ───
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate('/expenses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground truncate flex-1">{expense.merchant || expense.title}</h1>
        <StatusBadge status={expense.status as ExpenseStatus} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-secondary/50">
          <TabsTrigger value="ebill" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Receipt className="h-4 w-4 mr-1.5" /> E-Bill
          </TabsTrigger>
          <TabsTrigger value="original" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Eye className="h-4 w-4 mr-1.5" /> Original Bill
          </TabsTrigger>
        </TabsList>

        {/* ─── E-BILL TAB ─── */}
        <TabsContent value="ebill" className="mt-3 space-y-3">
          {/* Merchant & Core Info */}
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="pt-4 pb-4 space-y-3">
              <EBillRow icon={Store} label="Merchant" value={expense.merchant || '—'} />
              <EBillRow icon={Package} label="Category" value={expense.cost_center || '—'} />
              <EBillRow icon={Hash} label="Invoice Number" value={invoiceNum || '—'} />
              <EBillRow icon={Calendar} label="Date" value={new Date(expense.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
              <EBillRow icon={CreditCard} label="Payment Method" value={paymentMethod} />
            </CardContent>
          </Card>

          {/* Description / Notes */}
          {expense.description && (
            <Card className="border-0 bg-card/80 backdrop-blur">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Notes</p>
                <p className="text-sm text-foreground leading-relaxed">{expense.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Total */}
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="pt-4 pb-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-foreground">Total Amount</span>
                <span className="text-lg font-bold text-gold tabular-nums">
                  ₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ORIGINAL BILL TAB ─── */}
        <TabsContent value="original" className="mt-3">
          <Card className="border-0 bg-card/80 backdrop-blur overflow-hidden">
            <CardContent className="p-2">
              <div className="rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center min-h-[300px]">
                {receiptUrl ? (
                  receiptName.toLowerCase().endsWith('.pdf') ? (
                    <iframe src={receiptUrl} className="w-full h-[60vh] rounded" title="Bill PDF" />
                  ) : (
                    <img src={receiptUrl} alt="Original Bill" className="max-w-full max-h-[60vh] object-contain" />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 opacity-40" />
                    <p className="text-sm">No original bill attached</p>
                  </div>
                )}
              </div>
              {receiptName && (
                <div className="flex items-center gap-2 mt-3 px-2 pb-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate flex-1">{receiptName}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2 pt-2">
        <Button variant="outline" className="min-h-[44px] text-xs"
          onClick={() => navigate(`/expenses/new?mode=upload`)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button variant="outline" className="min-h-[44px] text-xs"
          onClick={() => toast({ title: 'Coming soon', description: 'Split bill feature is under development.' })}>
          <Users className="h-3.5 w-3.5 mr-1" /> Split
        </Button>
        <Button className="min-h-[44px] text-xs"
          onClick={() => setShowReimburse(true)}>
          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Reimburse
        </Button>
      </div>
    </div>
  );
}

function EBillRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-sm font-medium truncate ${value && value !== '—' ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
