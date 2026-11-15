import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import SEO from '@/components/SEO';
import { EmptyState, ScreenHeader } from '@/components/next/Sheet';
import { useBills } from '@/hooks/useBills';
import { shortDate } from '@/lib/dates';

/** Smart Support, by shop: pick one to get help with your latest bill from it. */
export default function SupportIndex() {
  const { bills, ready, isError, refetch } = useBills();
  const [q, setQ] = useState('');

  const shops = useMemo(() => {
    const byShop = new Map<string, { name: string; latestId: string; latestDate: string; count: number }>();
    for (const b of bills) { // newest first
      const name = (b.merchant || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const seen = byShop.get(key);
      if (seen) seen.count += 1; else byShop.set(key, { name, latestId: b.id, latestDate: b.expense_date, count: 1 });
    }
    const needle = q.trim().toLowerCase();
    return [...byShop.values()].filter((s) => !needle || s.name.toLowerCase().includes(needle));
  }, [bills, q]);

  return (
    <>
      <SEO title="Smart Support" description="Help with a bill, shop by shop." path="/support" />
      <div className="max-w-[760px] pb-8">
        <ScreenHeader title="Smart Support" summary="Pick a shop to get help with your latest bill from it." />
        {isError ? (
          <EmptyState title="Your bills did not load." body="Check your connection, then try again."><button type="button" className="ez-btn ez-btn--ghost" onClick={() => refetch()}>Try again</button></EmptyState>
        ) : !ready ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="h-[66px] rounded-[18px] bg-surface-2" />)}</div>
        ) : bills.length === 0 ? (
          <EmptyState title="No bills yet." body="Add a bill and its shop shows up here." />
        ) : (
          <>
            <label className="mt-7 flex h-12 items-center gap-3 rounded-full border border-line-soft bg-surface-2 px-4 focus-within:border-brand">
              <Search className="h-[18px] w-[18px] shrink-0 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a shop" aria-label="Find a shop" className="min-w-0 flex-1 bg-transparent text-[15.5px] text-fg outline-none placeholder:text-faint" />
            </label>
            {shops.length === 0 ? <p className="mt-10 text-center text-[15px] text-dim">No shop by that name in your bills.</p> : (
              <ul className="ez-card mt-4 divide-y divide-line-soft overflow-hidden">
                {shops.map((s) => (
                  <li key={s.latestId}>
                    <Link to={`/expenses/${s.latestId}/support`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-3 lg:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-semibold leading-snug text-fg">{s.name}</span>
                        <span className="block text-[13.5px] text-dim">{s.count} {s.count === 1 ? 'bill' : 'bills'} · latest {shortDate(s.latestDate)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
