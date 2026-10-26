import { describe, it, expect } from "vitest";
import {
  computeIdealBudget, computeLeaks, leakGrade, safeDailySpend,
  type MoneyProfile,
} from "./leak-engine";

const baseProfile: MoneyProfile = {
  income_range: '50-100k',
  age_group: '25-34',
  city_tier: 'tier_1',
  living_situation: 'alone',
  job_type: 'office',
  financial_goal: 'balanced',
  money_profile_completed: true,
};

describe("computeIdealBudget", () => {
  it("carves out rent and EMI before budgeting spending", () => {
    const withRent = computeIdealBudget({ ...baseProfile, monthly_rent: 20000, monthly_emi: 5000 });
    const without = computeIdealBudget(baseProfile);
    expect(without.fixed).toBe(0);
    expect(withRent.fixed).toBe(25000);
    expect(withRent.discretionary).toBeLessThan(without.discretionary);
  });

  it("caps fixed commitments at 60% of income", () => {
    const b = computeIdealBudget({ ...baseProfile, monthly_rent: 500000, monthly_emi: 500000 });
    expect(b.fixed).toBe(45000); // 60% of 75000 midpoint
  });

  it("gives aggressive savers a smaller spending budget than lifestyle-first", () => {
    const save = computeIdealBudget({ ...baseProfile, financial_goal: 'save' });
    const lifestyle = computeIdealBudget({ ...baseProfile, financial_goal: 'lifestyle' });
    expect(save.totalBudget).toBeLessThan(lifestyle.totalBudget);
  });
});

describe("computeLeaks", () => {
  const now = new Date();
  const mk = (amount: number, merchant: string, dayOffset = 0) => ({
    amount,
    expense_date: new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() + dayOffset)).toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    merchant,
  });

  it("flags overspend as leak and reports the top merchant", () => {
    const thisMonth = [mk(25000, 'Swiggy'), mk(15000, 'Swiggy'), mk(8000, 'Zomato')];
    const r = computeLeaks(thisMonth, [], baseProfile, now);
    const food = r.perCategory.find(c => c.category === 'Food')!;
    expect(food.topMerchant).toBe('Swiggy');
    expect(food.leak).toBeGreaterThan(0);
    expect(r.totalLeak).toBeGreaterThan(0);
  });

  it("detects death-by-small-spends", () => {
    const thisMonth = Array.from({ length: 10 }, (_, i) => mk(150, `Cafe ${i}`));
    const r = computeLeaks(thisMonth, [], baseProfile, now);
    expect(r.smallSpends.count).toBe(10);
    expect(r.smallSpends.total).toBe(1500);
  });

  it("projects month-end pace mid-month", () => {
    const mid = new Date(now.getFullYear(), now.getMonth(), Math.max(4, now.getDate()));
    const spendPerDay = 500;
    const thisMonth = Array.from({ length: mid.getDate() }, () => mk(spendPerDay, 'Kiosk'));
    const r = computeLeaks(thisMonth, [], baseProfile, mid);
    expect(r.pacing).not.toBeNull();
    const daysInMonth = new Date(mid.getFullYear(), mid.getMonth() + 1, 0).getDate();
    expect(r.pacing!.projectedMonthEnd).toBe(Math.round((thisMonth.length / mid.getDate()) * daysInMonth) * spendPerDay);
  });

  it("reports nothing leaked when spending is zero", () => {
    const r = computeLeaks([], [], baseProfile, now);
    expect(r.totalLeak).toBe(0);
    expect(r.patterns).toHaveLength(0);
  });
});

describe("leakGrade", () => {
  it("maps scores to escalating grades", () => {
    expect(leakGrade(5).label).toBe('Sealed tight');
    expect(leakGrade(30).label).toBe('Nearly sealed');
    expect(leakGrade(50).label).toBe('Leaking');
    expect(leakGrade(70).label).toBe('Heavy leak');
    expect(leakGrade(90).label).toBe('Gushing');
  });
});

describe("safeDailySpend", () => {
  it("divides balance across days left", () => {
    expect(safeDailySpend(30000, 10)).toBe(3000);
    expect(safeDailySpend(0, 5)).toBe(0);
  });
});
