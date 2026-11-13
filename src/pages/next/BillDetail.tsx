import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  AlertTriangle, Check, ChevronRight, FileText, Headphones, Mail, MoreHorizontal, Nfc, Pencil, PenLine,
  RotateCcw, ScanLine, ShieldCheck, Trash2, Upload, Users, type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import AppShell from '@/components/next/AppShell';
import Slip from '@/components/next/Slip';
import SEO from '@/components/SEO';
import { useToast } from '@/hooks/use-toast';
import { deleteBills } from '@/lib/bill-actions';
import { billCategory, type BroadCategory } from '@/lib/bill-category';
import { checkBillMath, formatAmount, parseBillDescription, SOURCE_LABEL, type BillSource } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import { getReminder, reminderEndDate } from '@/lib/return-reminders';
import type { Expense } from '@/lib/types';
import { cn } from '@/lib/utils';

const SOURCE_ICON: Record<BillSource, LucideIcon> = {
  nfc: Nfc, email: Mail, scan: ScanLine, upload: Upload, manual: PenLine, unknown: FileText,
};

/* Returns and warranties only make sense for things you keep. */
const KEEPABLE: BroadCategory[] = ['Shopping', 'Office', 'Education', 'Other'];

const DAY = 24 * 60 * 60 * 1000;
const billDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const query = useQuery({
    queryKey: ['bill', id],
    enabled: !!id,
    queryFn: async () => {
      const [billRes, receiptRes, splitRes] = await Promise.all([
        supabase.from('expenses').select('*').eq('id', id!).maybeSingle(),
        supabase.from('expense_receipts').select('*').eq('expense_id', id!).limit(1),
        supabase.from('bill_splits').select('id, friend_name, amount, is_self, status').eq('expense_id', id!),
      ]);
      if (billRes.error) throw billRes.error;
      const receipt = receiptRes.data?.[0] ?? null;
      let originalUrl: string | null = null;
      if (receipt) {
        const { data } = await supabase.storage.from('receipts').createSignedUrl(receipt.file_path, 3600);
        originalUrl = data?.signedUrl ?? null;
      }
      return { bill: billRes.data as unknown as Expense | null, receipt, originalUrl, splits: splitRes.data ?? [] };
    },
  });

  const bill = query.data?.bill;

  const handleDelete = async () => {
    if (!bill) return;
    setDeleting(true);
    const error = await deleteBills([bill.id]);
    setDeleting(false);
    if (error) {
      toast({ title: 'This bill was not deleted', description: 'Check your connection and try again.', variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['bills'] });
    toast({ title: 'Bill deleted' });
    navigate('/expenses');
  };

  const menu = bill && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More" className="grid h-10 w-10 place-items-center rounded-full border border-line-soft text-dim hover:bg-surface-3 hover:text-fg">
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="ez-app w-52 rounded-2xl border-line bg-surface-2 p-1.5 text-fg shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)]">
        <DropdownMenuItem className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-fg focus:bg-surface-3 focus:text-fg" onSelect={() => navigate(`/expenses/new?edit=${bill.id}`)}>
          <Pencil className="h-4 w-4 text-dim" /> Edit bill
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-fg focus:bg-surface-3 focus:text-fg" onSelect={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4 text-dim" /> Delete bill
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (query.isLoading) {
    return (
      <AppShell back={{ to: '/expenses', label: 'Bills' }}>
        <div className="pt-6 lg:pt-12" aria-busy="true" aria-label="Loading this bill">
          <div className="h-3 w-28 rounded-full bg-surface-3" />
          <div className="mt-5 h-10 w-64 rounded-2xl bg-surface-2" />
          <div className="mt-8 h-80 w-full max-w-[380px] rounded-2xl bg-surface-2" />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !bill) {
    return (
      <AppShell back={{ to: '/expenses', label: 'Bills' }}>
        <div className="mx-auto max-w-md pt-24 text-center">
          <h1 className="ez-display text-[34px] text-fg">{query.isError ? 'This bill did not load.' : 'This bill is not here.'}</h1>
          <p className="mt-3 text-dim">{query.isError ? 'Check your connection, then try again.' : 'It may have been deleted, or the link is wrong.'}</p>
          <div className="mt-7 flex justify-center">
            {query.isError
              ? <button type="button" className="ez-btn ez-btn--ghost" onClick={() => query.refetch()}>Try again</button>
              : <Link to="/expenses" className="ez-btn ez-btn--ghost">All bills</Link>}
          </div>
        </div>
      </AppShell>
    );
  }

  const { receipt, originalUrl, splits } = query.data!;
  const parsed = parseBillDescription(bill.description);
  const total = Number(bill.amount);
  const symbol = getCurrencySymbol(bill.currency || 'INR');
  const category = billCategory(bill);
  const merchant = bill.merchant || bill.title;
  const payment = parsed.payment || bill.cost_center || null;
  const math = checkBillMath(parsed, total);
  const added = new Date(bill.created_at);
  const dateLine = billDay(bill.expense_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const addedLine = `${added.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${added.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  const place = [parsed.address, parsed.table].filter(Boolean).join(' · ');

  const others = splits.filter((s) => !s.is_self);
  const unpaid = others.filter((s) => s.status === 'pending');
  const splitLine = others.length === 0
    ? 'Share it with the people you were with'
    : `${others.map((s) => s.friend_name).slice(0, 2).join(', ')}${others.length > 2 ? ` and ${others.length - 2} more` : ''} · ${unpaid.length ? `${formatAmount(unpaid.reduce((s, x) => s + Number(x.amount), 0), { symbol })} to collect` : 'all settled'}`;

  const reminder = getReminder(bill.id);
  const returnEnd = reminder ? reminderEndDate(reminder) : null;
  const returnDays = returnEnd ? Math.round((returnEnd.getTime() - Date.now()) / DAY) : null;
  const keepable = KEEPABLE.includes(category) || !!reminder;

  return (
    <AppShell back={{ to: '/expenses', label: 'Bills' }} actions={menu}>
      <SEO title={merchant} description={`Bill from ${merchant}`} path={`/expenses/${bill.id}`} />

      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-x-20 lg:pt-12">
        {/* ---------- what it is ---------- */}
        <header className="ez-rise pt-3 lg:col-start-2 lg:row-start-1 lg:pt-0">
          <nav className="mb-7 hidden items-center justify-between lg:flex" aria-label="Breadcrumb">
            <p className="flex items-center gap-2 text-[14px] text-dim">
              <Link to="/expenses" className="hover:text-fg">Bills</Link>
              <ChevronRight className="h-3.5 w-3.5 text-faint" />
              <span className="text-fg">{merchant}</span>
            </p>
            <div className="flex items-center gap-2">
              <Link to={`/expenses/new?edit=${bill.id}`} className="ez-btn ez-btn--ghost ez-btn--sm"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
              {menu}
            </div>
          </nav>
          <p className="ez-label">{category}</p>
          <h1 className="ez-display mt-3.5 text-[38px] text-fg lg:text-[54px]">{merchant}</h1>
          <p className="mt-3 text-[14.5px] text-dim">{dateLine}{parsed.table && ` · ${parsed.table}`}</p>
        </header>

        {/* ---------- the bill itself, on paper ---------- */}
        <div className="mt-7 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <div className="mx-auto max-w-[372px] lg:sticky lg:top-[108px] lg:max-w-none">
            <Slip print detailed merchant={merchant} sub={place || null} items={parsed.items}
              subtotal={parsed.subtotal} tax={parsed.tax} taxDetails={parsed.taxDetails} discount={parsed.discount}
              total={total} symbol={symbol}
              foot={<>{payment ? `Paid via ${payment}` : null}{payment && parsed.invoice ? <br /> : null}{parsed.invoice ? `Invoice ${parsed.invoice}` : null}</>} />

            {math.status === 'ok' && (
              <p className="ez-num mt-5 flex items-center justify-center gap-2 text-[12.5px] text-brand-text">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                {math.viaTax
                  ? `Items${parsed.tax ? ', tax' : ''}${parsed.discount ? ', discount' : ''} add up to `
                  : `${parsed.items.length} ${parsed.items.length === 1 ? 'item adds' : 'items add'} up to `}
                {formatAmount(total, { symbol })}
              </p>
            )}
            {math.status === 'mismatch' && (
              <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dim" />
                <p className="text-[13.5px] leading-snug text-dim">
                  The items add up to <span className="ez-num text-fg">{formatAmount(math.itemsSum, { symbol })}</span>, the total says <span className="ez-num text-fg">{formatAmount(math.expected, { symbol })}</span>.
                  {' '}<span className="ez-num text-gilt">{formatAmount(Math.abs(math.diff), { symbol })}</span> is {math.diff > 0 ? 'not on any line. It may be tax or a fee.' : 'more than the total. A discount may be missing.'}
                  {' '}<Link to={`/expenses/new?edit=${bill.id}`} className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">Check the bill</Link>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          {/* ---------- what you can do with it ---------- */}
          <section className="ez-rise mt-9" style={{ animationDelay: '.08s' }} aria-label="Actions">
            <ul className="ez-card divide-y divide-line-soft overflow-hidden">
              <HubRow icon={Users} title="Split" detail={splitLine} to={`/expenses/${bill.id}/split`} />
              <HubRow icon={Headphones} title="Smart Support" detail={`Help with this bill from ${merchant}`} to={`/expenses/${bill.id}/support`} />
              {keepable && (
                <HubRow icon={RotateCcw} title="Return window"
                  detail={returnEnd && returnDays !== null
                    ? (returnDays >= 0 ? `Closes ${returnEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${returnDays === 0 ? 'last day' : `${returnDays} ${returnDays === 1 ? 'day' : 'days'} left`}` : 'Closed')
                    : 'Set a reminder before it closes'}
                  urgent={returnDays !== null && returnDays >= 0 && returnDays <= 3}
                  to={`/expenses/${bill.id}/support`} />
              )}
              {keepable && <HubRow icon={ShieldCheck} title="Warranty vault" detail="Add a warranty for this purchase" to="/warranties" />}
            </ul>
          </section>

          {/* ---------- where it came from ---------- */}
          <section className="ez-rise mt-9" style={{ animationDelay: '.14s' }} aria-labelledby="sources-label">
            <p id="sources-label" className="ez-label">Where it came from</p>
            <ul className="ez-card mt-4 divide-y divide-line-soft overflow-hidden">
              <li className="flex items-center gap-3.5 px-4 py-3.5">
                <SourceIcon icon={SOURCE_ICON[parsed.source]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-snug text-fg">{SOURCE_LABEL[parsed.source] || 'Added to EZZ BILL'}</span>
                  <span className="block truncate text-[13px] text-dim">
                    {parsed.source === 'email' && parsed.emailSubject ? parsed.emailSubject : [parsed.table, `Added ${addedLine}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
              {receipt && (
                <li>
                  <button type="button" onClick={() => setShowOriginal((v) => !v)} aria-expanded={showOriginal}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-surface-3">
                    <SourceIcon icon={FileText} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-snug text-fg">Original bill</span>
                      <span className="block truncate text-[13px] text-dim">{receipt.file_name}</span>
                    </span>
                    <span className="text-[13.5px] font-medium text-brand-text">{showOriginal ? 'Hide' : 'View'}</span>
                  </button>
                  {showOriginal && (
                    <div className="border-t border-line-soft bg-surface p-3">
                      {!originalUrl ? (
                        <p className="py-8 text-center text-[14px] text-dim">The original file could not be opened.</p>
                      ) : receipt.file_name.toLowerCase().endsWith('.pdf') ? (
                        <iframe src={originalUrl} title="Original bill" className="h-[70vh] w-full rounded-xl bg-paper" />
                      ) : (
                        <img src={originalUrl} alt={`Original bill from ${merchant}`} className="mx-auto max-h-[70vh] rounded-xl" />
                      )}
                    </div>
                  )}
                </li>
              )}
            </ul>
          </section>

          {/* ---------- the rest of what was on it ---------- */}
          <section className="ez-rise mt-9" style={{ animationDelay: '.2s' }} aria-labelledby="details-label">
            <p id="details-label" className="ez-label">Details</p>
            <dl className="ez-card mt-4 divide-y divide-line-soft px-4">
              <Detail label="Category">{category}</Detail>
              {payment && <Detail label="Paid with">{payment}</Detail>}
              {parsed.invoice && <Detail label="Invoice no." mono>{parsed.invoice}</Detail>}
              {parsed.aggregator && <Detail label="Ordered through">{parsed.aggregator}</Detail>}
              {parsed.address && <Detail label="Address">{parsed.address}</Detail>}
              {parsed.notes && <Detail label="Note">{parsed.notes}</Detail>}
            </dl>
          </section>
        </div>
      </div>

      <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <AlertDialog.Content className="ez-app fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-line bg-surface-2 p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <AlertDialog.Title className="ez-display text-[26px] text-fg">Delete this bill?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-[14.5px] text-dim">
              {merchant}, {formatAmount(total, { symbol })}. It leaves your totals and cannot be brought back.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2.5">
              <AlertDialog.Cancel className="ez-btn ez-btn--ghost">Keep it</AlertDialog.Cancel>
              <button type="button" disabled={deleting} onClick={handleDelete}
                className="ez-btn border-fg/40 text-fg hover:bg-surface-3 disabled:opacity-60">
                {deleting ? 'Deleting' : 'Delete bill'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </AppShell>
  );
}

function SourceIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-dim">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  );
}

function HubRow({ icon: Icon, title, detail, to, urgent }: { icon: LucideIcon; title: string; detail: string; to: string; urgent?: boolean }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-brand-text">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold leading-snug text-fg">{title}</span>
          <span className={cn('block truncate text-[13px]', urgent ? 'text-fg' : 'text-dim')}>{detail}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}

function Detail({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5">
      <dt className="shrink-0 text-[14px] text-dim">{label}</dt>
      <dd className={cn('min-w-0 text-right text-[14.5px] text-fg', mono && 'ez-num text-[13.5px]')}>{children}</dd>
    </div>
  );
}
