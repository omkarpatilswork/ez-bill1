// Run: deno test supabase/functions/_shared/bill-rules.test.ts
import { applyBillRules, checkArithmetic, cleanInvoiceNumber, dayFirstDate } from "./bill-rules.ts";

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

// Every date below is printed on a bill in the evaluation set.
Deno.test("dates printed in numbers are read day first", () => {
  assertEquals(dayFirstDate("04/11/26 19:39"), "2026-11-04 19:39:00"); // The Epic Burger: was read as 11 April
  assertEquals(dayFirstDate("10/07/26 20:52"), "2026-07-10 20:52:00"); // Tap Culture: was read as 7 October
  assertEquals(dayFirstDate("11/10/26 12:08"), "2026-10-11 12:08:00"); // Dosa Bae
  assertEquals(dayFirstDate("09/11/25 01:28"), "2025-11-09 01:28:00"); // The Quarter Company
  assertEquals(dayFirstDate("20/10/26 00:36"), "2026-10-20 00:36:00");
  assertEquals(dayFirstDate("02/05/2026"), "2026-05-02 00:00:00");
  assertEquals(dayFirstDate("12-02-2025 20:04"), "2025-02-12 20:04:00");
  assertEquals(dayFirstDate("1-5-2025"), "2025-05-01 00:00:00"); // handwritten
  assertEquals(dayFirstDate("23-11-2025 10:55 PM"), "2025-11-23 22:55:00");
  assertEquals(dayFirstDate("31-01-2024 08:46 PM"), "2024-01-31 20:46:00");
  assertEquals(dayFirstDate("14/06/2025"), "2025-06-14 00:00:00");
});

Deno.test("month first is used only when day first is impossible", () => {
  assertEquals(dayFirstDate("11/23/2025"), "2025-11-23 00:00:00");
  assertEquals(dayFirstDate("2026-11-04 19:39:00"), "2026-11-04 19:39:00");
});

Deno.test("dates in words are left to the model, and nonsense is refused", () => {
  assertEquals(dayFirstDate("May 17 2025 11:36 PM"), null);
  assertEquals(dayFirstDate("19th Jun, 2025"), null);
  assertEquals(dayFirstDate("31/06/2025"), null);
  assertEquals(dayFirstDate("Not Found"), null);
  assertEquals(dayFirstDate(null), null);
});

Deno.test("an invoice number loses status words, and an empty one is Not Found", () => {
  assertEquals(cleanInvoiceNumber("Open DPP21472"), "DPP21472");
  assertEquals(cleanInvoiceNumber("Bill No.: 18111"), "18111");
  assertEquals(cleanInvoiceNumber("KP-F-25-26/-26023"), "KP-F-25-26/-26023");
  assertEquals(cleanInvoiceNumber("CA/19419"), "CA/19419");
  assertEquals(cleanInvoiceNumber(""), "Not Found");
  assertEquals(cleanInvoiceNumber(null), "Not Found");
});

Deno.test("arithmetic agrees across the layouts real bills use", () => {
  // Tap Culture: subtotal + taxes, rounded off.
  assertEquals(checkArithmetic({ amount: 1461, subtotal: 1342, tax_amount: 119.46, line_items: [{ total_price: 349 }, { total_price: 698 }, { total_price: 295 }] }).status, "agrees");
  // The Quarter Company: subtotal before a 55% discount, plus a staff fund and taxes.
  assertEquals(checkArithmetic({ amount: 11209, subtotal: 21861, discount: 12023.55, tax_amount: 879.27, charges: 491.87 }).status, "agrees");
  // Cafe 1730: subtotal already after the discount.
  assertEquals(checkArithmetic({ amount: 4691, subtotal: 4396, discount: 1498, tax_amount: 294.7 }).status, "agrees");
  // Pankaj's Sambar: prices include tax.
  assertEquals(checkArithmetic({ amount: 130, tax_amount: 6.2, line_items: [{ total_price: 130 }] }).status, "agrees");
  // Tap Culture with a service charge.
  assertEquals(checkArithmetic({ amount: 2610, subtotal: 2194, tax_amount: 196.96, charges: 219.4 }).status, "agrees");
});

Deno.test("arithmetic that does not agree says by how much", () => {
  // Read from the app's own data: items 271 against a total of 284.55, no tax captured.
  assertEquals(checkArithmetic({ amount: 284.55, line_items: [{ total_price: 259 }, { total_price: 12 }] }), { status: "differs", items_sum: 271, gap: 13.55 });
  assertEquals(checkArithmetic({ amount: 500 }).status, "not_enough_numbers");
  assertEquals(checkArithmetic({ amount: null, subtotal: 100 }).status, "not_enough_numbers");
});

Deno.test("applyBillRules fixes the date, drops discount lines and flags what needs a look", () => {
  const out = applyBillRules({
    merchant_name: "The Quarter Company", amount: 7107, subtotal: 6218.55, tax_amount: 578.01, charges: 310.93, discount: -7600.45,
    date_time: "2025-09-11 01:28:00", date_printed: "09/11/25 01:28", bill_invoice_number: "5505",
    line_items: [
      { name: "JAGERBOMB", quantity: 8, total_price: 7840 }, { name: "JAGERBOMB (D) Discount", quantity: 1, total_price: -4312 },
      { name: "RED BULL", quantity: 2, total_price: 900 }, { name: "(D) Discount", quantity: 1, total_price: -495 },
    ],
  });
  assertEquals(out.date_time, "2025-11-09 01:28:00");
  assertEquals((out.line_items as unknown[]).length, 2);
  assertEquals(out.total_items, 2);
  assertEquals(out.discount, 7600.45);
  assertEquals((out.checks as { date_from: string }).date_from, "printed");
  assertEquals(out.needs_review, false);

  const shaky = applyBillRules({ merchant_name: "Kimchi", amount: 284.55, date_time: "2026-10-31 20:00:00", line_items: [{ name: "Fried Rice", total_price: 259 }, { name: "Packing", total_price: 12 }] });
  assertEquals(shaky.needs_review, true);
  assertEquals(applyBillRules({ merchant_name: "Not Found", amount: null }).needs_review, true);
});
