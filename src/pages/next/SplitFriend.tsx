import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import SEO from '@/components/SEO';
import DisplayAmount from '@/components/next/DisplayAmount';
import { Confirm, EmptyState, Field, INPUT, Sheet } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useBills } from '@/hooks/useBills';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatAmount } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import { shortDate } from '@/lib/dates';
import { friendBalances, friendKey } from '@/lib/split-balances';
import { cn } from '@/lib/utils';
import { useSplitLedger } from '@/hooks/useSplitLedger';

/** One friend: what they still owe, the bills behind it, and what they have paid back. */
export default function SplitFriend() {
  const { friendKey: raw } = useParams<{ friendKey: string }>();
  const key = decodeURIComponent(raw || '');
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ledger = useSplitLedger();
  const { bills } = useBills();
  const [paying, setPaying] = useState(false);
  const [settling, setSettling] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const symbol = getCurrencySymbol(profile?.default_currency || 'INR');

  const view = useMemo(() => {
    const splits = (ledger.data?.splits ?? []).filter((s) => !s.is_self && friendKey(s) === key);
    const payments = (ledger.data?.payments ?? []).filter((p) => friendKey(p) === key);
    return { splits, payments, balance: friendBalances(splits, payments)[0] ?? null };
  }, [ledger.data, key]);
  const name = view.balance?.name || (key.startsWith('name:') ? key.slice(5) : 'Friend');
  const owes = view.balance?.owes ?? 0;
  const billName = (id: string) => { const b = bills.find((x) => x.id === id); return b ? b.merchant || b.title : 'A bill'; };

  const record = async (value: number, why: string, settleShares: boolean) => {
    if (!user || busy) return false;
    setBusy(true);
    const { error } = await supabase.from('split_payments').insert({
      user_id: user.id, friend_id: key.startsWith('name:') ? null : key, friend_name: name, amount: value, direction: 'received', note: why,
    } as never);
    if (!error && settleShares) await supabase.from('bill_splits').update({ status: 'settled' } as never).in('id', view.splits.map((s) => s.id));
    setBusy(false);
    if (error) { toast({ title: 'The payment was not recorded', description: 'Try again in a moment.', variant: 'destructive' }); return false; }
    queryClient.invalidateQueries({ queryKey: ['split-ledger', user.id] });
    return true;
  };

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    const value = Math.round(parseFloat(amount) * 100) / 100;
    if (!(value > 0)) { toast({ title: 'Enter the amount paid', variant: 'destructive' }); return; }
    if (await record(value, note.trim(), value >= owes)) {
      toast({ title: 'Payment recorded', description: `${name} · ${formatAmount(value, { symbol })}` });
      setPaying(false); setAmount(''); setNote('');
    }
  };

  const settle = async () => {
    if (await record(owes, 'Settled up', true)) { toast({ title: 'Settled up', description: name }); setSettling(false); }
  };

  return (
    <>
      <SEO title={name} description="What this friend owes you, and what they have paid back." path="/splits" />
      <div className="max-w-[760px]">
        <Link to="/splits" className="mt-5 inline-flex items-center gap-1 text-[14px] font-medium text-dim hover:text-fg lg:mt-8"><ChevronLeft className="h-4 w-4" /> Splits</Link>

        {ledger.isError ? (
          <EmptyState title="This did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => ledger.refetch()}>Try again</button>
          </EmptyState>
        ) : !ledger.isSuccess ? (
          <div className="mt-6 h-72 rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" />
        ) : !view.balance ? (
          <EmptyState title="Nothing split with this person." body="Split a bill with them and it shows up here." />
        ) : (
          <>
            <header className="mt-4">
              <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">{name}</h1>
              <p className="ez-label mt-6">{owes > 0 ? 'Owes you' : 'Settled up'}</p>
              <DisplayAmount amount={owes} symbol={symbol} className="mt-5 text-[56px] lg:mt-6 lg:text-[72px]" />
              <p className="mt-2 text-[14.5px] text-dim">
                <span className="ez-num">{formatAmount(view.balance.shared, { symbol })}</span> shared over {view.balance.bills} {view.balance.bills === 1 ? 'bill' : 'bills'}, <span className="ez-num">{formatAmount(view.balance.paid, { symbol })}</span> paid back.
              </p>
              {owes > 0 && (
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button type="button" className="ez-btn ez-btn--primary" onClick={() => setSettling(true)}>Settle up</button>
                  <button type="button" className="ez-btn ez-btn--ghost" onClick={() => { setAmount(''); setPaying(true); }}>Record a part payment</button>
                </div>
              )}
            </header>

            <section className="mt-10">
              <h2 className="ez-label !text-dim">Bills shared</h2>
              <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
                {view.splits.map((s) => (
                  <li key={s.id}>
                    <Link to={`/expenses/${s.expense_id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-3 lg:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] font-semibold leading-snug text-fg">{billName(s.expense_id)}</span>
                        <span className="block text-[13.5px] text-dim">Split on {shortDate(s.created_at)}</span>
                      </span>
                      <span className="ez-num shrink-0 text-[15px] text-fg">{formatAmount(Number(s.amount), { symbol, paise: true })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {view.payments.length > 0 && (
              <section className="mt-9">
                <h2 className="ez-label !text-dim">Paid back</h2>
                <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
                  {view.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-4 px-4 py-3.5 lg:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-semibold leading-snug text-fg">{shortDate(p.paid_at)}</span>
                        {p.note && <span className="block truncate text-[13.5px] text-dim">{p.note}</span>}
                      </span>
                      <span className="ez-num shrink-0 text-[15px] text-brand-text">+{formatAmount(Number(p.amount), { symbol, paise: true })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <Sheet open={paying} onOpenChange={setPaying} label={name} title="Record a payment">
        <form onSubmit={pay} className="space-y-4">
          <Field id="p-amount" label="Amount paid" hint={`Still owed: ${formatAmount(owes, { symbol, paise: true })}`}>
            <input id="p-amount" type="number" min="0" step="0.01" inputMode="decimal" autoFocus className={cn(INPUT, 'ez-num')} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="p-note" label="Note"><input id="p-note" className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI" /></Field>
          <div className="flex justify-end pt-1"><button type="submit" disabled={busy} className="ez-btn ez-btn--primary disabled:opacity-50">{busy ? 'Saving' : 'Record payment'}</button></div>
        </form>
      </Sheet>

      <Confirm open={settling} onOpenChange={setSettling} title="Settle up?" busy={busy} action="Settle up" onConfirm={settle}
        body={<>This records that {name} paid you {formatAmount(owes, { symbol, paise: true })}, the whole amount still owed.</>} />
    </>
  );
}
