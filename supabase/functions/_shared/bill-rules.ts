/**
 * Rules applied to what the model reads off a bill.
 *
 * A model is good at finding text on a crumpled receipt and bad at being
 * consistent about conventions. So the model transcribes, and the things a
 * rule can decide are decided here, the same way every time:
 *
 *   - which of "04/11/26" is the day (India prints day first);
 *   - what counts as an invoice number;
 *   - whether the numbers on the bill agree with each other.
 *
 * Measured against the evaluation set (scripts/eval): the reader before these
 * rules read five day-first dates as month-first.
 *
 * Pure functions, no Deno or network APIs.
 */

export type Extraction = Record<string, unknown>;

const NOT_FOUND = "Not Found";
const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === "" || String(v).trim().toLowerCase() === "not found";
const num = (v: unknown): number | null => {
  if (isBlank(v)) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pad = (n: number) => String(n).padStart(2, "0");
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A date printed in numbers, read day first: "04/11/26 19:39" is 4 November 2026.
 * Month-first is used only when day-first is impossible ("11/23/2025").
 * Returns "YYYY-MM-DD HH:MM:SS", or null when the text is not a numeric date
 * ("May 17 2025", "19th Jun, 2025"), which the model already normalises well.
 */
export function dayFirstDate(printed: unknown): string | null {
  if (isBlank(printed)) return null;
  const text = String(printed).trim();
  const m = /(?<![\d.])(\d{1,4})\s?[/.\-]\s?(\d{1,2})\s?[/.\-]\s?(\d{1,4})(?![\d])/.exec(text);
  if (!m) return null;
  let a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
  let year: number, month: number, day: number;
  if (m[1].length === 4) { year = a; month = b; day = c; } // 2026-11-04
  else {
    year = m[3].length <= 2 ? 2000 + c : c;
    if (a > 12 && b <= 12) { day = a; month = b; } // 20/10/26: only one reading
    else if (b > 12 && a <= 12) { month = a; day = b; } // 11/23/2025: must be month first
    else { day = a; month = b; } // ambiguous: India prints the day first
  }
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100)) return null;
  // Reject 31 June and the like.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1) return null;

  let time = "00:00:00";
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(text.slice(m.index + m[0].length));
  if (t) {
    let hour = Number(t[1]);
    const meridiem = t[4]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour <= 23 && Number(t[2]) <= 59) time = `${pad(hour)}:${t[2]}:${t[3] ?? "00"}`;
  }
  return `${year}-${pad(month)}-${pad(day)} ${time}`;
}

/** "Open DPP21472" is bill DPP21472 with its status in front. */
export function cleanInvoiceNumber(v: unknown): string {
  if (isBlank(v)) return NOT_FOUND;
  const cleaned = String(v).trim()
    .replace(/^(?:(?:open|closed|paid|duplicate|original|copy|bill|invoice|receipt|memo|cash|no|number)\b[\s.:#-]*)+/i, "")
    .replace(/^[#:\s-]+/, "")
    .trim();
  return cleaned || NOT_FOUND;
}

export interface Arithmetic {
  /** agrees: some standard way of adding the printed numbers gives the total. */
  status: "agrees" | "differs" | "not_enough_numbers";
  items_sum: number | null;
  /** Total minus the closest reconstruction, when they differ. */
  gap: number | null;
}

/**
 * Do the numbers on the bill agree? Bills differ on whether "subtotal" is
 * before or after discounts and whether prices include tax, so each common
 * layout is tried. Round-off of up to a rupee and a half is allowed.
 */
export function checkArithmetic(x: Extraction, tolerance = 1.5): Arithmetic {
  const total = num(x.amount);
  const items = Array.isArray(x.line_items) ? x.line_items as Extraction[] : [];
  const priced = items.map((i) => num(i.total_price)).filter((n): n is number => n !== null);
  const itemsSum = priced.length ? round2(priced.reduce((s, n) => s + n, 0)) : null;
  const subtotal = num(x.subtotal), tax = num(x.tax_amount) ?? 0, discount = Math.abs(num(x.discount) ?? 0), charges = num(x.charges) ?? 0;
  if (total === null || (itemsSum === null && subtotal === null)) return { status: "not_enough_numbers", items_sum: itemsSum, gap: null };

  const candidates: number[] = [];
  for (const base of [subtotal, itemsSum]) {
    if (base === null) continue;
    candidates.push(base, base + tax, base + tax + charges, base + charges, base - discount, base - discount + tax, base - discount + tax + charges, base - discount + charges);
  }
  const closest = candidates.reduce((best, c) => (Math.abs(total - c) < Math.abs(total - best) ? c : best), candidates[0]);
  const gap = round2(total - closest);
  return Math.abs(gap) <= tolerance
    ? { status: "agrees", items_sum: itemsSum, gap: null }
    : { status: "differs", items_sum: itemsSum, gap };
}

const DISCOUNT_LINE = /^\(?\s*d\s*\)?\s*discount|\bdiscount\b|\bcoupon\b|\boffer applied\b|\bflat\s*.?\s*\d+\s*off\b/i;

/**
 * Applies the rules to one extraction. Adds:
 *   checks.date_from    "printed" when the date came from the printed text by rule, else "model"
 *   checks.arithmetic   see checkArithmetic
 *   needs_review        true when the person should look before saving
 */
export function applyBillRules(raw: Extraction): Extraction {
  const out: Extraction = { ...raw };

  const fromPrinted = dayFirstDate(raw.date_printed);
  if (fromPrinted) out.date_time = fromPrinted;

  out.bill_invoice_number = cleanInvoiceNumber(raw.bill_invoice_number);

  // A discount is not something that was bought: keep it out of the items.
  if (Array.isArray(raw.line_items)) {
    out.line_items = (raw.line_items as Extraction[]).filter((i) => {
      const price = num(i.total_price);
      return !(DISCOUNT_LINE.test(String(i.name ?? "")) && (price === null || price <= 0 || /discount/i.test(String(i.name ?? ""))));
    });
    out.total_items = (out.line_items as unknown[]).length;
  }
  if (num(out.discount) !== null) out.discount = Math.abs(num(out.discount) as number);

  const arithmetic = checkArithmetic(out);
  out.checks = { date_from: fromPrinted ? "printed" : "model", arithmetic };
  out.needs_review = num(out.amount) === null
    || isBlank(out.merchant_name)
    || isBlank(out.date_time)
    || arithmetic.status === "differs";
  return out;
}
