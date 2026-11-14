import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronRight, FileUp, Mail, PencilLine, Plus } from 'lucide-react';
import SEO from '@/components/SEO';
import { Confirm, EmptyState, Field, INPUT, ScreenHeader, Sheet, SheetChoices, Tag } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { prepareForReading } from '@/lib/image-prep';
import { addMonths, daysUntil, shortDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Warranty {
  id: string;
  product_name: string;
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  category: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  warranty_months: number | null;
  retailer: string | null;
  notes: string | null;
  qr_url: string | null;
  support_url: string | null;
  image_path: string | null;
  source: string;
  support_phone?: string | null;
  support_email?: string | null;
  claim_url?: string | null;
  coverage?: string | null;
  exclusions?: string | null;
  required_documents?: string[] | null;
  claim_steps?: string[] | null;
  warranty_terms?: string | null;
}

const EMPTY = {
  product_name: '', brand: '', model_number: '', serial_number: '', purchase_date: '',
  warranty_months: '', expiry_date: '', retailer: '', notes: '',
};
type Form = typeof EMPTY;

const SOON_DAYS = 60;
const SOURCE: Record<string, string> = { gmail: 'From Gmail', photo: 'From a photo', manual: 'Typed in' };

type Group = 'soon' | 'covered' | 'unknown' | 'ended';
const GROUP_TITLE: Record<Group, string> = { soon: 'Ending soon', covered: 'Covered', unknown: 'End date not known', ended: 'Ended' };

function groupOf(w: Warranty): Group {
  const days = daysUntil(w.expiry_date);
  if (days === null) return 'unknown';
  if (days < 0) return 'ended';
  return days <= SOON_DAYS ? 'soon' : 'covered';
}

/**
 * Warranty vault: every product still under cover, soonest to end first.
 *
 * Contacts and claim steps stored with a warranty were filled in by the AI
 * reader, which today cannot say whether they were printed on the card. Until
 * it can, they are shown as "Unverified" rather than as fact.
 */
export default function WarrantyVault() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [reading, setReading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Warranty | null>(null);

  const query = useQuery({
    queryKey: ['warranties', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('warranties' as never).select('*').order('expiry_date', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Warranty[];
    },
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['warranties', user?.id] });

  const groups = useMemo(() => {
    const by: Record<Group, Warranty[]> = { soon: [], covered: [], unknown: [], ended: [] };
    for (const w of items) by[groupOf(w)].push(w);
    by.ended.reverse(); // most recently ended first
    return by;
  }, [items]);
  const open = items.find((w) => w.id === openId) || null;
  const live = groups.soon.length + groups.covered.length;

  const readCard = async (picked: File) => {
    setReading(true);
    try {
      const ready = await prepareForReading(picked);
      const { data, error } = await supabase.functions.invoke('extract-warranty', { body: { file_base64: ready.base64, file_type: ready.type } });
      if (error) throw error;
      if (data?.fallback) toast({ title: 'The card was hard to read', description: 'Fill in what is missing below.' });
      setRead({
        category: data?.category || 'Other',
        support_phone: data?.support_phone || null, support_email: data?.support_email || null, claim_url: data?.claim_url || null,
        support_url: data?.support_url || null, qr_url: data?.qr_url || null,
        coverage: data?.coverage || '', exclusions: data?.exclusions || '', warranty_terms: data?.warranty_terms || '',
        required_documents: data?.required_documents || [], claim_steps: data?.claim_steps || [], raw_extracted: data || {},
      });
      setFile(picked);
      setForm({
        product_name: data?.product_name || '', brand: data?.brand || '', model_number: data?.model_number || '',
        serial_number: data?.serial_number || '', purchase_date: data?.purchase_date || '',
        warranty_months: data?.warranty_months ? String(data.warranty_months) : '', expiry_date: data?.expiry_date || '',
        retailer: data?.retailer || '', notes: data?.notes || '',
      });
      setAdding(false);
    } catch {
      toast({ title: 'The card was not read', description: 'Try a sharper photo, or type it in.', variant: 'destructive' });
    } finally {
      setReading(false);
    }
  };

  const searchGmail = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-warranty-scan', { body: { max_results: 30, days: 365 } });
      if (error) throw error;
      const found = data?.saved_count || 0;
      toast({ title: found ? `${found} ${found === 1 ? 'warranty' : 'warranties'} added from Gmail` : 'Nothing new in Gmail', description: found ? undefined : 'The last 12 months of email were checked.' });
      setAdding(false);
      refresh();
    } catch (e) {
      if (String((e as Error)?.message || '').includes('Gmail not connected')) {
        toast({ title: 'Gmail is not connected', description: 'Connect it first, then search again.' });
        navigate('/email-bills');
      } else {
        toast({ title: 'Gmail was not searched', description: 'Try again in a moment.', variant: 'destructive' });
      }
    } finally {
      setSearching(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !form || saving) return;
    if (!form.product_name.trim()) { toast({ title: 'Name the product first', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let image_path: string | null = null;
      if (file) {
        image_path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop() || 'jpg'}`;
        const { error } = await supabase.storage.from('warranty-cards').upload(image_path, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
      }
      const months = Number(form.warranty_months) || null;
      const { error } = await supabase.from('warranties' as never).insert({
        category: 'Other',
        ...read,
        user_id: user.id,
        product_name: form.product_name.trim(), brand: form.brand.trim(), model_number: form.model_number.trim(),
        serial_number: form.serial_number.trim(), retailer: form.retailer.trim(), notes: form.notes.trim(),
        purchase_date: form.purchase_date || null, warranty_months: months,
        expiry_date: form.expiry_date || addMonths(form.purchase_date, months) || null,
        image_path, source: file ? 'photo' : 'manual',
      } as never);
      if (error) throw error;
      toast({ title: 'Warranty saved', description: form.product_name.trim() });
      setForm(null); setFile(null); setRead({});
      refresh();
    } catch {
      toast({ title: 'The warranty was not saved', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from('warranties' as never).delete().eq('id', deleting.id);
    if (!error && deleting.image_path) await supabase.storage.from('warranty-cards').remove([deleting.image_path]);
    setSaving(false);
    if (error) { toast({ title: 'The warranty was not deleted', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    toast({ title: 'Warranty deleted', description: deleting.product_name });
    setDeleting(null); setOpenId(null);
    refresh();
  };

  const seeCard = async (w: Warranty) => {
    if (!w.image_path) return;
    const { data } = await supabase.storage.from('warranty-cards').createSignedUrl(w.image_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    else toast({ title: 'The card did not open', description: 'Try again in a moment.', variant: 'destructive' });
  };

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f));
  const computedEnd = form && !form.expiry_date ? addMonths(form.purchase_date, Number(form.warranty_months) || null) : null;
  const filePicker = (capture: boolean) => (
    <input type="file" className="sr-only" accept={capture ? 'image/*' : 'image/*,application/pdf'} {...(capture ? { capture: 'environment' as const } : {})}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) readCard(f); e.target.value = ''; }} />
  );

  return (
    <>
      <SEO title="Warranty vault" description="Every product still under warranty, and the day its cover ends." path="/warranties" />
      <div className="max-w-[860px]">
        <ScreenHeader
          title="Warranty vault"
          summary={!query.isSuccess || items.length === 0 ? undefined : (
            <>{live} {live === 1 ? 'product' : 'products'} under cover{groups.soon.length > 0 && <>. <span className="text-fg">{groups.soon.length} {groups.soon.length === 1 ? 'ends' : 'end'} within {SOON_DAYS} days.</span></>}</>
          )}
        >
          {items.length > 0 && <button type="button" className="ez-btn ez-btn--primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" strokeWidth={2.25} /> Add a warranty</button>}
        </ScreenHeader>

        {query.isError ? (
          <EmptyState title="Your warranties did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => query.refetch()}>Try again</button>
          </EmptyState>
        ) : !query.isSuccess ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-[18px] bg-surface-2" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState title="No warranties yet." body="Photograph a warranty card or let EZZ BILL find them in your email. It keeps the end date, so you know when cover runs out.">
            <button type="button" className="ez-btn ez-btn--primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" strokeWidth={2.25} /> Add a warranty</button>
          </EmptyState>
        ) : (
          (['soon', 'covered', 'unknown', 'ended'] as Group[]).filter((g) => groups[g].length > 0).map((g) => (
            <section key={g} className="mt-9">
              <h2 className={cn('ez-label', g !== 'soon' && '!text-dim')}>{GROUP_TITLE[g]}</h2>
              <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">
                {groups[g].map((w) => {
                  const days = daysUntil(w.expiry_date);
                  return (
                    <li key={w.id}>
                      <button type="button" onClick={() => setOpenId(w.id)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-surface-3 lg:px-5">
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-[16px] font-semibold leading-snug', g === 'ended' ? 'text-dim' : 'text-fg')}>{w.product_name}</span>
                          <span className="block truncate text-[13.5px] text-dim">{[w.brand, w.retailer].filter(Boolean).join(' · ') || SOURCE[w.source] || 'Warranty'}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          {days === null ? <span className="ez-num block text-[13px] text-faint">no end date</span> : days < 0 ? (
                            <span className="ez-num block text-[13px] text-faint">ended {shortDate(w.expiry_date)}</span>
                          ) : (
                            <>
                              <span className={cn('ez-num block text-[15px]', days <= 30 ? 'text-gilt' : 'text-fg')}>{days <= SOON_DAYS ? `${days} ${days === 1 ? 'day' : 'days'}` : shortDate(w.expiry_date)}</span>
                              <span className="block text-[12px] text-faint">{days <= SOON_DAYS ? `ends ${shortDate(w.expiry_date)}` : 'cover ends'}</span>
                            </>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <Sheet open={adding} onOpenChange={setAdding} label="Add a warranty" title="Where is it?">
        <SheetChoices choices={[
          { label: 'Scan the card', hint: 'Use the camera.', icon: Camera, busy: reading, input: filePicker(true) },
          { label: 'Upload', hint: 'A photo or PDF of the card or invoice.', icon: FileUp, busy: reading, input: filePicker(false) },
          { label: 'Gmail', hint: 'Find warranty emails from the last 12 months.', icon: Mail, busy: searching, onSelect: searchGmail },
          { label: 'Type it in', hint: 'Product, date bought, months of cover.', icon: PencilLine, onSelect: () => { setRead({}); setFile(null); setForm(EMPTY); setAdding(false); } },
        ]} />
      </Sheet>

      <Sheet open={!!form} onOpenChange={(o) => { if (!o) { setForm(null); setFile(null); setRead({}); } }} label={file ? 'Read from your card' : 'Add a warranty'} title={file ? 'Check the details' : 'Type it in'} wide>
        {form && (
          <form onSubmit={save} className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Field id="w-name" label="Product" className="col-span-2"><input id="w-name" className={INPUT} value={form.product_name} onChange={set('product_name')} placeholder="boAt Airdopes 141" autoFocus={!file} /></Field>
            <Field id="w-brand" label="Brand"><input id="w-brand" className={INPUT} value={form.brand} onChange={set('brand')} /></Field>
            <Field id="w-shop" label="Bought from"><input id="w-shop" className={INPUT} value={form.retailer} onChange={set('retailer')} /></Field>
            <Field id="w-bought" label="Bought on"><input id="w-bought" type="date" className={INPUT} value={form.purchase_date} onChange={set('purchase_date')} /></Field>
            <Field id="w-months" label="Months of cover"><input id="w-months" type="number" min="0" inputMode="numeric" className={INPUT} value={form.warranty_months} onChange={set('warranty_months')} placeholder="12" /></Field>
            <Field id="w-ends" label="Cover ends" className="col-span-2" hint={computedEnd ? `Left empty, this is saved as ${shortDate(computedEnd)}: the date bought plus the months of cover.` : undefined}>
              <input id="w-ends" type="date" className={INPUT} value={form.expiry_date} onChange={set('expiry_date')} />
            </Field>
            <Field id="w-model" label="Model"><input id="w-model" className={INPUT} value={form.model_number} onChange={set('model_number')} /></Field>
            <Field id="w-serial" label="Serial number"><input id="w-serial" className={cn(INPUT, 'ez-num')} value={form.serial_number} onChange={set('serial_number')} /></Field>
            <Field id="w-notes" label="Notes" className="col-span-2"><input id="w-notes" className={INPUT} value={form.notes} onChange={set('notes')} /></Field>
            <div className="col-span-2 mt-1 flex justify-end gap-2.5">
              <button type="button" className="ez-btn ez-btn--ghost" onClick={() => { setForm(null); setFile(null); setRead({}); }}>Cancel</button>
              <button type="submit" disabled={saving} className="ez-btn ez-btn--primary disabled:opacity-50">{saving ? 'Saving' : 'Save warranty'}</button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpenId(null); }} label={open ? SOURCE[open.source] || 'Warranty' : undefined} title={open?.product_name || ''} wide>
        {open && <Detail w={open} onSeeCard={() => seeCard(open)} onDelete={() => setDeleting(open)} />}
      </Sheet>

      <Confirm open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} title="Delete this warranty?" busy={saving} action="Delete" onConfirm={remove}
        body={<>{deleting?.product_name} and its card photo are removed from the vault. This cannot be undone.</>} />
    </>
  );
}

function Detail({ w, onSeeCard, onDelete }: { w: Warranty; onSeeCard: () => void; onDelete: () => void }) {
  const days = daysUntil(w.expiry_date);
  const contacts = [
    w.support_phone && { label: 'Phone', value: w.support_phone, href: `tel:${w.support_phone.replace(/\s+/g, '')}` },
    w.support_email && { label: 'Email', value: w.support_email, href: `mailto:${w.support_email}` },
    w.claim_url && { label: 'Claim page', value: w.claim_url.replace(/^https?:\/\//, ''), href: w.claim_url },
    w.support_url && { label: 'Support page', value: w.support_url.replace(/^https?:\/\//, ''), href: w.support_url },
  ].filter(Boolean) as { label: string; value: string; href: string }[];
  const hasGuide = contacts.length > 0 || !!w.claim_steps?.length || !!w.required_documents?.length;
  const rows: [string, string | null | undefined][] = [
    ['Brand', w.brand], ['Model', w.model_number], ['Serial', w.serial_number], ['Bought from', w.retailer],
    ['Bought on', w.purchase_date && shortDate(w.purchase_date)], ['Cover', w.warranty_months ? `${w.warranty_months} months` : null],
    ['Cover ends', w.expiry_date && shortDate(w.expiry_date)],
  ];

  return (
    <div>
      <div className="ez-slip-wrap mx-auto max-w-[360px]">
        <div className="ez-slip">
          <p className="ez-slip__merchant">Warranty</p>
          <p className="ez-slip__sub">{w.product_name}</p>
          <hr className="ez-slip__rule" />
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="ez-slip__row"><span className="ez-slip__dim">{k}</span><span className="break-all">{v}</span></div>
          ))}
          <hr className="ez-slip__rule" />
          <div className="ez-slip__total">
            <span>{days === null ? 'END DATE' : days < 0 ? 'ENDED' : 'DAYS LEFT'}</span>
            <b>{days === null ? 'not known' : days < 0 ? shortDate(w.expiry_date) : days}</b>
          </div>
        </div>
      </div>

      {(w.warranty_terms || w.coverage || w.exclusions) && (
        <section className="mt-7 space-y-4">
          {([['Terms', w.warranty_terms], ['Covered', w.coverage], ['Not covered', w.exclusions]] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><h3 className="ez-label !text-dim">{k}</h3><p className="mt-1.5 text-[14.5px] leading-relaxed text-fg">{v}</p></div>
          ))}
        </section>
      )}

      {hasGuide && (
        <section className="mt-7 rounded-[18px] border border-line-soft bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="ez-label !text-dim">Making a claim</h3>
            <Tag>Unverified</Tag>
          </div>
          <p className="mt-2 text-[13px] text-dim">Suggested by AI and not checked against your card. Confirm on the brand's own site before you rely on it.</p>
          {!!w.required_documents?.length && (
            <ul className="mt-4 space-y-1 text-[14.5px] text-fg">{w.required_documents.map((d) => <li key={d} className="flex gap-2"><span className="text-faint">·</span>{d}</li>)}</ul>
          )}
          {!!w.claim_steps?.length && (
            <ol className="mt-4 space-y-2 text-[14.5px] text-fg">{w.claim_steps.map((s, i) => <li key={s} className="flex gap-3"><span className="ez-num shrink-0 text-faint">{i + 1}</span>{s}</li>)}</ol>
          )}
          {contacts.length > 0 && (
            <ul className="mt-4 divide-y divide-line-soft border-t border-line-soft">
              {contacts.map((c) => (
                <li key={c.label}>
                  <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex items-baseline justify-between gap-4 py-2.5 text-[14.5px] hover:text-brand-text">
                    <span className="text-dim">{c.label}</span><span className="ez-num min-w-0 truncate text-fg">{c.value}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {w.notes && <p className="mt-6 text-[14.5px] text-dim">{w.notes}</p>}

      <div className="mt-7 flex flex-wrap justify-end gap-2.5">
        {w.image_path && <button type="button" className="ez-btn ez-btn--ghost" onClick={onSeeCard}>See the card</button>}
        <button type="button" className="ez-btn ez-btn--ghost" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
