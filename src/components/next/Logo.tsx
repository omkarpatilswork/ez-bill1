import { cn } from '@/lib/utils';

/** The receipt mark: an emerald slip with a torn foot and three ink lines. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 26" className={cn('h-[26px] w-[22px] shrink-0', className)} aria-hidden="true">
      <path d="M2 1.5h18v21l-3-2-3 2-3-2-3 2-3-2-3 2z" fill="#3FAF7D" />
      <path d="M6 7h10M6 11h10M6 15h6" stroke="#0A110E" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-fg', className)}>
      <LogoMark />
      <span className="ez-wordmark text-[14px]">EZZ BILL</span>
    </span>
  );
}
