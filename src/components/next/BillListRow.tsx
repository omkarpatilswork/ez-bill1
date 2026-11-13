import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { billCategory } from '@/lib/bill-category';
import { formatAmount, parseBillDescription, SOURCE_LABEL } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import type { Expense } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CATEGORY_ICON } from './category-icon';

interface BillListRowProps {
  bill: Expense;
  /** Show the bill date under the amount (lists that are not grouped by day). */
  showDate?: boolean;
  /** Replaces the "category · source" line, e.g. the item a search matched. */
  hint?: string | null;
  /** Selection mode: the row toggles instead of opening the bill. */
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

const ROW = 'group -mx-2 flex w-[calc(100%+16px)] items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-2';

/** One bill in a list: who, what kind, how it arrived, how much. */
export default function BillListRow({ bill, showDate, hint, selecting, selected, onToggle }: BillListRowProps) {
  const category = billCategory(bill);
  const Icon = CATEGORY_ICON[category];
  const source = SOURCE_LABEL[parseBillDescription(bill.description).source];
  const date = new Date(`${bill.expense_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const body = (
    <>
      {selecting ? (
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', selected ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface-2 text-transparent')}>
          <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </span>
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-soft bg-surface-2 text-dim group-hover:border-line">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-semibold leading-snug text-fg">{bill.merchant || bill.title}</span>
        <span className={cn('block truncate text-[13px]', hint ? 'text-fg' : 'text-dim')}>{hint || `${category}${source ? ` · ${source}` : ''}`}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="ez-num block text-[15px] text-fg">{formatAmount(Number(bill.amount), { symbol: getCurrencySymbol(bill.currency || 'INR') })}</span>
        {showDate && <span className="ez-num block text-[12px] text-faint">{date}</span>}
      </span>
    </>
  );

  if (selecting) {
    return <button type="button" role="checkbox" aria-checked={!!selected} onClick={onToggle} className={ROW}>{body}</button>;
  }
  return <Link to={`/expenses/${bill.id}`} className={ROW}>{body}</Link>;
}
