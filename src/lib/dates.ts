/**
 * Calendar-day helpers. A date-only value ('2026-10-31') is that day wherever
 * the reader is; a full timestamp is the reader's local day at that instant.
 */
export function toDay(value?: string | null): Date | null {
  if (!value) return null;
  const only = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (only) return new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from today to that day: 0 is today, negative is in the past, null when there is no date. */
export function daysUntil(value?: string | null, now: Date = new Date()): number | null {
  const day = toDay(value);
  if (!day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86400000);
}

/** The same day N months on ('2026-01-31' + 1 = '2026-02-28'), or null when either part is missing. */
export function addMonths(value?: string | null, months?: number | null): string | null {
  const day = toDay(value);
  if (!day || !months || months < 0) return null;
  const target = new Date(day.getFullYear(), day.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day.getDate(), lastDay));
  return iso(target);
}

/** '31 Oct 2026'. The year is dropped with { year: false }. */
export function shortDate(value?: string | null, { year = true }: { year?: boolean } = {}): string {
  const day = toDay(value);
  if (!day) return '';
  return day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
}
