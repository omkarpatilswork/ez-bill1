import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import SEO from '@/components/SEO';
import { useAuth } from '@/hooks/useAuth';
import { useBills } from '@/hooks/useBills';
import { useToast } from '@/hooks/use-toast';
import { billCategory, type BroadCategory } from '@/lib/bill-category';
import { getCurrencySymbol } from '@/lib/countries';
import { incomeMidpoint, type IncomeRange } from '@/lib/leak-engine';
import { cn } from '@/lib/utils';

const shiftMonth = (d: Date, by: number) => new Date(d.getFullYear(), d.getMonth() + by, 1);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const plain = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The month as one statement, printed the way a bill is: on paper, in mono.
 * "Save as PDF" photographs the sheet and cuts it into A4 pages.
 *
 * Every bill counts, drafts included (see AGENTS.md). Income has no
 * transactional source: it is the midpoint of the range in the profile and
 * is labelled as an estimate, or left out with a prompt when no range is set.
 */
export default function MonthlySummary() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const billsQuery = useBills();
  const { bills } = billsQuery;
  const sheet = useRef<HTMLDivElement>(null);
  const thisMonth = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); }, []);
  const [month, setMonth] = useState(thisMonth);
  const [exporting, setExporting] = useState(false);

  const currency = profile?.default_currency || 'INR';
  const symbol = getCurrencySymbol(currency);
  const money = (n: number) => `${symbol}${Math.round(n).toLocaleString('en-IN')}`;

  const view = useMemo(() => {
    const key = monthKey(month);
    const all = bills.filter((b) => b.expense_date.slice(0, 7) === key);
    const mine = all.filter((b) => (b.currency || 'INR') === currency);
    const spend = mine.reduce((s, b) => s + Number(b.amount), 0);
    const byCategory = new Map<BroadCategory, number>();
    for (const b of mine) byCategory.set(billCategory(b), (byCategory.get(billCategory(b)) || 0) + Number(b.amount));
    const range = (profile?.income_range || null) as IncomeRange | null;
    const income = range ? incomeMidpoint(range) : null;
    return {
      mine, spend, others: all.length - mine.length,
      categories: [...byCategory.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      income, net: income === null ? null : income - spend,
    };
  }, [bills, month, currency, profile?.income_range]);

  const title = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const savePdf = async () => {
    const el = sheet.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      // Loaded on demand: these two are large and only needed for this button.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
      await new Promise((r) => requestAnimationFrame(() => r(null))); // let the flat, mask-free sheet paint
      const paper = getComputedStyle(el).backgroundColor;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: paper, useCORS: true, logging: false });
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = 210, pageH = 297, margin = 12;
      const pxPerMm = canvas.width / (pageW - margin * 2);
      const slicePx = Math.floor((pageH - margin * 2) * pxPerMm);
      for (let done = 0, page = 0; done < canvas.height; done += slicePx, page += 1) {
        const h = Math.min(slicePx, canvas.height - done);
        const slice = document.createElement('canvas');
        slice.width = canvas.width; slice.height = h;
        slice.getContext('2d')!.drawImage(canvas, 0, done, canvas.width, h, 0, 0, canvas.width, h);
        if (page > 0) pdf.addPage();
        pdf.setFillColor(paper.startsWith('rgb') ? paper : '#F2EFE6');
        pdf.rect(0, 0, pageW, pageH, 'F');
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageW - margin * 2, h / pxPerMm);
      }
      pdf.save(`EZZ-BILL-${title.replace(' ', '-')}.pdf`);
    } catch (err) {
      console.error('PDF export failed', err);
      toast({ title: 'The PDF was not created', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <SEO title="Monthly Summary" description="The month as one statement: what came in, what went out, and every bill." path="/summary" />
      <div className="max-w-[1000px]">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-6 lg:pt-9">
          <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Monthly Summary</h1>
          <div className="mb-1 flex items-center gap-1 lg:mb-2.5">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}
              className="grid h-9 w-9 place-items-center rounded-full border border-line-soft text-dim hover:border-line hover:text-fg"><ChevronLeft className="h-4 w-4" /></button>
            <span className="ez-num min-w-[118px] text-center text-[13px] text-fg">{title}</span>
            <button type="button" aria-label="Next month" disabled={month.getTime() === thisMonth.getTime()} onClick={() => setMonth(shiftMonth(month, 1))}
              className="grid h-9 w-9 place-items-center rounded-full border border-line-soft text-dim hover:border-line hover:text-fg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            <button type="button" onClick={savePdf} disabled={exporting || view.mine.length === 0} className="ez-btn ez-btn--ghost ez-btn--sm ml-2 disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> {exporting ? 'Creating the PDF' : 'Save as PDF'}
            </button>
          </div>
        </header>

        {billsQuery.isError ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <h2 className="ez-display text-[30px] text-fg">Your bills did not load.</h2>
            <p className="mt-3 text-dim">Check your connection, then try again.</p>
            <button type="button" className="ez-btn ez-btn--ghost mt-7" onClick={() => billsQuery.refetch()}>Try again</button>
          </div>
        ) : !billsQuery.ready ? (
          <div className="mt-8 h-96 max-w-[560px] rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" />
        ) : (
          <div className="mt-8 max-w-[560px]">
            <div className={cn(!exporting && 'ez-slip-wrap ez-print')}>
              <div ref={sheet} className={cn('ez-slip !px-6 !pt-8 sm:!px-9', exporting && 'ez-slip--flat')}>
                <p className="ez-slip__merchant">EZZ BILL</p>
                <p className="ez-slip__sub">Statement for {title}</p>
                {profile?.full_name && <p className="ez-slip__sub">{profile.full_name}</p>}

                <hr className="ez-slip__rule" />
                {view.income !== null ? (
                  <div className="ez-slip__row"><span>Income <span className="ez-slip__dim">(est. from profile)</span></span><span>{plain(view.income)}</span></div>
                ) : (
                  <div className="ez-slip__row ez-slip__dim"><span>Income</span><span>not set</span></div>
                )}
                <div className="ez-slip__row"><span>Bills <span className="ez-slip__dim">({view.mine.length})</span></span><span>{plain(view.spend)}</span></div>

                <hr className="ez-slip__rule" />
                <div className="ez-slip__total">
                  <span>{view.net === null ? 'SPENT' : view.net >= 0 ? 'LEFT OVER' : 'OVER INCOME'}</span>
                  <b><span className="mr-[.05em]">{symbol}</span>{Math.round(Math.abs(view.net ?? view.spend)).toLocaleString('en-IN')}</b>
                </div>

                {view.categories.length > 0 && (
                  <>
                    <hr className="ez-slip__rule" />
                    <p className="mb-2 font-medium tracking-[.1em]">WHERE IT WENT</p>
                    {view.categories.map((c) => (
                      <div key={c.name} className="ez-slip__row">
                        <span>{c.name}</span>
                        <span><span className="ez-slip__dim pr-[2ch]">{Math.round((c.amount / view.spend) * 100)}%</span>{plain(c.amount)}</span>
                      </div>
                    ))}

                    <hr className="ez-slip__rule" />
                    <p className="mb-2 font-medium tracking-[.1em]">EVERY BILL</p>
                    {view.mine.map((b) => (
                      <div key={b.id} className="ez-slip__row">
                        <span className="truncate">
                          <span className="ez-slip__dim">{new Date(`${b.expense_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                          <span className="pl-[1.5ch]">{b.merchant || b.title}</span>
                        </span>
                        <span>{plain(Number(b.amount))}</span>
                      </div>
                    ))}
                  </>
                )}

                <hr className="ez-slip__rule" />
                <p className="ez-slip__sub">
                  {view.mine.length === 0 ? 'No bills in this month.' : `${view.mine.length} ${view.mine.length === 1 ? 'bill' : 'bills'} · ${money(view.spend)}`}
                  {view.others > 0 && ` · ${view.others} in another currency not counted`}
                </p>
                <p className="ez-slip__sub">Printed {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>

            {view.income === null && (
              <p className="mt-6 text-[14px] text-dim">
                Income is not set, so this shows what went out only.{' '}
                <Link to="/profile" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">Set it in Profile</Link>
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
