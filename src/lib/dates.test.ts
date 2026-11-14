import { describe, expect, it } from 'vitest';
import { addMonths, daysUntil, shortDate } from './dates';
import { monthlyCost, nextCharge } from './renewals';

const NOW = new Date(2026, 9, 19, 13, 20); // 19 Oct 2026, 13:20

describe('daysUntil', () => {
  it('counts whole calendar days, whatever the time of day', () => {
    expect(daysUntil('2026-10-31', NOW)).toBe(12);
    expect(daysUntil('2026-10-19', NOW)).toBe(0);
    expect(daysUntil('2026-10-18', NOW)).toBe(-1);
  });
  it('has no answer without a date', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('not a date', NOW)).toBeNull();
  });
});

describe('addMonths', () => {
  it('lands on the same day of the month', () => expect(addMonths('2026-10-16', 12)).toBe('2027-10-16'));
  it('stops at the end of a shorter month', () => expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'));
  it('needs both a date and a number of months', () => {
    expect(addMonths('', 12)).toBeNull();
    expect(addMonths('2026-10-16', null)).toBeNull();
  });
});

describe('shortDate', () => {
  it('prints day, month and year', () => expect(shortDate('2026-10-31')).toBe('31 Oct 2026'));
  it('prints nothing for no date', () => expect(shortDate(null)).toBe(''));
});

describe('monthlyCost', () => {
  it('spreads a yearly price over twelve months', () => expect(monthlyCost(1499, 'yearly')).toBeCloseTo(124.92, 2));
  it('counts 52 weeks a year for a weekly price', () => expect(monthlyCost(60, 'weekly')).toBe(260));
  it('treats an unknown cycle as monthly', () => expect(monthlyCost(649, null)).toBe(649));
});

describe('nextCharge', () => {
  it('uses the date the provider stated while it is ahead', () => {
    const next = nextCharge({ next_billing_date: '2026-10-22', billing_cycle: 'monthly' }, NOW);
    expect(next?.estimated).toBe(false);
    expect(next?.date.getDate()).toBe(22);
  });
  it('works one out from the last charge when the stated date has passed, and says so', () => {
    const next = nextCharge({ next_billing_date: '2026-09-22', last_email_date: '2026-09-22', billing_cycle: 'monthly' }, NOW);
    expect(next?.estimated).toBe(true);
    expect(next!.date.getTime()).toBeGreaterThanOrEqual(new Date(2026, 9, 19).getTime());
  });
  it('has no answer with no dates at all', () => expect(nextCharge({}, NOW)).toBeNull());
});
