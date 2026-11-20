/**
 * The pretend backend for screenshots: answers every Supabase call from the
 * demo world (demo-world.mjs) and blocks anything else, so nothing leaves the
 * machine. Shared by capture.mjs (the app's screens) and site-assets.mjs (the
 * screens for ezzbill.com).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USER_ID, CROMA_ID, user, profile, bills, receipts, subscriptions, warranties, documents, friends, billSplits, splitPayments,
} from './demo-world.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** What a screenshot needs to change for one shot: extra bills, a pretend reading, a bill left out. */
export const state = { extraBills: [], reading: null, hiddenBill: null };

// The auth storage key is named after the configured project, so read it from .env.
const env = readFileSync(path.join(here, '../../.env'), 'utf8');
export const projectRef = new URL(env.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)[1]).hostname.split('.')[0];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const session = {
  // Not a real token: unsigned, for a user that does not exist, and never sent anywhere.
  access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp: 1900000000 })}.demo`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1900000000,
  refresh_token: 'demo',
  user,
};

export const BLUE_TOKAI_READING = {
  merchant_name: 'Blue Tokai Coffee', aggregator: 'Not Found', merchant_address: 'Koregaon Park, Pune', amount: 412, subtotal: 392.38, tax_amount: 19.62,
  tax_details: 'CGST 2.5% + SGST 2.5%', discount: null, date_time: '2026-10-19 13:20:00', bill_invoice_number: 'Not Found', payment_method: 'UPI',
  category: 'Food & Dining', currency: 'INR',
  line_items: [{ name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 }, { name: 'Almond Croissant', quantity: 1, unit_price: 92, total_price: 92 }],
};
const croma = bills.find((b) => b.id === CROMA_ID);
const swiggy = bills.find((b) => b.merchant === 'Swiggy');
export const DUPLICATES = [
  { ...croma, id: 'b111e000-0000-4000-8000-0000000000d1', created_at: '2026-10-16T18:40:00+05:30', description: croma.description.replace('[scan]', 'From email: Your Croma invoice') },
  { ...swiggy, id: 'b111e000-0000-4000-8000-0000000000d2', created_at: `${swiggy.expense_date}T22:05:00+05:30` },
];

export const USD_BILL = { ...bills[0], id: 'b111e000-0000-4000-8000-0000000000f1', merchant: 'Apple Store', title: 'Apple Store', amount: 1299, currency: 'USD', expense_date: '2026-10-17', created_at: '2026-10-17T20:00:00+05:30', description: 'Payment: Credit Card' };

const TABLES = {
  expenses: bills,
  profiles: [profile],
  user_roles: [],
  expense_receipts: receipts,
  detected_subscriptions: subscriptions,
  warranties,
  financial_documents: documents,
  bill_splits: billSplits,
  split_payments: splitPayments,
  bill_tags: [1, 2, 3, 4].map((n) => ({ tag_id: `t${n}`, label: `Table ${n}`, merchant_name: 'Blue Tokai Coffee' })),
  tag_pending_bills: [{ id: 'a3000000-0000-4000-8000-000000000001', tag_id: 't3', amount: 412, created_at: '2026-10-19T13:18:00+05:30', claimed_at: null }],
  friends,
};

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// COUNT_REQUESTS=1 prints how many backend requests Home makes: a cheap watch on wasted round trips.
export const requestCounts = new Map();

export async function mockSupabase(context) {
  await context.route(/^https:\/\/[a-z0-9]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'OPTIONS') requestCounts.set(url.pathname, (requestCounts.get(url.pathname) || 0) + 1);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (url.pathname === '/auth/v1/recover') return json({}); // "Forgot password": the reset email is accepted, nothing is sent
    if (url.pathname.startsWith('/auth/v1/user')) return json(user);
    if (url.pathname.startsWith('/auth/v1/token')) return json(session);
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return json({ signedURL: `${url.pathname.replace('/storage/v1', '')}?token=demo` });
    if (url.pathname.startsWith('/storage/v1/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });

    if (url.pathname === '/functions/v1/extract-receipt' && state.reading) return json(state.reading);
    // NFC Airdrop: the table's tag answers with the demo bill, already read when the staff sent it.
    if (url.pathname === '/functions/v1/resolve-tag') {
      return json({ found: true, table_label: 'Table 3', status: 'ready', bill: { pending_bill_id: 'a3000000-0000-4000-8000-000000000001', merchant_name: 'Blue Tokai Coffee', amount: 412, signed_url: null, extracted: BLUE_TOKAI_READING } });
    }

    if (url.pathname.startsWith('/rest/v1/') && req.method() === 'GET') {
      const table = url.pathname.slice('/rest/v1/'.length);
      let rows = table === 'expenses' ? [...bills, ...state.extraBills].filter((b) => b.id !== state.hiddenBill) : TABLES[table] ?? [];
      for (const [key, value] of url.searchParams) {
        if (value.startsWith('eq.')) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      }
      if (table === 'expenses') {
        rows = [...rows].sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at));
      }
      const limit = Number(url.searchParams.get('limit'));
      if (limit) rows = rows.slice(0, limit);
      if ((req.headers().accept || '').includes('vnd.pgrst.object')) {
        return rows.length ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
      }
      return json(rows);
    }
    // Anything else (writes, edge functions, realtime) is refused: screenshots never touch a backend.
    return route.abort();
  });
}
