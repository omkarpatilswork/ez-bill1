import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard, Building2, ArrowLeftRight, TrendingUp, Loader2, ScanLine, Calendar, IndianRupee, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

type DocType = 'credit_card_statement' | 'bank_statement' | 'bank_transaction' | 'trade';

interface FinDoc {
  id: string;
  doc_type: DocType;
  issuer: string;
  account_label: string;
  title: string;
  description: string;
  total_amount: number | null;
  min_due: number | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  statement_date: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  total_credits: number | null;
  total_debits: number | null;
  txn_date: string | null;
  txn_type: string | null;
  counterparty: string | null;
  reference_number: string | null;
  trade_symbol: string | null;
  trade_side: string | null;
  trade_quantity: number | null;
  trade_price: number | null;
  trade_value: number | null;
  trade_date: string | null;
  broker: string | null;
  email_subject: string;
  email_from: string;
  email_date: string | null;
  status: string;
  created_at: string;
}

const TAB_META: Record<DocType, { label: string; icon: any; emptyTitle: string; emptyDesc: string }> = {
  credit_card_statement: { label: 'Credit Cards', icon: CreditCard, emptyTitle: 'No credit card statements yet', emptyDesc: 'Run a scan to pick up CC statements from your inbox.' },
  bank_statement: { label: 'Bank Statements', icon: Building2, emptyTitle: 'No bank statements yet', emptyDesc: 'Monthly account statements will land here once detected.' },
  bank_transaction: { label: 'Transactions', icon: ArrowLeftRight, emptyTitle: 'No bank transactions yet', emptyDesc: 'UPI / debit / credit alerts from banks will show up here.' },
  trade: { label: 'Trades', icon: TrendingUp, emptyTitle: 'No trades yet', emptyDesc: 'Stock/ETF trades from your broker will appear here.' },
};

function fmtMoney(n: number | null | undefined) {
  if (n == null) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

export default function FinancialDocs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<DocType>('credit_card_statement');
  const [docs, setDocs] = useState<FinDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financial_documents' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('email_date', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    } else {
      setDocs((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const runScan = async () => {
    if (!user) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-financial-scan', {
        body: { days: 90, max_results: 100 },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const by = data?.by_type || {};
      toast({
        title: 'Inbox scan complete',
        description: `Saved ${data?.saved ?? 0} document(s) — CC: ${by.credit_card_statement || 0}, Bank: ${by.bank_statement || 0}, Txns: ${by.bank_transaction || 0}, Trades: ${by.trade || 0}. Skipped ${data?.skipped_dupe ?? 0} duplicate(s).`,
      });
      await load();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/not connected|reconnect/i.test(msg)) {
        toast({ title: 'Connect Gmail first', description: 'Head to Import Bills to connect your Gmail.', variant: 'destructive' });
        navigate('/email-bills');
      } else {
        toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setScanning(false);
    }
  };

  const counts = docs.reduce((acc, d) => { acc[d.doc_type] = (acc[d.doc_type] || 0) + 1; return acc; }, {} as Record<string, number>);
  const filtered = docs.filter(d => d.doc_type === tab);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Financial Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Credit card statements, bank statements, transaction alerts, and stock trades — auto-detected from Gmail.
          </p>
        </div>
        <Button onClick={runScan} disabled={scanning} className="gap-2">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          {scanning ? 'Scanning inbox…' : 'Scan Inbox'}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DocType)}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full glass-card rounded-xl p-1 h-auto">
          {(Object.keys(TAB_META) as DocType[]).map((k) => {
            const m = TAB_META[k]; const Icon = m.icon;
            return (
              <TabsTrigger key={k} value={k} className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg py-2.5">
                <Icon className="h-4 w-4" />
                <span className="text-xs sm:text-sm">{m.label}</span>
                {counts[k] > 0 && <Badge variant="secondary" className="ml-1">{counts[k]}</Badge>}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(TAB_META) as DocType[]).map((k) => (
          <TabsContent key={k} value={k} className="space-y-3 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="glass-card rounded-2xl p-10 text-center">
                <p className="text-foreground font-medium">{TAB_META[k].emptyTitle}</p>
                <p className="text-sm text-muted-foreground mt-1">{TAB_META[k].emptyDesc}</p>
              </div>
            ) : (
              filtered.map((d) => <DocCard key={d.id} doc={d} />)
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function DocCard({ doc }: { doc: FinDoc }) {
  if (doc.doc_type === 'credit_card_statement') {
    return (
      <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{doc.issuer || 'Credit Card'}{doc.account_label ? ` ····${doc.account_label}` : ''}</p>
              <p className="text-xs text-muted-foreground truncate">{doc.email_subject}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-gold">{fmtMoney(doc.total_amount)}</p>
            <p className="text-[10px] text-muted-foreground">Total Due</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border/30">
          <div><p className="text-muted-foreground">Min Due</p><p className="font-medium text-foreground">{fmtMoney(doc.min_due)}</p></div>
          <div><p className="text-muted-foreground">Due Date</p><p className="font-medium text-foreground">{fmtDate(doc.due_date)}</p></div>
          <div><p className="text-muted-foreground">Period</p><p className="font-medium text-foreground">{doc.period_end ? fmtDate(doc.period_end) : fmtDate(doc.statement_date)}</p></div>
        </div>
      </div>
    );
  }
  if (doc.doc_type === 'bank_statement') {
    return (
      <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{doc.issuer || 'Bank'}</p>
              <p className="text-xs text-muted-foreground truncate">{fmtDate(doc.period_start)} — {fmtDate(doc.period_end)}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-foreground">{fmtMoney(doc.closing_balance)}</p>
            <p className="text-[10px] text-muted-foreground">Closing Balance</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border/30">
          <div><p className="text-muted-foreground">Opening</p><p className="font-medium text-foreground">{fmtMoney(doc.opening_balance)}</p></div>
          <div><p className="text-muted-foreground">Credits</p><p className="font-medium text-emerald-400">{fmtMoney(doc.total_credits)}</p></div>
          <div><p className="text-muted-foreground">Debits</p><p className="font-medium text-red-400">{fmtMoney(doc.total_debits)}</p></div>
        </div>
      </div>
    );
  }
  if (doc.doc_type === 'bank_transaction') {
    const isDebit = doc.txn_type === 'debit';
    return (
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isDebit ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
            {isDebit ? <ArrowUpRight className="h-5 w-5 text-red-400" /> : <ArrowDownLeft className="h-5 w-5 text-emerald-400" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{doc.counterparty || doc.issuer || 'Transaction'}</p>
            <p className="text-xs text-muted-foreground truncate"><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(doc.txn_date)} · {doc.issuer}</p>
          </div>
        </div>
        <p className={`font-bold shrink-0 ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>{isDebit ? '-' : '+'}{fmtMoney(doc.total_amount)}</p>
      </div>
    );
  }
  // trade
  const isBuy = (doc.trade_side || '').toLowerCase() === 'buy';
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isBuy ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
          <TrendingUp className={`h-5 w-5 ${isBuy ? 'text-emerald-400' : 'text-red-400'}`} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            <span className={isBuy ? 'text-emerald-400' : 'text-red-400'}>{(doc.trade_side || '').toUpperCase()}</span> {doc.trade_symbol || '—'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{doc.broker || doc.issuer} · {fmtDate(doc.trade_date)}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-foreground">{fmtMoney(doc.trade_value)}</p>
        <p className="text-[10px] text-muted-foreground">{doc.trade_quantity ?? '—'} × {fmtMoney(doc.trade_price)}</p>
      </div>
    </div>
  );
}