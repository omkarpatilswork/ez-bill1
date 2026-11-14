import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import SEO from '@/components/SEO';
import DisplayAmount from '@/components/next/DisplayAmount';
import { EmptyState, ScreenHeader, Sheet } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useBills } from '@/hooks/useBills';
import { useSplitLedger } from '@/hooks/useSplitLedger';
import { formatAmount } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import { shortDate } from '@/lib/dates';
import { friendBalances, initialsOf, totalOwed } from '@/lib/split-balances';

/** Splits: what friends still owe you, friend by friend. */
export default function Splits() {
  const { profile } = useAuth();
  const ledger = useSplitLedger();
  const { bills } = useBills();
  const [picking, setPicking] = useState(false);
  const symbol = getCurrencySymbol(profile?.default_currency || 'INR');

  const balances = useMemo(() => friendBalances(ledger.data?.splits ?? [], ledger.data?.payments ?? []), [ledger.data]);
  const owed = totalOwed(balances);
  const owing = balances.filter((b) => b.owes > 0).length;
  const splitBillIds = useMemo(() => new Set((ledger.data?.splits ?? []).map((s) => s.expense_id)), [ledger.data]);

  return (
    <>
      <SEO title="Splits" description="What friends still owe you for bills you split." path="/splits" />
      <div className="max-w-[860px]">
        <ScreenHeader title="Splits">
          {balances.length > 0 && <button type="button" className="ez-btn ez-btn--primary" onClick={() => setPicking(true)}><Plus className="h-4 w-4" strokeWidth={2.25} /> Split a bill</button>}
        </ScreenHeader>

        {ledger.isError ? (
          <EmptyState title="Your splits did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => ledger.refetch()}>Try again</button>
          </EmptyState>
        ) : !ledger.isSuccess ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-[18px] bg-surface-2" />)}</div>
        ) : balances.length === 0 ? (
          <EmptyState title="Nothing split yet." body="Pick a bill, say who shared it, and EZZ BILL keeps track of who has paid you back.">
            <button type="button" className="ez-btn ez-btn--primary" onClick={() => setPicking(true)}><Plus className="h-4 w-4" strokeWidth={2.25} /> Split a bill</button>
          </EmptyState>
        ) : (
          <>
            <section className="mt-8">
              <p className="ez-label">{owed > 0 ? 'Owed to you' : 'All settled'}</p>
              <DisplayAmount amount={owed} symbol={symbol} className="mt-5 text-[56px] lg:mt-6 lg:text-[72px]" />
              <p className="mt-2 text-[14.5px] text-dim">{owed > 0 ? `By ${owing} ${owing === 1 ? 'friend' : 'friends'}.` : 'Nobody owes you anything.'}</p>
            </section>

            <section className="mt-9">
              <h2 className="ez-label !text-dim">Friends</h2>
              <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
                {balances.map((b) => (
                  <li key={b.key}>
                    <Link to={`/splits/friend/${encodeURIComponent(b.key)}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-3 lg:px-5">
                      <span className="ez-num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-3 text-[13px] font-medium text-dim" aria-hidden="true">{initialsOf(b.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-semibold leading-snug text-fg">{b.name}</span>
                        <span className="block text-[13.5px] text-dim">{b.bills} {b.bills === 1 ? 'bill' : 'bills'} shared</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {b.owes > 0 ? <><span className="ez-num block text-[15px] text-fg">{formatAmount(b.owes, { symbol })}</span><span className="block text-[12px] text-faint">owes you</span></>
                          : <span className="ez-num block text-[13px] text-faint">settled</span>}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      <Sheet open={picking} onOpenChange={setPicking} label="Split a bill" title="Which bill?">
        {bills.length === 0 ? <p className="text-[15px] text-dim">Add a bill first, then split it.</p> : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-[18px] border border-line-soft bg-surface">
            {bills.slice(0, 30).map((bill) => (
              <li key={bill.id}>
                <Link to={`/expenses/${bill.id}/split`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-surface-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold leading-tight text-fg">{bill.merchant || bill.title}</span>
                    <span className="block text-[13px] text-dim">{shortDate(bill.expense_date)}{splitBillIds.has(bill.id) && ' · already split'}</span>
                  </span>
                  <span className="ez-num shrink-0 text-[14.5px] text-fg">{formatAmount(Number(bill.amount), { symbol: getCurrencySymbol(bill.currency || 'INR') })}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
