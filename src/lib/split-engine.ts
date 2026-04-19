// Smart Split calculation engine

export interface SplitLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface SplitParticipant {
  id: string;            // 'self' or friend.id
  name: string;
  isSelf: boolean;
  // assigned line item indexes (for custom)
  items: number[];
}

export interface SplitTotals {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export interface ComputedShare {
  id: string;
  name: string;
  isSelf: boolean;
  itemSubtotal: number;
  taxShare: number;
  discountShare: number;
  amount: number;       // final
}

/**
 * Compute per-person shares.
 * mode 'equal' divides total by n.
 * mode 'custom' uses item assignments + tax/discount distribution.
 */
export function computeShares(
  participants: SplitParticipant[],
  items: SplitLineItem[],
  totals: SplitTotals,
  mode: 'equal' | 'custom',
  taxDiscountMode: 'proportional' | 'equal' = 'proportional'
): ComputedShare[] {
  const n = participants.length || 1;

  if (mode === 'equal' || items.length === 0) {
    const share = totals.total / n;
    const rounded = participants.map(p => ({
      id: p.id, name: p.name, isSelf: p.isSelf,
      itemSubtotal: 0, taxShare: 0, discountShare: 0,
      amount: Math.round(share * 100) / 100,
    }));
    // adjust last to sum to total
    const sum = rounded.reduce((s, r) => s + r.amount, 0);
    const diff = Math.round((totals.total - sum) * 100) / 100;
    if (rounded.length > 0) rounded[rounded.length - 1].amount = Math.round((rounded[rounded.length - 1].amount + diff) * 100) / 100;
    return rounded;
  }

  // CUSTOM
  // Step 1: per-person item subtotal (split each item equally among assigned)
  const subtotals = participants.map(() => 0);
  items.forEach((item, idx) => {
    const assignees: number[] = [];
    participants.forEach((p, pi) => { if (p.items.includes(idx)) assignees.push(pi); });
    if (assignees.length === 0) return;
    const per = (Number(item.total_price) || 0) / assignees.length;
    assignees.forEach(pi => { subtotals[pi] += per; });
  });

  const totalItemSubtotal = subtotals.reduce((s, x) => s + x, 0) || 1;
  const tax = totals.tax || 0;
  const discount = totals.discount || 0;
  const adjust = tax - discount; // additive net

  const shares: ComputedShare[] = participants.map((p, pi) => {
    let taxShare = 0;
    let discShare = 0;
    if (taxDiscountMode === 'proportional') {
      const ratio = subtotals[pi] / totalItemSubtotal;
      taxShare = tax * ratio;
      discShare = discount * ratio;
    } else {
      taxShare = tax / n;
      discShare = discount / n;
    }
    const amount = subtotals[pi] + taxShare - discShare;
    return {
      id: p.id, name: p.name, isSelf: p.isSelf,
      itemSubtotal: Math.round(subtotals[pi] * 100) / 100,
      taxShare: Math.round(taxShare * 100) / 100,
      discountShare: Math.round(discShare * 100) / 100,
      amount: Math.round(amount * 100) / 100,
    };
  });

  // Rounding adjustment: ensure sum == total
  const sum = shares.reduce((s, r) => s + r.amount, 0);
  const diff = Math.round((totals.total - sum) * 100) / 100;
  if (shares.length > 0 && Math.abs(diff) >= 0.01) {
    shares[shares.length - 1].amount = Math.round((shares[shares.length - 1].amount + diff) * 100) / 100;
  }
  return shares;
}

export function validateCustomSplit(
  participants: SplitParticipant[],
  items: SplitLineItem[]
): { valid: boolean; error?: string; unassigned: number[] } {
  const unassigned: number[] = [];
  items.forEach((_, idx) => {
    const has = participants.some(p => p.items.includes(idx));
    if (!has) unassigned.push(idx);
  });
  if (unassigned.length > 0) {
    return { valid: false, error: `${unassigned.length} item(s) unassigned`, unassigned };
  }
  if (participants.length === 0) {
    return { valid: false, error: 'Add at least one person', unassigned };
  }
  return { valid: true, unassigned: [] };
}
