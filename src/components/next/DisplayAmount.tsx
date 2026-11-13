import { cn } from '@/lib/utils';

interface DisplayAmountProps {
  amount: number;
  /** Show paise. Off for headline totals, on for a bill's own total. */
  paise?: boolean;
  symbol?: string;
  className?: string;
}

/**
 * A big rupee figure in the display face. The symbol is set apart from the
 * digits, because Gloock's rupee sign runs into the numeral beside it.
 */
export default function DisplayAmount({ amount, paise = false, symbol = '₹', className }: DisplayAmountProps) {
  const digits = (Number(amount) || 0).toLocaleString('en-IN', paise
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 });
  return (
    <span className={cn('ez-display whitespace-nowrap', className)}>
      <span className="mr-[.09em]">{symbol}</span>{digits}
    </span>
  );
}
