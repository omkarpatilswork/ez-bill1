import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpDown, Check, Copy, Search, SlidersHorizontal, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import BillListRow from '@/components/next/BillListRow';
import { useCapture } from '@/components/next/capture-context';
import SEO from '@/components/SEO';
import { useBills, type Bill } from '@/hooks/useBills';
import { useToast } from '@/hooks/use-toast';
import { deleteBills } from '@/lib/bill-actions';
import { billCategory, type BroadCategory } from '@/lib/bill-category';
import { formatAmount, parseBillDescription, SOURCE_LABEL, type BillSource } from '@/lib/bill-format';
import { findDuplicateGroups, type DuplicateGroup } from '@/lib/duplicates';
import { cn } from '@/lib/utils';

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest' | 'merchant';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'highest', label: 'Highest amount' },
  { key: 'lowest', label: 'Lowest amount' },
  { key: 'merchant', label: 'Merchant, A to Z' },
];
const SOURCES: BillSource[] = ['nfc', 'email', 'scan', 'upload', 'manual'];

const MENU = 'ez-app w-56 rounded-2xl border-line bg-surface-2 p-1.5 text-fg shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)]';
const MENU_ITEM = 'cursor-pointer justify-between gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-fg focus:bg-surface-3 focus:text-fg';
const CHIP = 'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium';

interface Indexed {
  bill: Bill;
  category: BroadCategory;
  source: BillSource;
  /** Lower-cased text a search runs against: shop, title, invoice number, note. */
  text: string;
  items: { name: string; quantity: number }[];
}

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function Bills() {
  const billsQuery = useBills();
  const { bills } = billsQuery;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(params.get('q') || '');
  const [category, setCategory] = useState<BroadCategory | null>(null);
  const [source, setSource] = useState<BillSource | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [reviewDuplicates, setReviewDuplicates] = useState(false);
  const [removeGroups, setRemoveGroups] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const indexed = useMemo<Indexed[]>(() => bills.map((bill) => {
    const parsed = parseBillDescription(bill.description);
    return {
      bill,
      category: billCategory(bill),
      source: parsed.source,
      text: [bill.merchant, bill.title, parsed.invoice, parsed.notes, parsed.aggregator].filter(Boolean).join(' ').toLowerCase(),
      items: parsed.items.map((i) => ({ name: i.name, quantity: i.quantity })),
    };
  }), [bills]);

  const categories = useMemo(() => {
    const counts = new Map<BroadCategory, number>();
    for (const row of indexed) counts.set(row.category, (counts.get(row.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [indexed]);

  const sourcesPresent = useMemo(() => SOURCES.filter((s) => indexed.some((row) => row.source === s)), [indexed]);

  /* Search looks at the shop, the invoice number, the amount, and every item on the bill. */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const amountQuery = q.replace(/[₹,\s]/g, '');
    const rows = indexed
      .filter((row) => (!category || row.category === category) && (!source || row.source === source))
      .map((row) => {
        if (!q) return { ...row, hint: null as string | null };
        if (row.text.includes(q)) return { ...row, hint: null };
        const item = row.items.find((i) => i.name.toLowerCase().includes(q));
        if (item) return { ...row, hint: `${item.quantity} × ${item.name}` };
        if (amountQuery && /^\d/.test(amountQuery) && String(row.bill.amount).includes(amountQuery)) return { ...row, hint: null };
        return null;
      })
      .filter((row): row is Indexed & { hint: string | null } => row !== null);

    const by: Record<SortKey, (a: Indexed, b: Indexed) => number> = {
      newest: (a, b) => b.bill.expense_date.localeCompare(a.bill.expense_date) || b.bill.created_at.localeCompare(a.bill.created_at),
      oldest: (a, b) => a.bill.expense_date.localeCompare(b.bill.expense_date) || a.bill.created_at.localeCompare(b.bill.created_at),
      highest: (a, b) => Number(b.bill.amount) - Number(a.bill.amount),
      lowest: (a, b) => Number(a.bill.amount) - Number(b.bill.amount),
      merchant: (a, b) => (a.bill.merchant || a.bill.title).localeCompare(b.bill.merchant || b.bill.title),
    };
    return rows.sort(by[sort]);
  }, [indexed, query, category, source, sort]);

  const total = results.reduce((s, r) => s + Number(r.bill.amount), 0);
  const filtered = Boolean(query.trim() || category || source);

  /* By date, bills sit under their month with the month's total. Other sorts are one flat list. */
  const groups = useMemo(() => {
    if (sort !== 'newest' && sort !== 'oldest') return [{ key: '', rows: results, total: 0 }];
    const out: { key: string; rows: typeof results; total: number }[] = [];
    for (const row of results) {
      const key = monthKey(row.bill.expense_date);
      const last = out[out.length - 1];
      if (last && last.key === key) { last.rows.push(row); last.total += Number(row.bill.amount); } else out.push({ key, rows: [row], total: Number(row.bill.amount) });
    }
    return out;
  }, [results, sort]);

  const duplicates = useMemo(() => findDuplicateGroups(bills), [bills]);

  // Arriving from the search button focuses the field; arriving after a save offers the duplicates check.
  useEffect(() => {
    if (params.get('search') === '1') searchRef.current?.focus();
  }, [params]);
  useEffect(() => {
    if (params.get('checkDupes') !== '1' || !billsQuery.ready) return;
    if (duplicates.length > 0) openDuplicates();
    params.delete('checkDupes');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billsQuery.ready, duplicates.length]);

  const openDuplicates = () => {
    // Only the strong kind is ticked. "Same shop, amount and day" can be two real purchases.
    setRemoveGroups(new Set(duplicates.filter((g) => g.reason === 'invoice').map((g) => g.key)));
    setReviewDuplicates(true);
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };

  const remove = async (ids: string[], done: () => void) => {
    setWorking(true);
    const error = await deleteBills(ids);
    setWorking(false);
    if (error) {
      toast({ title: 'Nothing was deleted', description: 'Check your connection and try again.', variant: 'destructive' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['bills'] });
    toast({ title: `${plural(ids.length, 'bill')} deleted` });
    done();
  };

  const copiesToRemove = duplicates.filter((g) => removeGroups.has(g.key)).flatMap((g) => g.bills.slice(1).map((b) => b.id));

  return (
    <>
      <SEO title="Bills" description="Every bill, searchable by shop and by item." path="/expenses" />

      <div className="max-w-[860px]">
        <header className="flex items-end justify-between gap-4 pt-6 lg:pt-9">
          <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Bills</h1>
          {bills.length > 0 && (
            <p className="ez-num pb-1.5 text-[13px] text-dim lg:pb-3">
              {plural(results.length, 'bill')} · <span className="text-fg">{formatAmount(total, { paise: false })}</span>
            </p>
          )}
        </header>

        {billsQuery.isError ? (
          <Message title="Your bills did not load." body="Check your connection, then try again.">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={() => billsQuery.refetch()}>Try again</button>
          </Message>
        ) : !billsQuery.ready ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading your bills">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 rounded-2xl bg-surface-2" />)}
          </div>
        ) : bills.length === 0 ? (
          <NoBills />
        ) : (
          <>
            {/* ---------- search ---------- */}
            <label className="mt-6 flex h-12 items-center gap-3 rounded-full border border-line-soft bg-surface-2 px-4 focus-within:border-brand">
              <Search className="h-[18px] w-[18px] shrink-0 text-faint" />
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} type="search" enterKeyHint="search"
                placeholder="Search shops, items, amounts" aria-label="Search bills"
                className="h-full min-w-0 flex-1 bg-transparent text-[15.5px] text-fg outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden" />
              {query && (
                <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear search" className="grid h-7 w-7 place-items-center rounded-full text-dim hover:bg-surface-3 hover:text-fg">
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>

            {/* ---------- category ---------- */}
            <div className="-mx-4 mt-3.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Category">
              <button type="button" onClick={() => setCategory(null)} aria-pressed={!category}
                className={cn(CHIP, !category ? 'border-fg bg-fg text-surface' : 'border-line-soft text-dim hover:border-line hover:text-fg')}>All</button>
              {categories.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(category === c ? null : c)} aria-pressed={category === c}
                  className={cn(CHIP, category === c ? 'border-fg bg-fg text-surface' : 'border-line-soft text-dim hover:border-line hover:text-fg')}>{c}</button>
              ))}
            </div>

            {/* ---------- source, sort, select ---------- */}
            <div className="mt-4 flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(CHIP, source ? 'border-brand/50 text-fg' : 'border-line-soft text-dim hover:border-line hover:text-fg')}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> {source ? SOURCE_LABEL[source] : 'Any source'}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={8} className={MENU}>
                  <DropdownMenuItem className={MENU_ITEM} onSelect={() => setSource(null)}>Any source {!source && <Check className="h-4 w-4 text-brand-text" />}</DropdownMenuItem>
                  {sourcesPresent.map((s) => (
                    <DropdownMenuItem key={s} className={MENU_ITEM} onSelect={() => setSource(s)}>{SOURCE_LABEL[s]} {source === s && <Check className="h-4 w-4 text-brand-text" />}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(CHIP, 'border-line-soft text-dim hover:border-line hover:text-fg')}>
                    <ArrowUpDown className="h-3.5 w-3.5" /> {SORTS.find((s) => s.key === sort)!.label}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={8} className={MENU}>
                  {SORTS.map((s) => (
                    <DropdownMenuItem key={s.key} className={MENU_ITEM} onSelect={() => setSort(s.key)}>{s.label} {sort === s.key && <Check className="h-4 w-4 text-brand-text" />}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                className="ml-auto h-9 rounded-full px-3 text-[13.5px] font-medium text-dim hover:text-fg">{selecting ? 'Done' : 'Select'}</button>
            </div>

            {/* ---------- possible duplicates ---------- */}
            {duplicates.length > 0 && !selecting && !filtered && (
              <button type="button" onClick={openDuplicates} className="ez-card mt-5 flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-surface-3">
                <Copy className="h-[18px] w-[18px] shrink-0 text-brand-text" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-fg">{plural(duplicates.length, 'bill')} may be saved twice</span>
                  <span className="block text-[13px] text-dim">Look before anything is removed</span>
                </span>
                <span className="text-[13.5px] font-medium text-brand-text">Review</span>
              </button>
            )}

            {/* ---------- the list ---------- */}
            {results.length === 0 ? (
              <Message title="Nothing matches." body={query.trim() ? `No bill has “${query.trim()}” in its shop, items or amount.` : 'No bill fits these filters.'}>
                <button type="button" className="ez-btn ez-btn--ghost" onClick={() => { setQuery(''); setCategory(null); setSource(null); }}>Clear search and filters</button>
              </Message>
            ) : (
              groups.map((g) => (
                <section key={g.key || 'all'} className="mt-7" aria-label={g.key ? monthLabel(g.key) : 'Bills'}>
                  {g.key && (
                    <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
                      <h2 className="ez-label ez-label--quiet">{monthLabel(g.key)}</h2>
                      <p className="ez-num text-[12.5px] text-dim">{formatAmount(g.total, { paise: false })}</p>
                    </div>
                  )}
                  <div className="mt-1.5">
                    {g.rows.map((r) => (
                      <BillListRow key={r.bill.id} bill={r.bill} showDate hint={r.hint}
                        selecting={selecting} selected={selected.has(r.bill.id)} onToggle={() => toggle(r.bill.id)} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {/* ---------- selection bar ---------- */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 px-4 lg:bottom-6 lg:left-[248px]">
          <div className="mx-auto flex max-w-[520px] items-center gap-3 rounded-full border border-line bg-surface-3 py-2 pl-5 pr-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)]">
            <p className="ez-num flex-1 text-[13.5px] text-fg">{selected.size} selected</p>
            <button type="button" className="h-9 rounded-full px-3 text-[13.5px] font-medium text-dim hover:text-fg"
              onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map((r) => r.bill.id)))}>
              {selected.size === results.length ? 'Clear' : 'Select all'}
            </button>
            <button type="button" disabled={selected.size === 0} onClick={() => setConfirmDelete(true)} className="ez-btn ez-btn--ghost ez-btn--sm border-fg/40 disabled:opacity-40">Delete</button>
          </div>
        </div>
      )}

      <Sheet open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${plural(selected.size, 'bill')}?`}
        body="They leave your totals and cannot be brought back.">
        <Dialog.Close className="ez-btn ez-btn--ghost">Keep them</Dialog.Close>
        <button type="button" disabled={working} className="ez-btn border-fg/40 text-fg hover:bg-surface-3 disabled:opacity-60"
          onClick={() => remove([...selected], () => { setConfirmDelete(false); stopSelecting(); })}>
          {working ? 'Deleting' : 'Delete'}
        </button>
      </Sheet>

      <Sheet open={reviewDuplicates} onOpenChange={setReviewDuplicates} title="Saved twice?"
        body="Tick the ones that are the same purchase. The first copy is kept; nothing unticked is touched."
        list={(
          <ul className="-mx-1 mt-4 max-h-[46vh] space-y-2 overflow-y-auto p-1">
            {duplicates.map((g) => <DuplicateRow key={g.key} group={g} checked={removeGroups.has(g.key)}
              onToggle={() => setRemoveGroups((prev) => { const next = new Set(prev); if (next.has(g.key)) next.delete(g.key); else next.add(g.key); return next; })} />)}
          </ul>
        )}>
        <Dialog.Close className="ez-btn ez-btn--ghost">Keep all</Dialog.Close>
        <button type="button" disabled={working || copiesToRemove.length === 0} className="ez-btn border-fg/40 text-fg hover:bg-surface-3 disabled:opacity-40"
          onClick={() => remove(copiesToRemove, () => setReviewDuplicates(false))}>
          {working ? 'Removing' : `Remove ${plural(copiesToRemove.length, 'copy', 'copies')}`}
        </button>
      </Sheet>
    </>
  );
}

/* Its own component so the hook runs inside the shell, where the Add a bill sheet lives. */
function NoBills() {
  const openCapture = useCapture();
  return (
    <Message title="No bills yet." body="Scan a paper bill, upload a PDF, or connect Gmail. Every bill you add is kept here.">
      <button type="button" className="ez-btn ez-btn--primary" onClick={openCapture}>Add a bill</button>
    </Message>
  );
}

function DuplicateRow({ group, checked, onToggle }: { group: DuplicateGroup<Bill>; checked: boolean; onToggle: () => void }) {
  const first = group.bills[0];
  const date = new Date(`${first.expense_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
        className="flex w-full items-start gap-3.5 rounded-2xl border border-line-soft bg-surface px-3.5 py-3 text-left hover:border-line">
        <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border', checked ? 'border-brand bg-brand text-on-brand' : 'border-line text-transparent')}>
          <Check className="h-4 w-4" strokeWidth={2.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold leading-snug text-fg">{first.merchant || first.title}</span>
            <span className="ez-num shrink-0 text-[14.5px] text-fg">{formatAmount(Number(first.amount))}</span>
          </span>
          <span className="ez-num block text-[12px] text-faint">{date} · {group.bills.length} copies</span>
          <span className="mt-1 block text-[13px] text-dim">
            {group.reason === 'invoice' ? 'Same invoice number.' : 'Same shop, amount and day. Could be two purchases.'}
          </span>
        </span>
      </button>
    </li>
  );
}

function Sheet({ open, onOpenChange, title, body, list, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; body: string; list?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="ez-app fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-line bg-surface-2 p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dialog.Title className="ez-display text-[26px] text-fg">{title}</Dialog.Title>
          <Dialog.Description className="mt-2.5 text-[14.5px] text-dim">{body}</Dialog.Description>
          {list}
          <div className="mt-6 flex justify-end gap-2.5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="ez-display text-[30px] text-fg">{title}</h2>
      <p className="mt-3 text-dim">{body}</p>
      <div className="mt-7 flex justify-center">{children}</div>
    </div>
  );
}
