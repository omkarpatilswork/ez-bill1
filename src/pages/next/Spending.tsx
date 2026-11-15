import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import DisplayAmount from '@/components/next/DisplayAmount';
import { CATEGORY_ICON } from '@/components/next/category-icon';
import SEO from '@/components/SEO';
import { useAuth } from '@/hooks/useAuth';
import { useBills, type Bill } from '@/hooks/useBills';
import { billCategory, type BroadCategory } from '@/lib/bill-category';
import { formatAmount, parseBillDescription } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import { homeCurrency, inCurrency, othersNote } from '@/lib/currency';
import { cn } from '@/lib/utils';

type PeriodKey = 'this-month' | 'last-month' | '3-months' | 'year' | 'all';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '3-months', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

const billDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** [from, to) for a period, and the same-length stretch just before it for comparison. */
function rangeOf(period: PeriodKey, now: Date): { from: Date | null; to: Date; before: [Date, Date] | null } {
  const y = now.getFullYear(), m = now.getMonth();
  const tomorrow = new Date(y, m, now.getDate() + 1);
  if (period === 'this-month') return { from: new Date(y, m, 1), to: tomorrow, before: [new Date(y, m - 1, 1), new Date(y, m - 1, now.getDate() + 1)] };
  if (period === 'last-month') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1), before: [new Date(y, m - 2, 1), new Date(y, m - 1, 1)] };
  if (period === '3-months') return { from: new Date(y, m - 2, 1), to: tomorrow, before: [new Date(y, m - 5, 1), new Date(y, m - 2, 1)] };
  if (period === 'year') return { from: new Date(y, 0, 1), to: tomorrow, before: [new Date(y - 1, 0, 1), new Date(y - 1, m, now.getDate() + 1)] };
  return { from: null, to: tomorrow, before: null };
}

const sum = (bills: Bill[]) => bills.reduce((s, b) => s + Number(b.amount), 0);
const TONES = ['bg-brand', 'bg-brand/70', 'bg-brand/50', 'bg-brand/[.36]', 'bg-brand/25'];
const MENU = 'ez-app w-52 rounded-2xl border-line bg-surface-2 p-1.5 text-fg shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)]';

export default function Spending() {
  const { profile } = useAuth();
  const billsQuery = useBills();
  const { bills } = billsQuery;
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<PeriodKey>('this-month');

  // Rupees and dollars cannot be added together, so the page speaks one currency.
  const currency = homeCurrency(profile);
  const symbol = getCurrencySymbol(currency);
  const { mine, others: otherCurrencies } = useMemo(() => inCurrency(bills, currency), [bills, currency]);

  const view = useMemo(() => {
    const { from, to, before } = rangeOf(period, now);
    const within = (b: Bill, a: Date | null, z: Date) => { const d = billDay(b.expense_date); return (!a || d >= a) && d < z; };
    const current = mine.filter((b) => within(b, from, to));
    const total = sum(current);
    const previous = before ? sum(mine.filter((b) => within(b, before[0], before[1]))) : 0;
    const change = before && previous > 0 ? Math.round(((total - previous) / previous) * 100) : null;

    const byCategory = new Map<BroadCategory, { total: number; count: number }>();
    const byMerchant = new Map<string, { name: string; total: number; count: number }>();
    let tax = 0, discount = 0, biggest: Bill | null = null;
    for (const b of current) {
      const amount = Number(b.amount);
      const c = billCategory(b);
      const cat = byCategory.get(c) ?? { total: 0, count: 0 };
      cat.total += amount; cat.count += 1; byCategory.set(c, cat);
      const name = (b.merchant || b.title || '').trim();
      if (name) {
        const key = name.toLowerCase();
        const mer = byMerchant.get(key) ?? { name, total: 0, count: 0 };
        mer.total += amount; mer.count += 1; byMerchant.set(key, mer);
      }
      const parsed = parseBillDescription(b.description);
      tax += parsed.tax || 0; discount += parsed.discount || 0;
      if (!biggest || amount > Number(biggest.amount)) biggest = b;
    }
    return {
      current, total, change,
      categories: [...byCategory.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
      merchants: [...byMerchant.values()].sort((a, b) => b.total - a.total).slice(0, 6),
      tax, discount, biggest: biggest as Bill | null,
    };
  }, [mine, period, now]);

  /* The last six months as bars, whatever period is chosen above. */
  const months = useMemo(() => {
    const out: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: monthKey(d), label: d.toLocaleDateString('en-IN', { month: 'short' }), total: 0 });
    }
    const index = new Map(out.map((m) => [m.key, m]));
    for (const b of mine) { const m = index.get(b.expense_date.slice(0, 7)); if (m) m.total += Number(b.amount); }
    return out;
  }, [mine, now]);
  const tallest = Math.max(1, ...months.map((m) => m.total));

  const periodLabel = PERIODS.find((p) => p.key === period)!.label;
  const money = (n: number) => formatAmount(n, { paise: false, symbol });

  return (
    <>
      <SEO title="Spending" description="Where the money went, by category, shop and month." path="/analytics" />
      <div className="max-w-[960px]">
        <header className="flex items-end justify-between gap-4 pt-6 lg:pt-9">
          <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Spending</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="mb-1 flex h-9 items-center gap-1.5 rounded-full border border-line-soft px-3.5 text-[13.5px] font-medium text-fg hover:border-line lg:mb-2.5">
                {periodLabel} <ChevronDown className="h-3.5 w-3.5 text-dim" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className={MENU}>
              {PERIODS.map((p) => (
                <DropdownMenuItem key={p.key} onSelect={() => setPeriod(p.key)}
                  className="cursor-pointer justify-between rounded-lg px-2.5 py-2 text-[14px] text-fg focus:bg-surface-3 focus:text-fg">
                  {p.label} {period === p.key && <Check className="h-4 w-4 text-brand-text" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {billsQuery.isError ? (
          <Empty title="Your bills did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => billsQuery.refetch()}>Try again</button>
          </Empty>
        ) : !billsQuery.ready ? (
          <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading">
            <div className="h-20 w-72 rounded-2xl bg-surface-2" />
            <div className="h-48 rounded-2xl bg-surface-2" />
          </div>
        ) : (
          <>
            {/* ---------- the number ---------- */}
            <section className="ez-rise mt-7" aria-label="Total">
              <p className="ez-label">{periodLabel}</p>
              <p className="mt-4"><DisplayAmount amount={view.total} symbol={symbol} className="text-[56px] text-fg lg:text-[76px]" /></p>
              <p className="mt-3 text-[14.5px] text-dim">
                <span className="ez-num text-fg">{view.current.length}</span> {view.current.length === 1 ? 'bill' : 'bills'}
                {view.current.length > 0 && <> · <span className="ez-num text-fg">{money(view.total / view.current.length)}</span> a bill</>}
                {view.change !== null && <> · <span className={cn('ez-num', view.change <= 0 ? 'text-brand-text' : 'text-fg')}>{view.change > 0 ? '+' : ''}{view.change}%</span> against the period before</>}
              </p>
              {otherCurrencies > 0 && (
                <p className="mt-2 text-[13px] text-faint">{othersNote(otherCurrencies)}</p>
              )}
            </section>

            {view.current.length === 0 ? (
              <Empty title="No bills in this period." body="Pick another period, or add a bill.">
                <button type="button" className="ez-btn ez-btn--ghost" onClick={() => setPeriod('all')}>Show all time</button>
              </Empty>
            ) : (
              <div className="mt-10 grid gap-x-14 gap-y-11 lg:grid-cols-2">
                {/* ---------- by category ---------- */}
                <section className="ez-rise" style={{ animationDelay: '.06s' }} aria-labelledby="cat-label">
                  <p id="cat-label" className="ez-label">By category</p>
                  <ul className="mt-5 space-y-4">
                    {view.categories.map((c, i) => {
                      const Icon = CATEGORY_ICON[c.name];
                      return (
                        <li key={c.name}>
                          <div className="flex items-center gap-3">
                            <Icon className="h-[17px] w-[17px] shrink-0 text-dim" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{c.name}</span>
                            <span className="ez-num text-[12.5px] text-faint">{Math.round((c.total / view.total) * 100)}%</span>
                            <span className="ez-num w-[84px] text-right text-[14.5px] text-fg">{money(c.total)}</span>
                          </div>
                          <div className="ml-[29px] mt-2 h-1.5 rounded-full bg-surface-3">
                            <div className={cn('h-full rounded-full', TONES[Math.min(i, TONES.length - 1)])} style={{ width: `${Math.max(2, (c.total / view.categories[0].total) * 100)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <div className="space-y-11">
                  {/* ---------- six months ---------- */}
                  <section className="ez-rise" style={{ animationDelay: '.12s' }} aria-labelledby="months-label">
                    <p id="months-label" className="ez-label">Six months</p>
                    <div className="mt-5 flex h-[150px] items-end gap-3" role="img" aria-label={months.map((m) => `${m.label} ${money(m.total)}`).join(', ')}>
                      {months.map((m, i) => (
                        <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                          <span className="ez-num text-[11px] text-faint">{m.total >= 1000 ? `${Math.round(m.total / 1000)}k` : Math.round(m.total)}</span>
                          <div className={cn('w-full rounded-t-md', i === months.length - 1 ? 'bg-brand' : 'bg-brand/30')} style={{ height: `${Math.max(2, (m.total / tallest) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-3">
                      {months.map((m) => <span key={m.key} className="ez-label ez-label--quiet flex-1 text-center text-[10.5px]">{m.label}</span>)}
                    </div>
                  </section>

                  {/* ---------- where it went ---------- */}
                  <section className="ez-rise" style={{ animationDelay: '.18s' }} aria-labelledby="shops-label">
                    <p id="shops-label" className="ez-label">Where it went</p>
                    <ul className="ez-card mt-4 divide-y divide-line-soft">
                      {view.merchants.map((m) => (
                        <li key={m.name}>
                          <Link to={`/expenses?q=${encodeURIComponent(m.name)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-semibold leading-snug text-fg">{m.name}</span>
                              <span className="block text-[13px] text-dim">{m.count} {m.count === 1 ? 'bill' : 'bills'}</span>
                            </span>
                            <span className="ez-num text-[14.5px] text-fg">{money(m.total)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* ---------- off the bills themselves ---------- */}
                  {(view.tax > 0 || view.discount > 0 || view.biggest) && (
                    <section className="ez-rise" style={{ animationDelay: '.24s' }} aria-labelledby="facts-label">
                      <p id="facts-label" className="ez-label">From the bills</p>
                      <dl className="ez-card mt-4 divide-y divide-line-soft px-4">
                        {view.biggest && <Fact label="Biggest bill" value={`${view.biggest.merchant || view.biggest.title} · ${money(Number(view.biggest.amount))}`} to={`/expenses/${view.biggest.id}`} />}
                        {view.tax > 0 && <Fact label="Tax printed on bills" value={money(view.tax)} />}
                        {view.discount > 0 && <Fact label="Discounts printed on bills" value={money(view.discount)} />}
                      </dl>
                    </section>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Fact({ label, value, to }: { label: string; value: string; to?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5">
      <dt className="shrink-0 text-[14px] text-dim">{label}</dt>
      <dd className="ez-num min-w-0 truncate text-right text-[13.5px] text-fg">
        {to ? <Link to={to} className="underline decoration-line underline-offset-4 hover:decoration-brand">{value}</Link> : value}
      </dd>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="ez-display text-[30px] text-fg">{title}</h2>
      <p className="mt-3 text-dim">{body}</p>
      <div className="mt-7 flex justify-center">{children}</div>
    </div>
  );
}
