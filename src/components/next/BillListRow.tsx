import { Link } from 'react-router-dom';
import { billCategory } from '@/lib/bill-category';
import { formatAmount, parseBillDescription, SOURCE_LABEL } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import type { Expense } from '@/lib/types';
import { CATEGORY_ICON } from './category-icon';

/** One bill in a list: who, what kind, how it arrived, how much. */
export default function BillListRow({ bill }: { bill: Expense }) {
  const category = billCategory(bill);
  const Icon = CATEGORY_ICON[category];
  const source = SOURCE_LABEL[parseBillDescription(bill.description).source];
  return (
    <Link to={`/expenses/${bill.id}`} className="group -mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-2.5 hover:bg-surface-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-soft bg-surface-2 text-dim group-hover:border-line">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-semibold leading-snug text-fg">{bill.merchant || bill.title}</span>
        <span className="block truncate text-[13px] text-dim">{category}{source && ` · ${source}`}</span>
      </span>
      <span className="ez-num shrink-0 text-[15px] text-fg">{formatAmount(Number(bill.amount), { symbol: getCurrencySymbol(bill.currency || 'INR') })}</span>
    </Link>
  );
}
