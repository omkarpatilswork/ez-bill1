import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, FileText, FileUp, Mail, PencilLine, Plus, X } from 'lucide-react';
import SEO from '@/components/SEO';
import { Field, INPUT, SheetChoices } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useBills } from '@/hooks/useBills';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BROAD_CATEGORIES, type BroadCategory } from '@/lib/bill-category';
import { draftFromBill, draftFromReading, draftItems, draftProblems, draftToRow, emptyDraft, toNumber, type BillDraft } from '@/lib/bill-draft';
import { checkBillMath, formatAmount, parseBillDescription, type BillSource, type ParsedBill } from '@/lib/bill-format';
import { collect } from '@/lib/capture-inbox';
import { CURRENCIES, getCurrencySymbol } from '@/lib/countries';
import { shortDate } from '@/lib/dates';
import { findLikelyDuplicate } from '@/lib/duplicates';
import { prepareForReading, readyToBlob, storageName, toJpegIfHeic, type ReadyFile } from '@/lib/image-prep';
import { cn } from '@/lib/utils';

type Status = 'reading' | 'ready' | 'saved' | 'skipped';

interface Entry {
  id: string;
  name: string;
  status: Status;
  draft: BillDraft;
  /** The reader could not make this one out: the person types in what they see. */
  unread?: boolean;
  ready?: ReadyFile;
  previewUrl?: string;
  isImage?: boolean;
}

const PAYMENTS = ['UPI', 'Card', 'Cash', 'Net banking', 'Wallet'];
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

/**
 * Add a bill. Every way in (camera, files, typing, correcting a saved bill)
 * ends on this one screen: the details, the lines, and whether the numbers
 * agree, checked by the person before anything is saved.
 *
 * Several files become a queue: each is read in turn and checked in turn, and
 * the ones with nothing to question can be saved together.
 */
export default function AddBill() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const mode = params.get('mode');
  const { bills } = useBills();
  const currency = profile?.default_currency || 'INR';

  const [queue, setQueue] = useState<Entry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kept, setKept] = useState<{ source: BillSource; parsed: Partial<ParsedBill> } | null>(null);
  const alive = useRef(true);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    alive.current = true;
    const made = urls.current; // the same array for the life of the screen
    return () => { alive.current = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    staleTime: Infinity,
    queryFn: async () => ((await supabase.from('expense_categories').select('id, name')).data || []) as { id: string; name: string }[],
  });

  const patch = useCallback((id: string, change: Partial<Entry>) => setQueue((q) => q.map((e) => (e.id === id ? { ...e, ...change } : e))), []);

  const readFiles = useCallback(async (files: File[]) => {
    const entries: Entry[] = files.map((f) => ({ id: newId(), name: f.name, status: 'reading', draft: emptyDraft(currency) }));
    setQueue((q) => [...q, ...entries]);
    setCurrentId((c) => c ?? entries[0]?.id ?? null);
    for (const [i, entry] of entries.entries()) {
      let ready: ReadyFile | undefined;
      let previewUrl: string | undefined;
      let isImage = false;
      try {
        const file = await toJpegIfHeic(files[i]);
        ready = await prepareForReading(file);
        const blob = readyToBlob(ready);
        isImage = ready.type.startsWith('image/');
        previewUrl = URL.createObjectURL(blob);
        urls.current.push(previewUrl);
        if (alive.current) patch(entry.id, { previewUrl, isImage });
        const { data, error } = await supabase.functions.invoke('extract-receipt', { body: { file_base64: ready.base64, file_type: ready.type } });
        if (error || !data || data.error || data.fallback) throw new Error('unread');
        if (alive.current) patch(entry.id, { status: 'ready', ready, draft: draftFromReading(data, currency) });
      } catch {
        // Not read: keep the photo, start from an empty bill, and say so.
        if (alive.current) patch(entry.id, { status: 'ready', unread: true, ready, previewUrl, isImage, draft: emptyDraft(currency) });
      }
      if (!alive.current) return;
    }
  }, [currency, patch]);

  const typeItIn = useCallback(() => {
    const id = newId();
    setQueue([{ id, name: '', status: 'ready', draft: emptyDraft(currency, todayIso()) }]);
    setCurrentId(id);
  }, [currency]);

  // Files handed over by the "Add a bill" sheet; with none and no mode, the person chose to type it in.
  // `batch` changes with every hand-over, so this also runs when the sheet is used from this screen.
  const batch = (location.state as { batch?: number } | null)?.batch;
  useEffect(() => {
    const files = collect();
    if (files.length) readFiles(files);
    else if (!editId && !mode) typeItIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch]);

  // Correcting a saved bill.
  useEffect(() => {
    if (!editId || !user) return;
    let cancelled = false;
    (async () => {
      const { data: bill } = await supabase.from('expenses').select('*').eq('id', editId).maybeSingle();
      if (cancelled) return;
      if (!bill) { toast({ title: 'That bill was not found', variant: 'destructive' }); navigate('/expenses', { replace: true }); return; }
      const parsed = parseBillDescription(bill.description);
      setKept({ source: parsed.source, parsed });
      const id = newId();
      setQueue([{ id, name: '', status: 'ready', draft: draftFromBill(bill) }]);
      setCurrentId(id);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, user?.id]);

  const current = queue.find((e) => e.id === currentId) || null;
  const pending = queue.filter((e) => e.status === 'reading' || e.status === 'ready');

  const verdict = useCallback((entry: Entry) => {
    const total = toNumber(entry.draft.amount);
    const math = checkBillMath({ items: draftItems(entry.draft), tax: toNumber(entry.draft.tax) || null, discount: toNumber(entry.draft.discount) || null }, total);
    const duplicate = total > 0 ? findLikelyDuplicate({ merchant: entry.draft.merchant, amount: total, date: entry.draft.date, invoice: entry.draft.invoice, ignoreId: editId }, bills) : null;
    const problems = draftProblems(entry.draft);
    return { math, duplicate, problems, clean: !problems.length && math.status !== 'mismatch' && !duplicate && !entry.unread };
  }, [bills, editId]);

  const store = async (entry: Entry): Promise<string | null> => {
    if (!user) return null;
    const row = draftToRow(entry.draft, kept?.source ?? (entry.ready ? (mode === 'scan' ? 'scan' : 'upload') : 'manual'), kept?.parsed, categories);
    let id = editId;
    if (editId) {
      const { error } = await supabase.from('expenses').update(row as never).eq('id', editId);
      if (error) return null;
    } else {
      const { data, error } = await supabase.from('expenses').insert({ user_id: user.id, ...row } as never).select('id').single();
      if (error || !data) return null;
      id = (data as { id: string }).id;
    }
    if (entry.ready && id && !editId) {
      const fileName = storageName(entry.name, entry.ready.type);
      const path = `${user.id}/${id}/${fileName}`;
      const { error } = await supabase.storage.from('receipts').upload(path, readyToBlob(entry.ready), { contentType: entry.ready.type });
      if (!error) await supabase.from('expense_receipts').insert({ expense_id: id, file_path: path, file_name: fileName } as never);
      else toast({ title: 'The bill is saved, its photo is not', description: 'The details are safe. The photo did not upload.' });
    }
    return id;
  };

  const next = (afterId: string, q: Entry[]) => q.find((e) => e.id !== afterId && (e.status === 'ready' || e.status === 'reading'))?.id ?? null;

  const finish = (lastSavedId: string | null, savedCount: number) => {
    queryClient.invalidateQueries({ queryKey: ['bills', user?.id] });
    if (editId) navigate(`/expenses/${editId}`, { replace: true });
    else if (savedCount === 1 && lastSavedId) navigate(`/expenses/${lastSavedId}`, { replace: true });
    else navigate('/expenses', { replace: true });
  };

  const saveCurrent = async () => {
    if (!current || saving || verdict(current).problems.length) return;
    setSaving(true);
    const id = await store(current);
    setSaving(false);
    if (!id) { toast({ title: 'The bill was not saved', description: 'Check your connection, then try again.', variant: 'destructive' }); return; }
    toast({ title: editId ? 'Bill corrected' : 'Bill saved', description: `${current.draft.merchant} · ${formatAmount(toNumber(current.draft.amount), { symbol: getCurrencySymbol(current.draft.currency) })}` });
    const updated = queue.map((e) => (e.id === current.id ? { ...e, status: 'saved' as Status } : e));
    setQueue(updated);
    const upNext = next(current.id, updated);
    if (upNext) { setCurrentId(upNext); window.scrollTo({ top: 0 }); queryClient.invalidateQueries({ queryKey: ['bills', user?.id] }); } else finish(id, updated.filter((e) => e.status === 'saved').length);
  };

  const skipCurrent = () => {
    if (!current) return;
    const updated = queue.map((e) => (e.id === current.id ? { ...e, status: 'skipped' as Status } : e));
    setQueue(updated);
    const upNext = next(current.id, updated);
    if (upNext) setCurrentId(upNext); else finish(null, updated.filter((e) => e.status === 'saved').length);
  };

  const cleanOnes = queue.filter((e) => e.status === 'ready' && verdict(e).clean);
  const saveAllClean = async () => {
    if (saving) return;
    setSaving(true);
    let saved = 0; let last: string | null = null; let updated = queue;
    for (const entry of cleanOnes) {
      const id = await store(entry);
      if (id) { saved += 1; last = id; updated = updated.map((e) => (e.id === entry.id ? { ...e, status: 'saved' as Status } : e)); }
    }
    setSaving(false);
    setQueue(updated);
    toast({ title: `${saved} ${saved === 1 ? 'bill' : 'bills'} saved`, description: saved < cleanOnes.length ? 'Some were not saved. Try those again.' : undefined });
    const upNext = updated.find((e) => e.status === 'ready' || e.status === 'reading');
    if (upNext) { setCurrentId(upNext.id); queryClient.invalidateQueries({ queryKey: ['bills', user?.id] }); } else finish(last, updated.filter((e) => e.status === 'saved').length);
  };

  const picker = (capture: boolean) => (
    <input type="file" className="sr-only" multiple={!capture} accept={capture ? 'image/*' : 'image/*,.pdf,.heic,.heif'} {...(capture ? { capture: 'environment' as const } : {})}
      onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) readFiles(files); }} />
  );

  const heading = editId ? 'Correct the bill' : !current ? 'Add a bill' : current.status === 'reading' ? 'Reading the bill' : current.unread ? 'Type in what you see' : current.ready ? 'Check the bill' : 'Type it in';

  return (
    <>
      <SEO title={editId ? 'Correct a bill' : 'Add a bill'} description="Scan, upload or type in a bill, check what was read, and save it." path="/expenses/new" />
      <div className="max-w-[1040px] pb-10">
        <header className="pt-6 lg:pt-9">
          {queue.length > 1 && <p className="ez-label">Bill {Math.max(1, queue.findIndex((e) => e.id === currentId) + 1)} of {queue.length}</p>}
          <h1 className={cn('ez-display text-[38px] text-fg lg:text-[54px]', queue.length > 1 && 'mt-2.5')}>{heading}</h1>
        </header>

        {queue.length > 1 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {queue.map((e, i) => {
              const v = e.status === 'ready' ? verdict(e) : null;
              const state = e.status === 'reading' ? 'reading' : e.status === 'saved' ? 'saved' : e.status === 'skipped' ? 'skipped' : v?.clean ? 'ready' : 'to check';
              return (
                <button key={e.id} type="button" disabled={e.status === 'saved' || e.status === 'skipped'} onClick={() => setCurrentId(e.id)} aria-current={e.id === currentId}
                  className={cn('ez-num rounded-full border px-3 py-1.5 text-[12px]', e.id === currentId ? 'border-brand bg-brand/10 text-fg' : 'border-line-soft text-dim hover:text-fg', (e.status === 'saved' || e.status === 'skipped') && 'opacity-50')}>
                  {i + 1} <span className="pl-1 text-faint">{state}</span>
                </button>
              );
            })}
            {cleanOnes.length > 1 && (
              <button type="button" disabled={saving} onClick={saveAllClean} className="ez-btn ez-btn--ghost ez-btn--sm ml-auto disabled:opacity-50">
                <Check className="h-3.5 w-3.5" /> Save the {cleanOnes.length} with nothing to check
              </button>
            )}
          </div>
        )}

        {!current ? (
          editId ? <div className="mt-8 h-96 max-w-[560px] rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" /> : (
            <div className="mt-8 max-w-[480px]">
              <SheetChoices choices={[
                { label: 'Scan', hint: 'Point the camera at a paper bill.', icon: Camera, input: picker(true) },
                { label: 'Upload', hint: 'Photos or PDFs. One or many.', icon: FileUp, input: picker(false) },
                { label: 'Type it in', hint: 'No bill to show.', icon: PencilLine, onSelect: typeItIn },
                { label: 'Gmail and SMS', hint: 'Bills in your inbox and UPI messages.', icon: Mail, onSelect: () => navigate('/email-bills') },
              ]} />
            </div>
          )
        ) : current.status === 'reading' ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="ez-card p-6">
              <p className="ez-label">Reading</p>
              <p className="mt-3 text-[16px] text-fg">{current.name}</p>
              <p className="mt-1.5 text-[14px] text-dim">This usually takes 5 to 10 seconds. You check it before it is saved.</p>
              <div className="mt-6 space-y-3" aria-hidden="true">{[72, 48, 60, 36].map((w) => <div key={w} className="h-3 animate-pulse rounded-full bg-surface-3" style={{ width: `${w}%` }} />)}</div>
            </div>
            <Preview entry={current} />
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Review key={current.id} entry={current} verdict={verdict(current)} fromFile={!!current.ready && !editId} onChange={(draft) => patch(current.id, { draft })}
              footer={(
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {editId ? <Link to={`/expenses/${editId}`} className="ez-btn ez-btn--ghost">Cancel</Link>
                    : pending.length > 1 ? <button type="button" className="ez-btn ez-btn--ghost" onClick={skipCurrent}>Skip this one</button>
                    : <button type="button" className="ez-btn ez-btn--ghost" onClick={() => navigate(-1)}>Cancel</button>}
                  <button type="button" disabled={saving || verdict(current).problems.length > 0} onClick={saveCurrent} className="ez-btn ez-btn--primary disabled:opacity-40">
                    {saving ? 'Saving' : editId ? 'Save changes' : verdict(current).duplicate ? 'Save anyway' : pending.length > 1 ? 'Save and next' : 'Save bill'}
                  </button>
                </div>
              )} />
            <Preview entry={current} />
          </div>
        )}
      </div>
    </>
  );
}

function Preview({ entry }: { entry: Entry }) {
  if (!entry.previewUrl) return null;
  return (
    <aside className="order-first lg:order-none">
      <div className="lg:sticky lg:top-24">
        <p className="ez-label !text-dim">Your bill</p>
        {entry.isImage ? (
          <a href={entry.previewUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-[18px] border border-line-soft bg-surface-2">
            <img src={entry.previewUrl} alt="The bill you added" className="max-h-[220px] w-full object-cover object-top lg:max-h-[560px] lg:object-contain" />
          </a>
        ) : (
          <a href={entry.previewUrl} target="_blank" rel="noreferrer" className="ez-card mt-3 flex items-center gap-3 p-4 text-[14.5px] text-fg hover:bg-surface-3">
            <FileText className="h-5 w-5 shrink-0 text-dim" /> <span className="min-w-0 truncate">{entry.name}</span>
          </a>
        )}
        <p className="mt-2 text-[12.5px] text-faint">Open it to compare with what was read.</p>
      </div>
    </aside>
  );
}

interface Verdict {
  math: ReturnType<typeof checkBillMath>;
  duplicate: ReturnType<typeof findLikelyDuplicate>;
  problems: string[];
}

function Review({ entry, verdict, fromFile, onChange, footer }: {
  entry: Entry;
  verdict: Verdict;
  fromFile: boolean;
  onChange: (draft: BillDraft) => void;
  footer: React.ReactNode;
}) {
  const d = entry.draft;
  const [noteOpen, setNoteOpen] = useState(!!d.notes);
  const symbol = getCurrencySymbol(d.currency);
  const set = <K extends keyof BillDraft>(key: K) => (e: { target: { value: string } }) => onChange({ ...d, [key]: e.target.value as BillDraft[K] });
  const setItem = (i: number, change: Partial<BillDraft['items'][number]>) => onChange({ ...d, items: d.items.map((item, at) => (at === i ? { ...item, ...change } : item)) });
  const missing = (value: string) => (fromFile && !entry.unread && !value ? 'Not found on the bill.' : undefined);
  const currencies = useMemo(() => (CURRENCIES.some((c) => c.code === d.currency) ? CURRENCIES : [{ code: d.currency, symbol }, ...CURRENCIES]), [d.currency, symbol]);
  const { math, duplicate } = verdict;

  return (
    <div className="min-w-0">
      {entry.unread && (
        <p className="mb-5 rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-[14.5px] text-fg">This one could not be read. {entry.ready ? 'Your photo is kept: type in what you can see on it.' : 'Type in what you can see on it.'}</p>
      )}

      <section className="ez-card grid grid-cols-2 gap-x-3 gap-y-4 p-4 lg:p-5">
        <Field id="b-shop" label="Shop" className="col-span-2" hint={missing(d.merchant)}>
          <input id="b-shop" className={INPUT} value={d.merchant} onChange={set('merchant')} placeholder="Blue Tokai Coffee" autoComplete="off" />
        </Field>
        <Field id="b-total" label="Total" hint={missing(d.amount)}>
          <div className="flex gap-2">
            <select aria-label="Currency" className={cn(INPUT, 'ez-num w-[84px] shrink-0 px-2')} value={d.currency} onChange={set('currency')}>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <input id="b-total" type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num min-w-0')} value={d.amount} onChange={set('amount')} placeholder="412" />
          </div>
        </Field>
        <Field id="b-date" label="Date on the bill" hint={missing(d.date)}>
          <input id="b-date" type="date" className={INPUT} value={d.date} max={todayIso()} onChange={set('date')} />
        </Field>
        <Field id="b-category" label="Category">
          <select id="b-category" className={INPUT} value={d.category} onChange={(e) => onChange({ ...d, category: e.target.value as BroadCategory })}>
            {BROAD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field id="b-paid" label="Paid by">
          <input id="b-paid" list="b-paid-options" className={INPUT} value={d.payment} onChange={set('payment')} placeholder="UPI" autoComplete="off" />
          <datalist id="b-paid-options">{PAYMENTS.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field id="b-invoice" label="Bill or invoice number" className="col-span-2">
          <input id="b-invoice" className={cn(INPUT, 'ez-num')} value={d.invoice} onChange={set('invoice')} autoComplete="off" />
        </Field>
      </section>

      <section className="ez-card mt-4 p-4 lg:p-5">
        <h2 className="ez-label !text-dim">Lines on the bill</h2>
        {d.items.length > 0 && (
          <ul className="mt-3 space-y-2">
            {d.items.map((item, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <input aria-label={`Line ${i + 1} name`} className={cn(INPUT, 'min-w-0 basis-full sm:flex-1 sm:basis-0')} value={item.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Cappuccino" />
                <input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" inputMode="decimal" className={cn(INPUT, 'ez-num w-[64px] shrink-0 px-2 text-center sm:w-[58px]')} value={item.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
                <input aria-label={`Line ${i + 1} amount`} type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num min-w-0 flex-1 px-2.5 text-right sm:w-[96px] sm:flex-none')} value={item.total} onChange={(e) => setItem(i, { total: e.target.value })} placeholder="0" />
                <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => onChange({ ...d, items: d.items.filter((_, at) => at !== i) })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint hover:bg-surface-3 hover:text-fg"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => onChange({ ...d, items: [...d.items, { name: '', quantity: '1', total: '' }] })} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-dim hover:text-fg">
          <Plus className="h-4 w-4" /> Add a line
        </button>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
          <Field id="b-subtotal" label="Subtotal"><input id="b-subtotal" type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num')} value={d.subtotal} onChange={set('subtotal')} /></Field>
          <Field id="b-tax" label="Tax"><input id="b-tax" type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num')} value={d.tax} onChange={set('tax')} /></Field>
          <Field id="b-discount" label="Discount"><input id="b-discount" type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num')} value={d.discount} onChange={set('discount')} /></Field>
        </div>

        {math.status === 'ok' && (
          <p className="mt-4 flex items-center gap-2 text-[14px] text-dim"><Check className="h-4 w-4 text-brand-text" /> The lines add up to the total{math.viaTax ? ', with tax and discount' : ''}.</p>
        )}
        {math.status === 'mismatch' && (
          <p className="mt-4 rounded-[14px] border border-line bg-surface px-4 py-3 text-[14.5px] text-fg" role="status">
            The lines come to <span className="ez-num text-gilt">{formatAmount(math.itemsSum, { symbol, paise: true })}</span>
            {Math.abs(math.expected - math.diff - math.itemsSum) > 0.005 && <> (<span className="ez-num">{formatAmount(math.expected - math.diff, { symbol, paise: true })}</span> with tax and discount)</>}
            , the total says <span className="ez-num text-gilt">{formatAmount(math.expected, { symbol, paise: true })}</span>.
            {' '}<span className="text-dim">One of them was probably misread. Compare with the bill, then save.</span>
          </p>
        )}
      </section>

      {noteOpen ? (
        <Field id="b-note" label="Note" className="mt-4"><input id="b-note" className={INPUT} value={d.notes} onChange={set('notes')} placeholder="Team lunch" /></Field>
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-dim hover:text-fg"><Plus className="h-4 w-4" /> Add a note</button>
      )}

      {duplicate && (
        <p className="mt-5 rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-[14.5px] text-fg" role="status">
          You may already have this bill: {duplicate.bill.merchant || 'a bill'} on {shortDate(duplicate.bill.expense_date)}, {duplicate.reason === 'invoice' ? 'with the same invoice number and total' : 'same shop, total and day'}.
          {' '}<Link to={`/expenses/${duplicate.bill.id}`} target="_blank" className="font-medium underline decoration-line underline-offset-4 hover:decoration-brand">Open it</Link>
        </p>
      )}

      {verdict.problems.length > 0 && <p className="mt-5 text-right text-[13.5px] text-dim">Before saving: {verdict.problems.join(', ').toLowerCase()}.</p>}
      <div className="mt-4">{footer}</div>
    </div>
  );
}
