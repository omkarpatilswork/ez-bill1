import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import SEO from '@/components/SEO';
import { EmptyState, Tag } from '@/components/next/Sheet';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseBillDescription } from '@/lib/bill-format';
import { daysUntil, shortDate } from '@/lib/dates';
import { ensureNotificationPermission, getReminder, removeReminder, setReminder, type ReturnReminder } from '@/lib/return-reminders';
import { cn } from '@/lib/utils';

interface Suggested {
  contact?: { phone?: string | null; email?: string | null; working_hours?: string | null };
  website?: { official_url?: string | null; support_url?: string | null; help_center_url?: string | null; track_order_url?: string | null };
  returns_warranty?: { return_window_days?: number | null; exchange_policy?: string | null; warranty_duration?: string | null; warranty_conditions?: string | null; policy_url?: string | null };
}

const WINDOWS = [7, 10, 15, 30];
const addDays = (isoDay: string, days: number) => { const d = new Date(`${isoDay}T00:00:00`); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-5 px-4 py-3 lg:px-5"><span className="shrink-0 text-[14px] text-dim">{label}</span><span className="min-w-0 break-words text-right text-[15px] text-fg">{children}</span></div>;
}
const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline decoration-line underline-offset-4 hover:decoration-brand">{children}<ExternalLink className="h-3.5 w-3.5 shrink-0 text-faint" /></a>
);

/**
 * Smart Support for one bill. What is printed on the bill is shown as fact.
 * Anything the AI suggests (a phone number, a return period) is fetched only
 * when asked for and sits under an "Unverified" tag: the model answers from
 * memory, with no lookup behind it, so it can be out of date or wrong.
 */
export default function SmartSupport() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const [asking, setAsking] = useState(false);
  const [reminder, setReminderState] = useState<ReturnReminder | null>(() => (id ? getReminder(id) : null));
  const [windowDays, setWindowDays] = useState<number>(() => (id ? getReminder(id)?.return_window_days ?? 0 : 0));

  const query = useQuery({
    queryKey: ['bill-for-support', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('merchant, title, description, expense_date, amount, currency').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const bill = query.data;
  const parsed = useMemo(() => parseBillDescription(bill?.description), [bill?.description]);
  const shop = bill?.merchant || bill?.title || '';
  const bought = bill?.expense_date?.slice(0, 10) || '';

  const ask = async () => {
    if (!bill || asking) return;
    setAsking(true);
    try {
      const { data, error } = await supabase.functions.invoke('merchant-support', {
        body: { merchant_name: shop, merchant_address: parsed.address || '', purchase_date: bought, items: parsed.items, category: parsed.category || '' },
      });
      if (error || !data) throw new Error('none');
      setSuggested(data as Suggested);
    } catch {
      toast({ title: 'No suggestions came back', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setAsking(false);
    }
  };

  const returnBy = windowDays > 0 && bought ? addDays(bought, windowDays) : null;
  const left = daysUntil(returnBy);
  const notifyBefore = Math.min(2, Math.max(windowDays - 1, 1));

  const remind = async () => {
    if (!id || !returnBy) return;
    const permission = await ensureNotificationPermission();
    const next: ReturnReminder = { expense_id: id, merchant: shop || 'Bill', purchase_date: bought, return_window_days: windowDays, notify_days_before: notifyBefore, created_at: new Date().toISOString() };
    setReminder(next);
    setReminderState(next);
    toast({ title: 'Reminder set', description: permission === 'granted' ? `You will be told ${notifyBefore} days before ${shortDate(returnBy)}.` : 'Allow notifications for this site to be told in time.' });
  };
  const forget = () => { if (id) removeReminder(id); setReminderState(null); toast({ title: 'Reminder removed' }); };

  const s = suggested;
  const links = [['Website', s?.website?.official_url], ['Support page', s?.website?.support_url], ['Help centre', s?.website?.help_center_url], ['Order tracking', s?.website?.track_order_url], ['Policy page', s?.returns_warranty?.policy_url]].filter(([, v]) => v) as [string, string][];
  const suggestedWindow = s?.returns_warranty?.return_window_days;
  const nothing = s && !s.contact?.phone && !s.contact?.email && !s.contact?.working_hours && links.length === 0 && !suggestedWindow && !s.returns_warranty?.exchange_policy && !s.returns_warranty?.warranty_duration;

  return (
    <>
      <SEO title="Smart Support" description="Help with a bill: what is printed on it, a return reminder, and where to look for the shop." path="/support" />
      <div className="max-w-[720px] pb-10">
        <Link to={`/expenses/${id}`} className="mt-5 inline-flex items-center gap-1 text-[14px] font-medium text-dim hover:text-fg lg:mt-8"><ChevronLeft className="h-4 w-4" /> Back to the bill</Link>

        {query.isError || (query.isSuccess && !bill) ? (
          <EmptyState title="That bill was not found." body="It may have been deleted."><Link to="/expenses" className="ez-btn ez-btn--ghost">All bills</Link></EmptyState>
        ) : !query.isSuccess ? (
          <div className="mt-6 h-72 rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" />
        ) : (
          <>
            <header className="mt-4">
              <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Smart Support</h1>
              <p className="mt-2 text-[15px] text-dim">{shop || 'This bill'}{bought && <> · bought {shortDate(bought)}</>}</p>
            </header>

            <section className="mt-9">
              <div className="flex items-center justify-between gap-3"><h2 className="ez-label !text-dim">On your bill</h2><Tag>From the bill</Tag></div>
              <div className="ez-card mt-3 divide-y divide-line-soft">
                <Row label="Shop">{shop || 'Not on the bill'}</Row>
                {parsed.address && <Row label="Address">{parsed.address}</Row>}
                {parsed.invoice && <Row label="Bill number"><span className="ez-num">{parsed.invoice}</span></Row>}
                {parsed.payment && <Row label="Paid by">{parsed.payment}</Row>}
                {shop && <Row label="Look it up"><span className="flex flex-col items-end gap-1.5"><Out href={`https://www.google.com/maps/search/${encodeURIComponent(`${shop} ${parsed.address || ''}`.trim())}`}>Find it on Google Maps</Out><Out href={search(`${shop} customer care`)}>Search for its customer care</Out></span></Row>}
              </div>
              {parsed.invoice && <p className="mt-2.5 text-[13px] text-faint">Have the bill number ready when you call or write: it is what they ask for first.</p>}
            </section>

            <section className="mt-9">
              <h2 className="ez-label !text-dim">Return reminder</h2>
              <div className="ez-card mt-3 p-4 lg:p-5">
                <p className="text-[14.5px] text-dim">How long does this shop give you to return it? It is usually printed on the bill or on the shop's site.{suggestedWindow ? <> AI suggests <span className="ez-num text-fg">{suggestedWindow} days</span>, unverified.</> : null}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {WINDOWS.map((d) => (
                    <button key={d} type="button" aria-pressed={windowDays === d} disabled={!!reminder} onClick={() => setWindowDays(d)}
                      className={cn('ez-num h-10 rounded-full border px-4 text-[14px] disabled:opacity-50', windowDays === d ? 'border-brand bg-brand/10 text-fg' : 'border-line text-dim hover:text-fg')}>{d} days</button>
                  ))}
                  <input type="number" min="1" max="365" inputMode="numeric" aria-label="Another number of days" placeholder="Other" disabled={!!reminder}
                    value={windowDays && !WINDOWS.includes(windowDays) ? windowDays : ''} onChange={(e) => setWindowDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                    className="ez-num h-10 w-[88px] rounded-full border border-line bg-surface px-4 text-[14px] text-fg outline-none placeholder:text-faint focus:border-brand disabled:opacity-50" />
                </div>
                {returnBy && left !== null && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
                    <p className="text-[15px] text-fg">{left < 0 ? <>The return period ended on {shortDate(returnBy)}.</> : <>Return by {shortDate(returnBy)}: <span className={cn('ez-num', left <= 3 && 'text-gilt')}>{left} {left === 1 ? 'day' : 'days'}</span> left.</>}</p>
                    {reminder ? <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm" onClick={forget}>Remove reminder</button>
                      : left >= 0 && <button type="button" className="ez-btn ez-btn--primary ez-btn--sm" onClick={remind}>Remind me {notifyBefore} {notifyBefore === 1 ? 'day' : 'days'} before</button>}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-9">
              <div className="flex items-center justify-between gap-3"><h2 className="ez-label !text-dim">Suggested by AI</h2><Tag>Unverified</Tag></div>
              <div className="ez-card mt-3">
                {!s ? (
                  <div className="p-4 lg:p-5">
                    <p className="text-[14.5px] text-dim">AI can suggest a phone number, a support page and the usual return and warranty terms for {shop || 'this shop'}. It answers from memory, without checking, so treat what it says as a lead to confirm and not as fact.</p>
                    <button type="button" disabled={asking || !shop} onClick={ask} className="ez-btn ez-btn--ghost mt-4 disabled:opacity-50">{asking ? 'Asking' : 'Suggest contacts and terms'}</button>
                  </div>
                ) : nothing ? <p className="p-4 text-[14.5px] text-dim lg:p-5">AI had nothing to suggest for this shop.</p> : (
                  <div className="divide-y divide-line-soft">
                    {s.contact?.phone && <Row label="Phone"><a href={`tel:${s.contact.phone.replace(/\s+/g, '')}`} className="ez-num underline decoration-line underline-offset-4">{s.contact.phone}</a></Row>}
                    {s.contact?.email && <Row label="Email"><a href={`mailto:${s.contact.email}`} className="underline decoration-line underline-offset-4">{s.contact.email}</a></Row>}
                    {s.contact?.working_hours && <Row label="Hours">{s.contact.working_hours}</Row>}
                    {links.map(([label, url]) => <Row key={label} label={label}><Out href={url}>{url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Out></Row>)}
                    {suggestedWindow ? <Row label="Returns"><span className="ez-num">{suggestedWindow} days</span></Row> : null}
                    {s.returns_warranty?.exchange_policy && <Row label="Exchange">{s.returns_warranty.exchange_policy}</Row>}
                    {s.returns_warranty?.warranty_duration && <Row label="Warranty">{s.returns_warranty.warranty_duration}{s.returns_warranty.warranty_conditions && <span className="block text-[13.5px] text-dim">{s.returns_warranty.warranty_conditions}</span>}</Row>}
                    <p className="px-4 py-3 text-[13px] text-faint lg:px-5">None of this was checked against the shop. Confirm a number or a term on the shop's own site before you rely on it.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
