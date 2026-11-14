import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import BillListRow from '@/components/next/BillListRow';
import DisplayAmount from '@/components/next/DisplayAmount';
import LeakAdvisor from '@/components/next/LeakAdvisor';
import MoneyProfileQuiz from '@/components/money-leaks/MoneyProfileQuiz';
import SEO from '@/components/SEO';
import { useAuth } from '@/hooks/useAuth';
import { useBills, type Bill } from '@/hooks/useBills';
import { useToast } from '@/hooks/use-toast';
import { formatAmount } from '@/lib/bill-format';
import {
  computeIdealBudget, computeLeaks, leakGrade, safeDailySpend, toLeakCategory,
  type LeakCategory, type MoneyProfile,
} from '@/lib/leak-engine';
import { detectSubscriptions } from '@/lib/subscription-engine';
import { cn } from '@/lib/utils';

const money = (n: number) => formatAmount(n, { paise: false });
const monthLabel = (d: Date) => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const shiftMonth = (d: Date, by: number) => new Date(d.getFullYear(), d.getMonth() + by, 1);
/** The same text the leak engine reads to decide a bill's category. */
const leakCategoryOf = (b: Bill): LeakCategory => toLeakCategory(`${b.expense_categories?.name || ''} ${b.merchant || ''} ${b.cost_center || ''}`);

const GOAL: Record<string, string> = { save: 'Save more', balanced: 'Balanced', lifestyle: 'Lifestyle first' };
const CITY: Record<string, string> = { tier_1: 'metro', tier_2: 'tier 2 city', tier_3: 'tier 3 town' };
const LIVING: Record<string, string> = { family: 'with family', shared: 'sharing', alone: 'living alone' };

export default function MoneyLeaks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const billsQuery = useBills();
  const { bills } = billsQuery;

  const profileQuery = useQuery({
    queryKey: ['money-profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const row = profileQuery.data;
  const profile = useMemo<MoneyProfile | null>(() => (row ? {
    income_range: row.income_range as MoneyProfile['income_range'],
    age_group: row.age_group as MoneyProfile['age_group'],
    city_tier: row.city_tier as MoneyProfile['city_tier'],
    living_situation: row.living_situation as MoneyProfile['living_situation'],
    job_type: row.job_type as MoneyProfile['job_type'],
    financial_goal: row.financial_goal as MoneyProfile['financial_goal'],
    monthly_rent: row.monthly_rent,
    monthly_emi: row.monthly_emi,
    money_profile_completed: !!row.money_profile_completed,
  } : null), [row]);

  const thisMonth = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); }, []);
  const [month, setMonth] = useState(thisMonth);
  const isCurrent = month.getTime() === thisMonth.getTime();
  const [open, setOpen] = useState<LeakCategory | null>(null);

  const [balance, setBalance] = useState('');
  const [salaryDay, setSalaryDay] = useState('1');
  const [alerts, setAlerts] = useState(false);
  useEffect(() => {
    if (!row) return;
    if (row.survival_balance != null) setBalance(String(row.survival_balance));
    if (row.salary_day != null) setSalaryDay(String(row.salary_day));
    setAlerts(!!row.leak_alerts_enabled);
  }, [row]);

  const inMonth = useMemo(() => {
    const end = shiftMonth(month, 1), prev = shiftMonth(month, -1);
    const within = (b: Bill, a: Date, z: Date) => { const d = new Date(b.expense_date); return d >= a && d < z; };
    return { current: bills.filter((b) => within(b, month, end)), previous: bills.filter((b) => within(b, prev, month)) };
  }, [bills, month]);

  // Fed exactly as Home feeds it, so the two screens always show the same number.
  const leaks = useMemo(() => {
    if (!profile?.money_profile_completed) return null;
    const lite = (b: Bill) => ({
      amount: Number(b.amount), expense_date: b.expense_date, created_at: b.created_at,
      category_name: b.expense_categories?.name, merchant: b.merchant, cost_center: b.cost_center,
    });
    return computeLeaks(inMonth.current.map(lite), inMonth.previous.map(lite), profile, month);
  }, [inMonth, profile, month]);

  const plan = useMemo(() => (profile ? computeIdealBudget(profile) : null), [profile]);
  const subs = useMemo(() => detectSubscriptions(bills.map((b) => ({
    id: b.id, amount: Number(b.amount), expense_date: b.expense_date, merchant: b.merchant, title: b.title,
  }))), [bills]);

  const balanceNumber = Number(balance) || 0;
  const today = new Date().getDate();
  const payday = Math.min(28, Math.max(1, Number(salaryDay) || 1));
  const daysToPayday = today < payday ? payday - today : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - today + payday;
  const perDay = safeDailySpend(balanceNumber, daysToPayday);

  const saveField = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase.from('profiles').update(patch as never).eq('id', user.id);
  };

  const saveProfile = async (data: MoneyProfile) => {
    if (!user) return;
    const { error } = await supabase.from('profiles').upsert({
      id: user.id, income_range: data.income_range, age_group: data.age_group, city_tier: data.city_tier,
      living_situation: data.living_situation, job_type: data.job_type, financial_goal: data.financial_goal,
      monthly_rent: data.monthly_rent ?? null, monthly_emi: data.monthly_emi ?? null, money_profile_completed: true,
    } as never, { onConflict: 'id' });
    if (error) { toast({ title: 'Your answers were not saved', description: 'Check your connection and try again.', variant: 'destructive' }); return; }
    await queryClient.invalidateQueries({ queryKey: ['money-profile'] });
    toast({ title: 'Plan set', description: 'Every bill is now checked against it.' });
  };

  const toggleAlerts = async () => {
    const next = !alerts;
    if (next && typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* the browser said no */ } }
      if (Notification.permission === 'denied') {
        toast({ title: 'Notifications are blocked', description: 'Allow them for this site in your browser settings, then switch this on.', variant: 'destructive' });
        return;
      }
    }
    setAlerts(next);
    await saveField({ leak_alerts_enabled: next });
  };

  const share = () => {
    if (!leaks) return;
    const text = `Money Leaks, ${monthLabel(month)}\nLeaked: ${money(leaks.totalLeak)} (${leaks.leakPercent}% of spending)\nLeak Score: ${leaks.leakScore} of 100, ${leakGrade(leaks.leakScore).label}\nTracked with EZZ BILL`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard.writeText(text); toast({ title: 'Copied' }); }
  };

  const advisorContext = useMemo(() => {
    if (!leaks || !profile) return '';
    return [
      `User context for ${monthLabel(month)}:`,
      `Total spent ${money(leaks.totalActual)} vs plan ${money(leaks.totalIdeal)}, leak ${money(leaks.totalLeak)} (${leaks.leakPercent}%).`,
      `Leak score ${leaks.leakScore}/100 (${leakGrade(leaks.leakScore).label}). Goal: ${profile.financial_goal}.`,
      leaks.pacing ? `Projected month-end spend ${money(leaks.pacing.projectedMonthEnd)}.` : '',
      balanceNumber > 0 ? `Balance ${money(balanceNumber)}, safe daily spend ${money(perDay)} for ${daysToPayday} days until salary.` : '',
      'Categories:',
      ...leaks.perCategory.filter((c) => c.actual > 0).map((c) => `- ${c.category}: spent ${money(c.actual)} vs plan ${money(c.ideal)}${c.leak > 0 ? ` (leak ${money(c.leak)}, mostly ${c.topMerchant || 'various'})` : ''}`),
      leaks.patterns.length ? `Patterns: ${leaks.patterns.join(' | ')}` : '',
      'Format amounts in ₹ (Indian Rupees, never $). Use only the numbers given here and in the bills. Keep replies under 4 lines with specific numbers and one concrete action. No emoji.',
    ].filter(Boolean).join('\n');
  }, [leaks, profile, month, balanceNumber, perDay, daysToPayday]);

  const loading = !billsQuery.ready || profileQuery.isLoading;
  const failed = billsQuery.isError || profileQuery.isError;

  return (
    <>
      <SEO title="Money Leaks" description="What you spent over your plan this month, and where." path="/money-leaks" />
      <div className="max-w-[1000px]">
        <header className="flex items-end justify-between gap-4 pt-6 lg:pt-9">
          <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Money Leaks</h1>
          {leaks && (
            <div className="mb-1 flex items-center gap-1 lg:mb-2.5">
              <button type="button" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setOpen(null); }}
                className="grid h-9 w-9 place-items-center rounded-full border border-line-soft text-dim hover:border-line hover:text-fg"><ChevronLeft className="h-4 w-4" /></button>
              <span className="ez-num min-w-[118px] text-center text-[13px] text-fg">{monthLabel(month)}</span>
              <button type="button" aria-label="Next month" disabled={isCurrent} onClick={() => { setMonth(shiftMonth(month, 1)); setOpen(null); }}
                className="grid h-9 w-9 place-items-center rounded-full border border-line-soft text-dim hover:border-line hover:text-fg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              <button type="button" aria-label="Share this month" onClick={share}
                className="ml-1 grid h-9 w-9 place-items-center rounded-full border border-line-soft text-dim hover:border-line hover:text-fg"><Share2 className="h-4 w-4" /></button>
            </div>
          )}
        </header>

        {failed ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <h2 className="ez-display text-[30px] text-fg">This page did not load.</h2>
            <p className="mt-3 text-dim">Check your connection, then try again.</p>
            <button type="button" className="ez-btn ez-btn--ghost mt-7" onClick={() => { billsQuery.refetch(); profileQuery.refetch(); }}>Try again</button>
          </div>
        ) : loading ? (
          <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading">
            <div className="h-20 w-72 rounded-2xl bg-surface-2" />
            <div className="h-56 rounded-2xl bg-surface-2" />
          </div>
        ) : !leaks || !plan ? (
          /* ---------- no plan yet: six questions ---------- */
          <div className="mt-7 max-w-[560px]">
            <p className="ez-label">Set your plan</p>
            <p className="ez-display mt-4 text-[30px] leading-[1.1] text-fg">Six questions set your plan.</p>
            <p className="mt-3 text-[15px] text-dim">A leak is what you spend over that plan in a category. No plan, no number: nothing here is guessed.</p>
            <div className="mt-7"><MoneyProfileQuiz initial={profile || undefined} onSubmit={saveProfile} /></div>
          </div>
        ) : (
          <div className="mt-7 grid gap-x-14 gap-y-11 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              {/* ---------- the number ---------- */}
              <section className="ez-rise" aria-label="Leaked this month">
                <div className="flex items-center justify-between gap-3">
                  <p className="ez-label">Leaked in {month.toLocaleDateString('en-IN', { month: 'long' })}</p>
                  <span className="ez-num rounded-full border border-line px-2.5 py-1 text-[11.5px] text-dim">Leak Score {leaks.leakScore} · {leakGrade(leaks.leakScore).label}</span>
                </div>
                <p className="mt-4"><DisplayAmount amount={leaks.totalLeak} className={cn('text-[56px] lg:text-[76px]', leaks.totalLeak > 0 ? 'text-leak' : 'text-fg')} /></p>
                <p className="mt-3 text-[14.5px] text-dim">
                  {leaks.totalActual > 0
                    ? <>Spent <span className="ez-num text-fg">{money(leaks.totalActual)}</span> against a plan of <span className="ez-num text-fg">{money(leaks.totalIdeal)}</span>.</>
                    : 'No bills in this month yet.'}
                  {isCurrent && leaks.pacing && leaks.totalActual > 0 && <> On pace for <span className="ez-num text-fg">{money(leaks.pacing.projectedMonthEnd)}</span> by month end.</>}
                </p>
                <p className="mt-2 text-[13px] text-faint">
                  Plan: {[GOAL[profile?.financial_goal || ''], CITY[profile?.city_tier || ''], LIVING[profile?.living_situation || '']].filter(Boolean).join(', ').toLowerCase()}
                  {plan.fixed > 0 && <>, {money(plan.fixed)} fixed each month</>}.{' '}
                  <Link to="/settings" className="text-dim underline decoration-line underline-offset-4 hover:text-fg">Change</Link>
                </p>
              </section>

              {/* ---------- where ---------- */}
              <section className="ez-rise mt-10" style={{ animationDelay: '.06s' }} aria-labelledby="where-label">
                <p id="where-label" className="ez-label">Where</p>
                <ul className="mt-4 divide-y divide-line-soft border-y border-line-soft">
                  {leaks.perCategory.filter((c) => c.actual > 0).map((c) => {
                    const over = c.leak > 0;
                    const expanded = open === c.category;
                    const catBills = expanded ? inMonth.current.filter((b) => leakCategoryOf(b) === c.category) : [];
                    return (
                      <li key={c.category}>
                        <button type="button" onClick={() => setOpen(expanded ? null : c.category)} aria-expanded={expanded} className="block w-full py-4 text-left">
                          <div className="flex items-baseline gap-3">
                            <span className="flex-1 text-[15.5px] font-semibold text-fg">{c.category}</span>
                            {over && <span className="ez-num text-[14px] text-leak">+{money(c.leak)}</span>}
                            <ChevronDown className={cn('h-4 w-4 shrink-0 self-center text-faint transition-transform', expanded && 'rotate-180')} />
                          </div>
                          <div className="mt-2.5 h-1.5 rounded-full bg-surface-3">
                            <div className={cn('h-full rounded-full', over ? 'bg-fg/70' : 'bg-brand')} style={{ width: `${Math.min(100, Math.max(2, c.ideal > 0 ? (c.actual / c.ideal) * 100 : 100))}%` }} />
                          </div>
                          <p className="mt-2 text-[13px] text-dim">
                            <span className="ez-num text-fg">{money(c.actual)}</span> of <span className="ez-num">{money(c.ideal)}</span> planned · {c.count} {c.count === 1 ? 'bill' : 'bills'}
                            {c.topMerchant && <> · mostly {c.topMerchant}</>}
                          </p>
                        </button>
                        {expanded && <div className="pb-3">{catBills.map((b) => <BillListRow key={b.id} bill={b} showDate />)}</div>}
                      </li>
                    );
                  })}
                </ul>
                {leaks.totalActual === 0 && <p className="mt-4 text-[14.5px] text-dim">Add this month's bills and they are checked against your plan here.</p>}
              </section>
            </div>

            <div className="space-y-10">
              {/* ---------- what stands out ---------- */}
              {(leaks.patterns.length > 0 || leaks.smallSpends.count >= 5 || subs.leakMonthly > 0) && (
                <section className="ez-rise" style={{ animationDelay: '.1s' }} aria-labelledby="noticed-label">
                  <p id="noticed-label" className="ez-label">Noticed</p>
                  <ul className="ez-card mt-4 divide-y divide-line-soft">
                    {leaks.patterns.map((p) => <li key={p} className="px-4 py-3.5 text-[14.5px] leading-snug text-fg">{p}</li>)}
                    {leaks.smallSpends.count >= 5 && (
                      <li className="px-4 py-3.5 text-[14.5px] leading-snug text-fg">
                        {leaks.smallSpends.count} spends under {money(leaks.smallSpends.threshold)} add up to <span className="ez-num text-gilt">{money(leaks.smallSpends.total)}</span>.
                      </li>
                    )}
                    {subs.leakMonthly > 0 && (
                      <li>
                        <Link to="/subscriptions" className="flex items-center gap-3 px-4 py-3.5 text-[14.5px] leading-snug text-fg hover:bg-surface-3">
                          <span className="flex-1">Subscriptions you may not be using cost <span className="ez-num text-gilt">{money(subs.leakMonthly)}</span> a month.</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                        </Link>
                      </li>
                    )}
                  </ul>
                </section>
              )}

              {/* ---------- until payday ---------- */}
              <section className="ez-rise" style={{ animationDelay: '.14s' }} aria-labelledby="payday-label">
                <p id="payday-label" className="ez-label">Until payday</p>
                <div className="ez-card mt-4 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[13px] text-dim">Balance now</span>
                      <input inputMode="numeric" value={balance} placeholder="₹" aria-label="Balance now"
                        onChange={(e) => setBalance(e.target.value.replace(/[^0-9.]/g, ''))}
                        onBlur={() => saveField({ survival_balance: Number(balance) || null })}
                        className="ez-num h-11 w-full rounded-xl border border-line-soft bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-brand" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[13px] text-dim">Salary day</span>
                      <input inputMode="numeric" value={salaryDay} aria-label="Salary day of the month"
                        onChange={(e) => setSalaryDay(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                        onBlur={() => saveField({ salary_day: payday })}
                        className="ez-num h-11 w-full rounded-xl border border-line-soft bg-surface px-3 text-[15px] text-fg outline-none focus:border-brand" />
                    </label>
                  </div>
                  <p className="mt-4 text-[14.5px] text-dim">
                    {balanceNumber > 0
                      ? <><span className="ez-num text-[22px] text-fg">{money(perDay)}</span> a day keeps you level for the {daysToPayday} {daysToPayday === 1 ? 'day' : 'days'} to payday.</>
                      : 'Enter your balance to see what you can spend each day until salary.'}
                  </p>
                </div>
              </section>

              {/* ---------- alerts ---------- */}
              <section className="ez-rise" style={{ animationDelay: '.18s' }} aria-label="Leak alerts">
                <button type="button" role="switch" aria-checked={alerts} onClick={toggleAlerts} className="ez-card flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-surface-3">
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold leading-snug text-fg">Leak alerts</span>
                    <span className="block text-[13px] text-dim">A nudge when a category goes over plan</span>
                  </span>
                  <span className={cn('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', alerts ? 'bg-brand' : 'bg-line')}>
                    <span className={cn('h-5 w-5 rounded-full bg-surface transition-transform', alerts && 'translate-x-5')} />
                  </span>
                </button>
              </section>

              {/* ---------- ask ---------- */}
              <section className="ez-rise" style={{ animationDelay: '.22s' }} aria-labelledby="ask-label">
                <p id="ask-label" className="ez-label">Ask AI</p>
                <div className="mt-4">
                  <LeakAdvisor key={month.getTime()} context={advisorContext} suggestions={leaks.totalActual > 0
                    ? ['Where am I leaking the most?', 'Which category is closest to going over?', `Plan to save ${money(Math.max(1000, Math.round(leaks.totalLeak * 0.5)))} next month`]
                    : ['How do I build a simple monthly budget?', 'How much should I save each month?']} />
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
