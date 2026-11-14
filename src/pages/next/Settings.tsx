import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import SEO from '@/components/SEO';
import { Field, INPUT, ScreenHeader } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { COUNTRIES, CURRENCIES, getCurrencyForCountry } from '@/lib/countries';
import { cn } from '@/lib/utils';

const INCOME = [['0-25k', 'Under ₹25,000'], ['25-50k', '₹25,000 to ₹50,000'], ['50-100k', '₹50,000 to ₹1 lakh'], ['100-200k', '₹1 lakh to ₹2 lakh'], ['200k+', 'Over ₹2 lakh']];
const AGE = [['18-24', '18 to 24'], ['25-34', '25 to 34'], ['35-44', '35 to 44'], ['45+', '45 or over']];
const CITY = [['tier_1', 'Metro (Mumbai, Delhi, Bengaluru)'], ['tier_2', 'Large city (Pune, Jaipur, Indore)'], ['tier_3', 'Smaller city or town']];
const LIVING = [['family', 'With family'], ['shared', 'Sharing a flat'], ['alone', 'On my own']];
const JOB = [['remote', 'From home'], ['office', 'At an office'], ['travel', 'On the road a lot']];
const GOAL = [['save', 'Save as much as I can'], ['balanced', 'A balance'], ['lifestyle', 'Enjoy it now']];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="ez-label !text-dim">{title}</h2>
      {note && <p className="mt-2 max-w-[560px] text-[14px] text-dim">{note}</p>}
      <div className="ez-card mt-3 p-4 lg:p-5">{children}</div>
    </section>
  );
}

function Pick({ id, label, value, onChange, options, className }: { id: string; label: string; value: string; onChange: (v: string) => void; options: string[][]; className?: string }) {
  return (
    <Field id={id} label={label} className={className}>
      <select id={id} className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}

/** Settings: you, the money profile Money Leaks works from, the look, and the way in. */
export default function Settings() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [you, setYou] = useState({ name: '', phone: '', country: 'IN', currency: 'INR' });
  const [money, setMoney] = useState({ income: '', age: '', city: '', living: '', job: '', goal: '', rent: '', emi: '', salaryDay: '' });
  const [saving, setSaving] = useState<'you' | 'money' | null>(null);

  useEffect(() => {
    if (!profile) return;
    const p = profile as unknown as Record<string, string | number | null>;
    const text = (v: string | number | null | undefined) => (v == null ? '' : String(v));
    setYou({ name: text(p.display_name) || text(p.full_name), phone: text(p.phone), country: text(p.country) || 'IN', currency: text(p.default_currency) || 'INR' });
    setMoney({ income: text(p.income_range), age: text(p.age_group), city: text(p.city_tier), living: text(p.living_situation), job: text(p.job_type), goal: text(p.financial_goal), rent: text(p.monthly_rent), emi: text(p.monthly_emi), salaryDay: text(p.salary_day) });
  }, [profile]);

  const store = async (which: 'you' | 'money', fields: Record<string, unknown>, done: string) => {
    if (!user || saving) return;
    setSaving(which);
    const { error } = await supabase.from('profiles').update(fields as never).eq('id', user.id);
    setSaving(null);
    if (error) { toast({ title: 'That was not saved', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    await refreshProfile();
    queryClient.invalidateQueries({ queryKey: ['money-profile', user.id] });
    toast({ title: done });
  };

  const saveYou = (e: FormEvent) => {
    e.preventDefault();
    if (!you.name.trim()) { toast({ title: 'Enter your name', variant: 'destructive' }); return; }
    store('you', { display_name: you.name.trim(), full_name: you.name.trim(), phone: you.phone.trim() || null, country: you.country, default_currency: you.currency }, 'Your details are saved');
  };

  const saveMoney = (e: FormEvent) => {
    e.preventDefault();
    const day = Number(money.salaryDay);
    if (!money.income || !money.goal) { toast({ title: 'Choose your income and your aim first', variant: 'destructive' }); return; }
    if (money.salaryDay && !(day >= 1 && day <= 31)) { toast({ title: 'Salary day is a day of the month, 1 to 31', variant: 'destructive' }); return; }
    store('money', {
      income_range: money.income, financial_goal: money.goal, age_group: money.age || null, city_tier: money.city || null, living_situation: money.living || null, job_type: money.job || null,
      monthly_rent: money.rent ? Number(money.rent) : null, monthly_emi: money.emi ? Number(money.emi) : null, salary_day: money.salaryDay ? day : null, money_profile_completed: true,
    }, 'Money profile saved');
  };

  const m = (key: keyof typeof money) => (v: string) => setMoney((x) => ({ ...x, [key]: v }));
  const linkRow = 'flex items-center justify-between gap-4 px-4 py-3.5 text-[15.5px] text-fg hover:bg-surface-3 lg:px-5';

  return (
    <>
      <SEO title="Settings" description="Your details, your money profile, the theme, and how you sign in." path="/settings" />
      <div className="max-w-[760px] pb-10">
        <ScreenHeader title="Settings" summary={user?.email} />

        <Section title="You">
          <form onSubmit={saveYou} className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Field id="st-name" label="Name" className="col-span-2 sm:col-span-1"><input id="st-name" className={INPUT} value={you.name} onChange={(e) => setYou({ ...you, name: e.target.value })} autoComplete="name" /></Field>
            <Field id="st-phone" label="Phone" className="col-span-2 sm:col-span-1"><input id="st-phone" type="tel" className={cn(INPUT, 'ez-num')} value={you.phone} onChange={(e) => setYou({ ...you, phone: e.target.value })} autoComplete="tel" /></Field>
            <Field id="st-country" label="Country">
              <select id="st-country" className={INPUT} value={you.country} onChange={(e) => setYou({ ...you, country: e.target.value, currency: getCurrencyForCountry(e.target.value) || you.currency })}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <Field id="st-currency" label="Currency" hint="Totals count bills in this currency.">
              <select id="st-currency" className={cn(INPUT, 'ez-num')} value={you.currency} onChange={(e) => setYou({ ...you, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
              </select>
            </Field>
            <div className="col-span-2 flex justify-end"><button type="submit" disabled={saving === 'you'} className="ez-btn ez-btn--primary disabled:opacity-50">{saving === 'you' ? 'Saving' : 'Save'}</button></div>
          </form>
        </Section>

        <Section title="Money profile" note="Money Leaks sets your ideal budget from these answers, and Monthly Summary estimates your income from them. Nothing here is shared.">
          <form onSubmit={saveMoney} className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Pick id="st-income" label="Monthly income" value={money.income} onChange={m('income')} options={INCOME} className="col-span-2 sm:col-span-1" />
            <Pick id="st-goal" label="Your aim" value={money.goal} onChange={m('goal')} options={GOAL} className="col-span-2 sm:col-span-1" />
            <Pick id="st-age" label="Age" value={money.age} onChange={m('age')} options={AGE} />
            <Pick id="st-city" label="Where you live" value={money.city} onChange={m('city')} options={CITY} />
            <Pick id="st-living" label="Living" value={money.living} onChange={m('living')} options={LIVING} />
            <Pick id="st-job" label="Work" value={money.job} onChange={m('job')} options={JOB} />
            <Field id="st-rent" label="Rent a month"><input id="st-rent" type="number" min="0" inputMode="numeric" className={cn(INPUT, 'ez-num')} value={money.rent} onChange={(e) => m('rent')(e.target.value)} /></Field>
            <Field id="st-emi" label="Loan payments a month"><input id="st-emi" type="number" min="0" inputMode="numeric" className={cn(INPUT, 'ez-num')} value={money.emi} onChange={(e) => m('emi')(e.target.value)} /></Field>
            <Field id="st-salary" label="Salary day" hint="Day of the month, if it is regular."><input id="st-salary" type="number" min="1" max="31" inputMode="numeric" className={cn(INPUT, 'ez-num')} value={money.salaryDay} onChange={(e) => m('salaryDay')(e.target.value)} /></Field>
            <div className="col-span-2 flex justify-end"><button type="submit" disabled={saving === 'money'} className="ez-btn ez-btn--primary disabled:opacity-50">{saving === 'money' ? 'Saving' : 'Save'}</button></div>
          </form>
        </Section>

        <Section title="Look">
          <div className="flex max-w-[280px] gap-1 rounded-full border border-line-soft bg-surface p-1" role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => { if (theme !== t) toggleTheme(); }}
                className={cn('h-10 flex-1 rounded-full text-[14px] font-medium capitalize', theme === t ? 'bg-surface-3 text-fg' : 'text-dim hover:text-fg')}>{t}</button>
            ))}
          </div>
        </Section>

        <section className="mt-10">
          <h2 className="ez-label !text-dim">Account</h2>
          <div className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
            <Link to="/security" className={linkRow}><span>Password, email and deleting your account</span><ChevronRight className="h-4 w-4 text-faint" /></Link>
            <Link to="/email-bills" className={linkRow}><span>Gmail connection</span><ChevronRight className="h-4 w-4 text-faint" /></Link>
            <Link to="/privacy" className={linkRow}><span>Privacy</span><ChevronRight className="h-4 w-4 text-faint" /></Link>
            <Link to="/terms" className={linkRow}><span>Terms</span><ChevronRight className="h-4 w-4 text-faint" /></Link>
            <button type="button" onClick={() => signOut()} className={cn(linkRow, 'w-full text-left')}>Sign out</button>
          </div>
        </section>
      </div>
    </>
  );
}
