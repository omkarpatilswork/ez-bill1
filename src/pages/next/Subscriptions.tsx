import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Mail, Plus } from 'lucide-react';
import SEO from '@/components/SEO';
import DisplayAmount from '@/components/next/DisplayAmount';
import { Confirm, EmptyState, Field, INPUT, ScreenHeader, Sheet, Tag } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCurrencySymbol } from '@/lib/countries';
import { shortDate } from '@/lib/dates';
import { getServiceByKey, POPULAR_CATEGORIES, POPULAR_SERVICES, type PopularService } from '@/lib/popular-subscriptions';
import { asCycle, CYCLE_SHORT, monthlyCost, nextCharge, type BillingCycle } from '@/lib/renewals';
import { cn } from '@/lib/utils';

interface Sub {
  id: string;
  service_key: string;
  service_name: string;
  category: string;
  source: string; // 'gmail' | 'manual'
  email_status: string; // 'active' | 'cancelled'
  user_confirmed_status: string | null; // 'subscribed' | 'unsubscribed' | null
  last_email_subject: string | null;
  last_email_date: string | null; // doubles as "last charged"
  last_amount: number | null;
  next_billing_date?: string | null;
  billing_cycle?: string | null;
  currency?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  pending_update?: Record<string, unknown> | null;
}

const CHANGE_FIELDS = ['service_name', 'last_amount', 'billing_cycle', 'category', 'currency', 'next_billing_date'] as const;
const CYCLES: BillingCycle[] = ['weekly', 'monthly', 'yearly'];
const today = () => new Date().toISOString().slice(0, 10);

const price = (s: Sub) => `${getCurrencySymbol(s.currency || 'INR')}${Math.round(Number(s.last_amount) || 0).toLocaleString('en-IN')}`;

/** What an inbox update would change, in words: "₹649 a month becomes ₹699". */
function describeChange(s: Sub): string[] {
  const p = s.pending_update || {};
  const out: string[] = [];
  if (p.last_amount != null && Number(p.last_amount) !== Number(s.last_amount)) out.push(`${price(s)} becomes ${price({ ...s, last_amount: Number(p.last_amount) })}`);
  if (p.billing_cycle && p.billing_cycle !== s.billing_cycle) out.push(`billed ${CYCLE_SHORT[asCycle(String(p.billing_cycle))]}`);
  if (p.next_billing_date && p.next_billing_date !== s.next_billing_date) out.push(`next charge ${shortDate(String(p.next_billing_date))}`);
  if (p.service_name && p.service_name !== s.service_name) out.push(`named ${p.service_name}`);
  return out;
}

/**
 * Subscriptions: what repeats, what it costs a month, and what is charged next.
 * Only subscriptions the user added or confirmed count toward the total; ones
 * found in email wait in their own list until the user says they are theirs.
 */
export default function Subscriptions() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Sub | 'new' | null>(null);
  const [removing, setRemoving] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);

  const currency = profile?.default_currency || 'INR';
  const key = ['subscriptions', user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('detected_subscriptions').select('*').eq('user_id', user!.id).order('last_email_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as unknown as Sub[];
    },
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const view = useMemo(() => {
    const mine = rows.filter((r) => r.source === 'manual' || r.user_confirmed_status === 'subscribed')
      .map((r) => ({ ...r, next: nextCharge(r) }))
      .sort((a, b) => (a.next?.date.getTime() ?? Infinity) - (b.next?.date.getTime() ?? Infinity));
    const found = rows.filter((r) => r.source !== 'manual' && r.user_confirmed_status === null && r.email_status === 'active');
    const counted = mine.filter((r) => (r.currency || 'INR') === currency);
    return { mine, found, monthly: counted.reduce((s, r) => s + monthlyCost(r.last_amount, r.billing_cycle), 0), others: mine.length - counted.length };
  }, [rows, currency]);

  const update = async (row: Sub, patch: Record<string, unknown>, done: string) => {
    const { error } = await supabase.from('detected_subscriptions').update(patch as never).eq('id', row.id);
    if (error) { toast({ title: 'That was not saved', description: 'Try again in a moment.', variant: 'destructive' }); return false; }
    toast({ title: done, description: row.service_name });
    refresh();
    return true;
  };

  const applyInboxUpdate = (row: Sub) => {
    const patch: Record<string, unknown> = { pending_update: null, user_edited: true };
    for (const k of CHANGE_FIELDS) if (row.pending_update?.[k] != null) patch[k] = row.pending_update[k];
    return update(row, patch, 'Updated from your inbox');
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    // One the user typed in is deleted. One found in email is marked "not mine", so the next search does not bring it back.
    const ok = removing.source === 'manual'
      ? !(await supabase.from('detected_subscriptions').delete().eq('id', removing.id)).error
      : !(await supabase.from('detected_subscriptions').update({ user_confirmed_status: 'unsubscribed' }).eq('id', removing.id)).error;
    setBusy(false);
    if (!ok) { toast({ title: 'That was not removed', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    toast({ title: 'Subscription removed', description: removing.service_name });
    setRemoving(null); setEditing(null);
    refresh();
  };

  const searchGmail = async () => {
    setSearching(true);
    try {
      const { data: status } = await supabase.functions.invoke('gmail-auth', { body: { action: 'status' } });
      if (!status?.connected) {
        toast({ title: 'Gmail is not connected', description: 'Connect it first, then search again.' });
        navigate('/email-bills');
        return;
      }
      const { data, error } = await supabase.functions.invoke('gmail-subscription-scan', { body: { days: 180 } });
      if (error) throw error;
      const found = data?.detected_count ?? 0;
      toast({ title: found ? `${found} ${found === 1 ? 'subscription' : 'subscriptions'} found in Gmail` : 'Nothing new in Gmail', description: 'The last 6 months of email were checked.' });
      refresh();
    } catch {
      toast({ title: 'Gmail was not searched', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const symbol = getCurrencySymbol(currency);
  const next = view.mine.find((r) => r.next);

  return (
    <>
      <SEO title="Subscriptions" description="What repeats, what it costs a month, and what is charged next." path="/subscriptions" />
      <div className="max-w-[860px]">
        <ScreenHeader title="Subscriptions">
          <button type="button" className="ez-btn ez-btn--ghost" onClick={searchGmail} disabled={searching}><Mail className="h-4 w-4" /> {searching ? 'Searching Gmail' : 'Find in Gmail'}</button>
          <button type="button" className="ez-btn ez-btn--primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" strokeWidth={2.25} /> Add</button>
        </ScreenHeader>

        {query.isError ? (
          <EmptyState title="Your subscriptions did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => query.refetch()}>Try again</button>
          </EmptyState>
        ) : !query.isSuccess ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-[18px] bg-surface-2" />)}</div>
        ) : view.mine.length === 0 && view.found.length === 0 ? (
          <EmptyState title="No subscriptions yet." body="Search Gmail for receipts that repeat, or add one yourself. EZZ BILL adds up what they cost a month and shows the next charge." />
        ) : (
          <>
            {view.mine.length > 0 && (
              <section className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5">
                <div>
                  <p className="ez-label">A month</p>
                  <DisplayAmount amount={view.monthly} symbol={symbol} className="mt-4 text-[56px] lg:text-[72px]" />
                </div>
                <dl className="mb-1.5 space-y-1 text-[14.5px] text-dim lg:mb-3">
                  <div className="flex gap-2"><dt>A year</dt><dd className="ez-num text-fg">{symbol}{Math.round(view.monthly * 12).toLocaleString('en-IN')}</dd></div>
                  {next?.next && <div className="flex gap-2"><dt>Next charge</dt><dd className="text-fg">{next.service_name}, {shortDate(next.next.date.toISOString(), { year: false })}</dd></div>}
                  {view.others > 0 && <div>{view.others} in another currency not counted</div>}
                </dl>
              </section>
            )}

            {view.found.length > 0 && (
              <section className="mt-9">
                <h2 className="ez-label">Found in your email</h2>
                <p className="mt-2 text-[14px] text-dim">Not counted until you say they are yours.</p>
                <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
                  {view.found.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 lg:px-5">
                      <Initial name={r.service_name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold leading-snug text-fg">{r.service_name}</p>
                        <p className="truncate text-[13.5px] text-dim">{r.last_amount ? `${price(r)} ${CYCLE_SHORT[asCycle(r.billing_cycle)]}` : 'Price not in the email'}{r.last_email_subject && ` · ${r.last_email_subject}`}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm" onClick={() => update(r, { user_confirmed_status: 'unsubscribed' }, 'Left out')}>Not mine</button>
                        <button type="button" className="ez-btn ez-btn--primary ez-btn--sm" onClick={() => update(r, { user_confirmed_status: 'subscribed' }, 'Added to your subscriptions')}>Mine</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view.mine.length > 0 && (
              <section className="mt-9">
                <h2 className="ez-label !text-dim">Yours, next charge first</h2>
                <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
                  {view.mine.map((r) => {
                    const changes = describeChange(r);
                    return (
                      <li key={r.id}>
                        <button type="button" onClick={() => setEditing(r)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-surface-3 lg:px-5">
                          <Initial name={r.service_name} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[16px] font-semibold leading-snug text-fg">{r.service_name}</span>
                              {r.is_trial && <Tag>Trial{r.trial_ends_at ? ` to ${shortDate(r.trial_ends_at, { year: false })}` : ''}</Tag>}
                            </span>
                            <span className="block truncate text-[13.5px] text-dim">
                              {r.next ? `Next charge ${shortDate(r.next.date.toISOString(), { year: false })}${r.next.estimated ? ', estimated' : ''}` : 'Next charge not known'}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="ez-num block text-[15px] text-fg">{r.last_amount ? price(r) : 'no price'}</span>
                            <span className="block text-[12px] text-faint">{CYCLE_SHORT[asCycle(r.billing_cycle)]}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                        </button>
                        {changes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft bg-surface px-4 py-3 lg:px-5">
                            <p className="min-w-0 flex-1 text-[13.5px] text-dim">A newer email says: <span className="text-fg">{changes.join(', ')}</span>.</p>
                            <div className="flex gap-2">
                              <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm" onClick={() => update(r, { pending_update: null }, 'Kept as it was')}>Keep mine</button>
                              <button type="button" className="ez-btn ez-btn--primary ez-btn--sm" onClick={() => applyInboxUpdate(r)}>Use it</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <Editor target={editing} userId={user?.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} onRemove={(s) => setRemoving(s)} />

      <Confirm open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} title="Remove this subscription?" busy={busy} action="Remove" onConfirm={remove}
        body={<>{removing?.service_name} leaves your list and your monthly total. This does not cancel it with the provider.</>} />
    </>
  );
}

function Initial({ name }: { name: string }) {
  return <span className="ez-num grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-[15px] font-medium uppercase text-dim" aria-hidden="true">{name.trim().charAt(0) || '?'}</span>;
}

function Editor({ target, userId, onClose, onSaved, onRemove }: {
  target: Sub | 'new' | null;
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
  onRemove: (s: Sub) => void;
}) {
  const { toast } = useToast();
  const editing = target && target !== 'new' ? target : null;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [lastCharged, setLastCharged] = useState(today());
  const [category, setCategory] = useState('Other');
  const [serviceKey, setServiceKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setName(editing?.service_name || '');
    setAmount(editing?.last_amount ? String(editing.last_amount) : '');
    setCycle(asCycle(editing?.billing_cycle));
    setLastCharged((editing?.last_email_date || new Date().toISOString()).slice(0, 10));
    setCategory(editing?.category || 'Other');
    setServiceKey(editing?.service_key || '');
  }, [target, editing]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (editing || q.length < 2) return [];
    return POPULAR_SERVICES.filter((s) => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q).slice(0, 4);
  }, [name, editing]);

  const pick = (s: PopularService) => { setName(s.name); setCategory(s.category); setServiceKey(s.key); };
  const cancelUrl = getServiceByKey(serviceKey)?.cancelUrl;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!name.trim() || !(value > 0)) { toast({ title: 'A name and a price are needed', variant: 'destructive' }); return; }
    if (!userId || saving) return;
    setSaving(true);
    const fields = { service_name: name.trim(), category, last_amount: value, last_email_date: new Date(lastCharged).toISOString(), billing_cycle: cycle, email_status: 'active', user_confirmed_status: 'subscribed' };
    const { error } = editing
      ? await supabase.from('detected_subscriptions').update({ ...fields, user_edited: true, pending_update: null } as never).eq('id', editing.id)
      : await supabase.from('detected_subscriptions').insert({ ...fields, user_id: userId, source: 'manual', email_count: 1, service_key: serviceKey || `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` } as never);
    setSaving(false);
    if (error) { toast({ title: 'The subscription was not saved', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    toast({ title: editing ? 'Subscription updated' : 'Subscription added', description: name.trim() });
    onSaved();
  };

  return (
    <Sheet open={!!target} onOpenChange={(o) => { if (!o) onClose(); }} label={editing ? 'Subscription' : 'Add a subscription'} title={editing ? editing.service_name : 'What repeats?'}>
      <form onSubmit={save} className="space-y-4">
        <Field id="s-name" label="Name">
          <input id="s-name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix" autoComplete="off" autoFocus={!editing} />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => <button key={s.key} type="button" onClick={() => pick(s)} className="rounded-full border border-line-soft px-3 py-1.5 text-[13px] text-dim hover:border-line hover:text-fg">{s.name}</button>)}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="s-amount" label="Price"><input id="s-amount" type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num')} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="649" /></Field>
          <Field id="s-last" label="Last charged"><input id="s-last" type="date" className={INPUT} value={lastCharged} max={today()} onChange={(e) => setLastCharged(e.target.value)} /></Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 block text-[13px] font-medium text-dim">Charged</legend>
          <div className="grid grid-cols-3 gap-2">
            {CYCLES.map((c) => (
              <button key={c} type="button" aria-pressed={cycle === c} onClick={() => setCycle(c)}
                className={cn('h-11 rounded-xl border text-[14.5px] font-medium capitalize', cycle === c ? 'border-brand bg-brand/10 text-fg' : 'border-line text-dim hover:text-fg')}>{c}</button>
            ))}
          </div>
        </fieldset>
        <Field id="s-category" label="Kind">
          <select id="s-category" className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
            {POPULAR_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            {!POPULAR_CATEGORIES.some((c) => c.key === category) && <option value={category}>{category}</option>}
          </select>
        </Field>
        {editing && cancelUrl && (
          <a href={cancelUrl} target="_blank" rel="noreferrer" className="block text-[14px] font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">How to cancel {editing.service_name}</a>
        )}
        <div className="flex items-center justify-between gap-2.5 pt-1">
          {editing ? <button type="button" className="ez-btn ez-btn--ghost" onClick={() => onRemove(editing)}>Remove</button> : <span />}
          <button type="submit" disabled={saving} className="ez-btn ez-btn--primary disabled:opacity-50">{saving ? 'Saving' : editing ? 'Save changes' : 'Add subscription'}</button>
        </div>
      </form>
    </Sheet>
  );
}
