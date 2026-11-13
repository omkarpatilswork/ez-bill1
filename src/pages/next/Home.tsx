import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, Repeat, RotateCcw, ShieldCheck, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBills, type Bill } from '@/hooks/useBills';
import { useCapture } from '@/components/next/capture-context';
import BillListRow from '@/components/next/BillListRow';
import DisplayAmount from '@/components/next/DisplayAmount';
import Slip from '@/components/next/Slip';
import SEO from '@/components/SEO';
import { billCategory, type BroadCategory } from '@/lib/bill-category';
import { formatAmount, parseBillDescription, SOURCE_LABEL } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import { computeLeaks, leakGrade, type MoneyProfile } from '@/lib/leak-engine';
import { listReminders, reminderEndDate } from '@/lib/return-reminders';
import { cn } from '@/lib/utils';

const DAY = 24 * 60 * 60 * 1000;
const RECENT_COUNT = 8;

/** YYYY-MM-DD in the person's own timezone. */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A bill date is a calendar day, not an instant: read it as local midnight. */
const billDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysUntil = (target: Date, now: Date) => Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / DAY);
const shortDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const inDays = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

function dayLabel(key: string, now: Date) {
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(new Date(now.getTime() - DAY))) return 'Yesterday';
  return billDay(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* Emerald is the one accent, so the category bar is one hue at four strengths. */
const SHARE_TONES = ['bg-brand', 'bg-brand/60', 'bg-brand/[.36]', 'bg-brand/20'];

interface Nudge {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  to: string;
  due: number;
}

export default function Home() {
  const { user, profile } = useAuth();
  const now = useMemo(() => new Date(), []);

  const billsQuery = useBills();
  const { bills } = billsQuery;

  const subsQuery = useQuery({
    queryKey: ['subscriptions-due', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('detected_subscriptions')
        .select('id, service_name, last_amount, currency, next_billing_date, email_status, user_confirmed_status')
        .eq('user_id', user!.id)
        .not('next_billing_date', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const warrantiesQuery = useQuery({
    queryKey: ['warranties-ending', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('warranties')
        .select('id, product_name, retailer, expiry_date')
        .eq('user_id', user!.id)
        .not('expiry_date', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const spend = useMemo(() => {
    const from = startOfDay(new Date(now.getTime() - 30 * DAY));
    const before = startOfDay(new Date(now.getTime() - 60 * DAY));
    const last30 = bills.filter((b) => billDay(b.expense_date) >= from);
    const prev30 = bills.filter((b) => { const d = billDay(b.expense_date); return d >= before && d < from; });
    const total = last30.reduce((s, b) => s + Number(b.amount), 0);
    const prevTotal = prev30.reduce((s, b) => s + Number(b.amount), 0);
    const change = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

    const byCategory = new Map<BroadCategory, number>();
    for (const b of last30) byCategory.set(billCategory(b), (byCategory.get(billCategory(b)) || 0) + Number(b.amount));
    const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 4).map(([name, amount]) => ({ name: name as string, amount }));
    const rest = ranked.slice(4).reduce((s, [, amount]) => s + amount, 0);
    return { total, change, count: last30.length, shares: rest > 0 ? [...top, { name: 'Everything else', amount: rest }] : top };
  }, [bills, now]);

  const latest = bills[0];
  const recent = useMemo(() => {
    const groups: { key: string; bills: Bill[] }[] = [];
    for (const b of bills.slice(1, 1 + RECENT_COUNT)) {
      const key = b.expense_date.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.bills.push(b); else groups.push({ key, bills: [b] });
    }
    return groups;
  }, [bills]);

  const nudges = useMemo(() => {
    const list: Nudge[] = [];
    for (const s of subsQuery.data ?? []) {
      const active = s.user_confirmed_status === 'subscribed' || (s.email_status === 'active' && s.user_confirmed_status !== 'unsubscribed');
      if (!active || !s.next_billing_date) continue;
      const due = daysUntil(billDay(s.next_billing_date), now);
      if (due < 0 || due > 7) continue;
      const amount = s.last_amount ? `${formatAmount(Number(s.last_amount), { paise: false, symbol: getCurrencySymbol(s.currency || 'INR') })} on ` : '';
      list.push({ key: `sub-${s.id}`, icon: Repeat, title: `${s.service_name} renews ${inDays(due)}`, detail: `${amount}${shortDate(billDay(s.next_billing_date))}`, to: '/subscriptions', due });
    }
    for (const r of listReminders()) {
      const end = reminderEndDate(r);
      const due = daysUntil(end, now);
      if (due < 0 || due > 7) continue;
      list.push({ key: `return-${r.expense_id}`, icon: RotateCcw, title: `Return window closes ${inDays(due)}`, detail: `${r.merchant} · until ${shortDate(end)}`, to: `/expenses/${r.expense_id}`, due });
    }
    for (const w of warrantiesQuery.data ?? []) {
      if (!w.expiry_date) continue;
      const due = daysUntil(billDay(w.expiry_date), now);
      if (due < 0 || due > 30) continue;
      list.push({ key: `warranty-${w.id}`, icon: ShieldCheck, title: `Warranty ends ${inDays(due)}`, detail: `${w.product_name}${w.retailer ? ` · ${w.retailer}` : ''}`, to: '/warranties', due });
    }
    return list.sort((a, b) => a.due - b.due);
  }, [subsQuery.data, warrantiesQuery.data, now]);

  const leaks = useMemo(() => {
    const p = profile as unknown as (MoneyProfile & Record<string, unknown>) | null;
    if (!p?.money_profile_completed || !p.income_range) return null;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lite = (b: Bill) => ({
      amount: Number(b.amount), expense_date: b.expense_date, created_at: b.created_at,
      category_name: b.expense_categories?.name, merchant: b.merchant, cost_center: b.cost_center,
    });
    // Fed exactly as the Money Leaks page feeds it, so both show the same number.
    const thisMonth = bills.filter((b) => new Date(b.expense_date) >= monthStart).map(lite);
    const lastMonth = bills.filter((b) => { const d = new Date(b.expense_date); return d >= prevStart && d < monthStart; }).map(lite);
    return computeLeaks(thisMonth, lastMonth, p, monthStart);
  }, [bills, profile, now]);

  const monthName = now.toLocaleDateString('en-IN', { month: 'long' });

  return (
    <>
      <SEO title="Home" description="Every bill in one place, and where the money went." path="/" />

      {billsQuery.isError ? (
        <Notice title="Your bills did not load." body="Check your connection, then try again.">
          <button type="button" className="ez-btn ez-btn--ghost" onClick={() => billsQuery.refetch()}>Try again</button>
        </Notice>
      ) : billsQuery.isLoading || !user ? (
        <HomeSkeleton />
      ) : bills.length === 0 ? (
        <FirstBill />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_372px] lg:gap-x-16">
          {/* ---------- where the money went ---------- */}
          <section className="ez-rise pt-5 lg:col-start-1 lg:row-start-1 lg:pt-12" aria-labelledby="spend-label">
            <div className="flex items-center justify-between">
              <p id="spend-label" className="ez-label">Last 30 days</p>
              <Link to="/expenses" className="ez-num text-[12.5px] text-dim hover:text-fg">{spend.count} {spend.count === 1 ? 'bill' : 'bills'}</Link>
            </div>
            <p className="mt-4 lg:mt-5"><DisplayAmount amount={spend.total} className="text-[64px] text-fg lg:text-[92px]" /></p>
            {spend.change !== null && (
              <p className="mt-3 flex items-center gap-1.5 text-[14.5px] text-dim lg:mt-4">
                <span className={cn('ez-num inline-flex items-center gap-0.5', spend.change <= 0 ? 'text-brand-text' : 'text-fg')}>
                  {spend.change <= 0 ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                  {Math.abs(spend.change)}%
                </span>
                against the 30 days before
              </p>
            )}

            {spend.total > 0 && (
              <>
                <div className="mt-7 flex h-2.5 gap-[3px]" role="img"
                  aria-label={spend.shares.map((s) => `${s.name} ${Math.round((s.amount / spend.total) * 100)}%`).join(', ')}>
                  {spend.shares.map((s, i) => (
                    <span key={s.name} className={cn('h-full rounded-full', SHARE_TONES[i] ?? 'bg-line')} style={{ width: `${(s.amount / spend.total) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 lg:max-w-[560px]">
                  {spend.shares.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-2 text-[14px]">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', SHARE_TONES[i] ?? 'bg-line')} />
                      <span className="min-w-0 flex-1 truncate text-dim">{s.name}</span>
                      <span className="ez-num text-[13px] text-fg">{formatAmount(s.amount, { paise: false })}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* ---------- latest bill, what needs you, leaks ---------- */}
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-12">
            {latest && <LatestBill bill={latest} now={now} />}

            {nudges.length > 0 && (
              <section className="ez-rise mt-10" style={{ animationDelay: '.12s' }} aria-labelledby="needs-label">
                <p id="needs-label" className="ez-label">Needs you</p>
                <ul className="ez-card mt-4 divide-y divide-line-soft overflow-hidden">
                  {nudges.slice(0, 3).map((n) => (
                    <li key={n.key}>
                      <Link to={n.to} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-3">
                        <n.icon className="h-[18px] w-[18px] shrink-0 text-brand-text" strokeWidth={1.75} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold leading-snug text-fg">{n.title}</span>
                          <span className="block truncate text-[13px] text-dim">{n.detail}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="ez-rise mt-10" style={{ animationDelay: '.18s' }} aria-labelledby="leaks-label">
              <div className="ez-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p id="leaks-label" className="ez-label">Money Leaks · {monthName}</p>
                  {leaks && (
                    <span className="ez-num rounded-full border border-line px-2.5 py-1 text-[11.5px] text-dim">Leak Score {leaks.leakScore}</span>
                  )}
                </div>
                {leaks ? (
                  <>
                    <p className="mt-5"><DisplayAmount amount={leaks.totalLeak} className={cn('text-[46px]', leaks.totalLeak > 0 ? 'text-leak' : 'text-fg')} /></p>
                    <p className="mt-2.5 text-[14.5px] text-dim">{leakLine(leaks)}</p>
                  </>
                ) : (
                  <>
                    <p className="ez-display mt-5 text-[28px] leading-[1.1] text-fg">Six questions set your plan.</p>
                    <p className="mt-2.5 text-[14.5px] text-dim">Then every bill is checked against it, and you see what leaked.</p>
                  </>
                )}
                <Link to="/money-leaks" className="ez-btn ez-btn--ghost ez-btn--sm mt-5">
                  {leaks ? 'See the leaks' : 'Set up Money Leaks'} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          </div>

          {/* ---------- recent bills ---------- */}
          {recent.length > 0 && (
            <section className="ez-rise mt-11 lg:col-start-1 lg:row-start-2 lg:mt-14" style={{ animationDelay: '.08s' }} aria-labelledby="recent-label">
              <div className="flex items-center justify-between">
                <p id="recent-label" className="ez-label">Earlier</p>
                <Link to="/expenses" className="flex items-center gap-1 text-[13.5px] font-medium text-dim hover:text-fg">All bills <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              {recent.map((g) => (
                <div key={g.key} className="mt-5">
                  <p className="ez-label ez-label--quiet text-[11px]">{dayLabel(g.key, now)}</p>
                  <div className="mt-1.5">{g.bills.map((b) => <BillListRow key={b.id} bill={b} />)}</div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function leakLine(leaks: NonNullable<ReturnType<typeof computeLeaks>>) {
  if (leaks.totalLeak <= 0) return `Nothing over plan so far. ${leakGrade(leaks.leakScore).label}.`;
  const top = leaks.perCategory[0];
  const over = `${top.category} is ${formatAmount(top.leak, { paise: false })} over plan`;
  return top.topMerchant ? `leaked so far. ${over}, mostly ${top.topMerchant}.` : `leaked so far. ${over}.`;
}

function LatestBill({ bill, now }: { bill: Bill; now: Date }) {
  const parsed = parseBillDescription(bill.description);
  const added = new Date(bill.created_at);
  const time = added.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const when = dayKey(added) === dayKey(now) ? `Today ${time}` : shortDate(billDay(bill.expense_date));
  const source = SOURCE_LABEL[parsed.source];
  return (
    <section className="mt-10 lg:mt-0" aria-labelledby="latest-label">
      <div className="flex items-baseline justify-between gap-3">
        <p id="latest-label" className="ez-label">Latest bill</p>
        <p className="ez-num truncate text-[12.5px] text-dim">{when}{source && ` · ${source}`}</p>
      </div>
      <Link to={`/expenses/${bill.id}`} aria-label={`Open the bill from ${bill.merchant || bill.title}`}
        className="mx-auto mt-4 block max-w-[340px] transition-transform duration-300 ease-brand hover:-translate-y-1 lg:max-w-none">
        <Slip print merchant={bill.merchant || bill.title} sub={[parsed.address && parsed.address.length <= 28 ? parsed.address : null, parsed.table].filter(Boolean).join(' · ') || null}
          items={parsed.items} maxItems={3} total={Number(bill.amount)} symbol={getCurrencySymbol(bill.currency || 'INR')}
          foot={parsed.payment || bill.cost_center ? `Paid via ${parsed.payment || bill.cost_center}` : null} />
      </Link>
    </section>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pt-24 text-center">
      <h1 className="ez-display text-[34px] text-fg">{title}</h1>
      <p className="mt-3 text-dim">{body}</p>
      <div className="mt-7 flex justify-center">{children}</div>
    </div>
  );
}

function FirstBill() {
  const openCapture = useCapture();
  return (
    <Notice title="No bills yet." body="Scan a paper bill, upload a PDF, or connect Gmail. The first one shows up here.">
      <button type="button" className="ez-btn ez-btn--primary" onClick={openCapture}>Add a bill</button>
    </Notice>
  );
}

function HomeSkeleton() {
  return (
    <div className="pt-5 lg:pt-12" aria-busy="true" aria-label="Loading your bills">
      <div className="h-3 w-28 rounded-full bg-surface-3" />
      <div className="mt-5 h-16 w-64 rounded-2xl bg-surface-2 lg:h-24 lg:w-96" />
      <div className="mt-8 h-2.5 w-full max-w-[640px] rounded-full bg-surface-2" />
      <div className="mt-12 space-y-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 w-full max-w-[640px] rounded-2xl bg-surface-2" />)}
      </div>
    </div>
  );
}
