import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { lineAddsUp, type BillLineItem } from '@/lib/bill-format';

interface SlipProps {
  merchant: string;
  /** Line under the merchant name, e.g. "Koregaon Park · Table 3". */
  sub?: string | null;
  items: BillLineItem[];
  /** Show at most this many item lines, then "+ n more". */
  maxItems?: number;
  subtotal?: number | null;
  tax?: number | null;
  taxDetails?: string | null;
  discount?: number | null;
  /** Service charge, packing, delivery, a tip. */
  charges?: number | null;
  total: number;
  symbol?: string;
  /** Last line on the paper, e.g. "Paid via UPI". */
  foot?: ReactNode;
  /** Unit prices under each line. Off for the compact slip on Home. */
  detailed?: boolean;
  /** Play the print-out animation once. */
  print?: boolean;
  className?: string;
}

const plain = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The thermal slip: the one light surface in the app. A bill is shown the
 * way it was printed, in mono on paper, with a torn zig-zag foot.
 */
export default function Slip({
  merchant, sub, items, maxItems, subtotal, tax, taxDetails, discount, charges, total,
  symbol = '₹', foot, detailed = false, print = false, className,
}: SlipProps) {
  const shown = maxItems ? items.slice(0, maxItems) : items;
  const hidden = items.length - shown.length;
  const hasBreakdown = Boolean(subtotal || tax || discount || charges);

  return (
    <div className={cn('ez-slip-wrap', print && 'ez-print', className)}>
      <div className="ez-slip">
        <p className="ez-slip__merchant">{merchant}</p>
        {sub && <p className="ez-slip__sub">{sub}</p>}

        {shown.length > 0 && (
          <>
            <hr className="ez-slip__rule" />
            <ul className={cn('m-0 list-none p-0', detailed && 'space-y-2')}>
              {shown.map((item, i) => (
                <li key={i}>
                  <div className="ez-slip__row">
                    <span>
                      <span className="ez-slip__dim">{item.quantity}</span>
                      <span className="pl-[1ch]">{item.name}</span>
                    </span>
                    <span>{plain(item.total_price)}</span>
                  </div>
                  {detailed && item.quantity > 1 && lineAddsUp(item) && (
                    <p className="ez-slip__dim pl-[2ch] text-[12px]">@ {plain(item.unit_price)} each</p>
                  )}
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="ez-slip__dim mt-1">+ {hidden} more</p>}
          </>
        )}

        <hr className="ez-slip__rule" />

        {hasBreakdown && (
          <div className="mb-3 space-y-0.5">
            {subtotal ? <div className="ez-slip__row ez-slip__dim"><span>Subtotal</span><span>{plain(subtotal)}</span></div> : null}
            {tax ? <div className="ez-slip__row ez-slip__dim"><span>{taxDetails ? `GST (${taxDetails})` : 'Tax'}</span><span>{plain(tax)}</span></div> : null}
            {charges ? <div className="ez-slip__row ez-slip__dim"><span>Other charges</span><span>{plain(charges)}</span></div> : null}
            {discount ? <div className="ez-slip__row ez-slip__dim"><span>Discount</span><span>-{plain(discount)}</span></div> : null}
          </div>
        )}

        <div className="ez-slip__total">
          <span>TOTAL</span>
          <b><span className="mr-[.05em]">{symbol}</span>{plain(total)}</b>
        </div>

        {foot && <p className="ez-slip__sub mt-3">{foot}</p>}
      </div>
    </div>
  );
}
