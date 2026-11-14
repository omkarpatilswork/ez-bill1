import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import SEO from '@/components/SEO';
import { EmptyState, ScreenHeader } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { daysUntil, shortDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

type Kind = 'credit_card_statement' | 'bank_statement' | 'bank_transaction' | 'trade';

interface Doc {
  id: string;
  doc_type: Kind;
  issuer: string | null;
  account_label: string | null;
  total_amount: number | null;
  min_due: number | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  statement_date: string | null;
  closing_balance: number | null;
  total_credits: number | null;
  total_debits: number | null;
  txn_date: string | null;
  txn_type: string | null;
  counterparty: string | null;
  trade_symbol: string | null;
  trade_side: string | null;
  trade_quantity: number | null;
  trade_price: number | null;
  trade_value: number | null;
  trade_date: string | null;
  broker: string | null;
  email_date: string | null;
}

const KINDS: { key: Kind; label: string; amount: string }[] = [
  { key: 'credit_card_statement', label: 'Card statements', amount: 'total due' },
  { key: 'bank_statement', label: 'Bank statements', amount: 'closing balance' },
  { key: 'bank_transaction', label: 'Transactions', amount: '' },
  { key: 'trade', label: 'Trades', amount: '' },
];

// These documents carry no currency of their own; the banks and brokers read today are Indian.
const money = (n: number | null | undefined) => {
  if (n == null) return 'not stated';
  const value = Number(n);
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

/** Documents: statements, bank alerts and trade notes found in Gmail, newest first. */
export default function Documents() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Kind | null>(null);
  const [searching, setSearching] = useState(false);

  const query = useQuery({
    queryKey: ['documents', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('financial_documents' as never).select('*').eq('user_id', user!.id).order('email_date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Doc[];
    },
  });
  const docs = useMemo(() => query.data ?? [], [query.data]);
  const counts = useMemo(() => docs.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.doc_type]: (acc[d.doc_type] || 0) + 1 }), {}), [docs]);
  const kind = picked ?? KINDS.find((k) => counts[k.key])?.key ?? 'credit_card_statement';
  const shown = docs.filter((d) => d.doc_type === kind);

  const searchGmail = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-financial-scan', { body: { days: 90, max_results: 100 } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const saved = data?.saved ?? 0;
      toast({ title: saved ? `${saved} ${saved === 1 ? 'document' : 'documents'} added from Gmail` : 'Nothing new in Gmail', description: 'The last 90 days of email were checked.' });
      queryClient.invalidateQueries({ queryKey: ['documents', user?.id] });
    } catch (e) {
      if (/not connected|reconnect/i.test(String((e as Error)?.message || ''))) {
        toast({ title: 'Gmail is not connected', description: 'Connect it first, then search again.' });
        navigate('/email-bills');
      } else {
        toast({ title: 'Gmail was not searched', description: 'Try again in a moment.', variant: 'destructive' });
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <SEO title="Documents" description="Card statements, bank statements, bank alerts and trade notes found in your email." path="/financial-docs" />
      <div className="max-w-[860px]">
        <ScreenHeader title="Documents" summary={docs.length > 0 ? 'Statements, bank alerts and trade notes found in your email.' : undefined}>
          <button type="button" className="ez-btn ez-btn--ghost" onClick={searchGmail} disabled={searching}><Mail className="h-4 w-4" /> {searching ? 'Searching Gmail' : 'Find in Gmail'}</button>
        </ScreenHeader>

        {query.isError ? (
          <EmptyState title="Your documents did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => query.refetch()}>Try again</button>
          </EmptyState>
        ) : !query.isSuccess ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-[18px] bg-surface-2" />)}</div>
        ) : docs.length === 0 ? (
          <EmptyState title="No documents yet." body="Search Gmail and EZZ BILL files your card statements, bank statements, bank alerts and trade notes here, with the amounts and due dates read out." />
        ) : (
          <>
            <div className="-mx-4 mt-7 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Kind of document">
              {KINDS.map((k) => (
                <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} onClick={() => setPicked(k.key)}
                  className={cn('shrink-0 rounded-full border px-4 py-2 text-[14px] font-medium', kind === k.key ? 'border-brand bg-brand/10 text-fg' : 'border-line-soft text-dim hover:border-line hover:text-fg')}>
                  {k.label} <span className="ez-num pl-1 text-[12.5px] text-faint">{counts[k.key] || 0}</span>
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="mt-10 text-center text-[15px] text-dim">None of these found in your email yet.</p>
            ) : (
              <ul className="ez-card mt-4 divide-y divide-line-soft overflow-hidden">
                {shown.map((d) => <li key={d.id} className="flex items-center gap-4 px-4 py-3.5 lg:px-5"><Row d={d} /></li>)}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Row({ d }: { d: Doc }) {
  const cell = (title: string, sub: React.ReactNode, amount: React.ReactNode, under: React.ReactNode) => (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-snug text-fg">{title}</span>
        <span className="block truncate text-[13.5px] text-dim">{sub}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="ez-num block text-[15px] text-fg">{amount}</span>
        <span className="ez-num block text-[12px] text-faint">{under}</span>
      </span>
    </>
  );

  if (d.doc_type === 'credit_card_statement') {
    const days = daysUntil(d.due_date);
    const due = days === null ? 'Due date not stated' : days < 0 ? `Was due ${shortDate(d.due_date)}` : days === 0 ? 'Due today' : (
      <>Due {shortDate(d.due_date, { year: false })}, <span className={cn('ez-num', days <= 7 && 'text-gilt')}>{days} {days === 1 ? 'day' : 'days'}</span></>
    );
    return cell(`${d.issuer || 'Credit card'}${d.account_label ? ` ··${d.account_label}` : ''}`, due, money(d.total_amount), d.min_due != null ? `min ${money(d.min_due)}` : 'total due');
  }
  if (d.doc_type === 'bank_statement') {
    const period = d.period_start && d.period_end ? `${shortDate(d.period_start, { year: false })} to ${shortDate(d.period_end)}` : shortDate(d.statement_date || d.email_date);
    return cell(`${d.issuer || 'Bank'}${d.account_label ? ` ··${d.account_label}` : ''}`,
      <>{period}{d.total_credits != null && <> · in <span className="ez-num">{money(d.total_credits)}</span></>}{d.total_debits != null && <> · out <span className="ez-num">{money(d.total_debits)}</span></>}</>,
      money(d.closing_balance), 'closing balance');
  }
  if (d.doc_type === 'bank_transaction') {
    const out = d.txn_type === 'debit';
    return cell(d.counterparty || d.issuer || 'Transaction', <>{shortDate(d.txn_date || d.email_date)}{d.issuer && ` · ${d.issuer}`}</>,
      <span className={out ? undefined : 'text-brand-text'}>{out ? '−' : '+'}{money(d.total_amount)}</span>, out ? 'paid out' : 'received');
  }
  const side = (d.trade_side || '').toLowerCase() === 'sell' ? 'Sold' : 'Bought';
  return cell(`${side} ${d.trade_symbol || 'a holding'}`, <>{shortDate(d.trade_date || d.email_date)}{(d.broker || d.issuer) && ` · ${d.broker || d.issuer}`}</>,
    money(d.trade_value), d.trade_quantity != null && d.trade_price != null ? `${d.trade_quantity} × ${money(d.trade_price)}` : '');
}
