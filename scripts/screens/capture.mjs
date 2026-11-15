/**
 * Screenshots of the redesigned screens, against the local dev server, with
 * every Supabase call answered from the demo world. Nothing leaves the machine:
 * any request to a Supabase host that is not mocked is blocked.
 *
 *   npx vite --host 127.0.0.1 --port 8080      (in one terminal)
 *   node scripts/screens/capture.mjs [outDir] [--all]   (in another)
 *
 * Needs Playwright with Chromium (`npx playwright install chromium` once).
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOW, USER_ID, BLUE_TOKAI_ID, CROMA_ID, user, profile, bills, receipts, subscriptions, warranties, documents, returnReminders, friends, billSplits, splitPayments,
} from './demo-world.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const ALL = process.argv.includes('--all');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(here, 'out'));
mkdirSync(OUT, { recursive: true });

// The auth storage key is named after the configured project, so read it from .env.
const env = readFileSync(path.join(here, '../../.env'), 'utf8');
const projectRef = new URL(env.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)[1]).hostname.split('.')[0];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = {
  // Not a real token: unsigned, for a user that does not exist, and never sent anywhere.
  access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp: 1900000000 })}.demo`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1900000000,
  refresh_token: 'demo',
  user,
};

// Extra rows for one shot only (the duplicates review), so the demo world's totals stay as documented.
let extraBills = [];
// For the "Add a bill" shots: what the pretend reader answers, and a bill to leave out so it can be added afresh.
let reading = null;
let hiddenBill = null;
const BLUE_TOKAI_READING = {
  merchant_name: 'Blue Tokai Coffee', aggregator: 'Not Found', merchant_address: 'Koregaon Park, Pune', amount: 412, subtotal: 392.38, tax_amount: 19.62,
  tax_details: 'CGST 2.5% + SGST 2.5%', discount: null, date_time: '2026-10-19 13:20:00', bill_invoice_number: 'Not Found', payment_method: 'UPI',
  category: 'Food & Dining', currency: 'INR',
  line_items: [{ name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 }, { name: 'Almond Croissant', quantity: 1, unit_price: 92, total_price: 92 }],
};
const croma = bills.find((b) => b.id === CROMA_ID);
const swiggy = bills.find((b) => b.merchant === 'Swiggy');
const DUPLICATES = [
  { ...croma, id: 'b111e000-0000-4000-8000-0000000000d1', created_at: '2026-10-16T18:40:00+05:30', description: croma.description.replace('[scan]', 'From email: Your Croma invoice') },
  { ...swiggy, id: 'b111e000-0000-4000-8000-0000000000d2', created_at: `${swiggy.expense_date}T22:05:00+05:30` },
];

const USD_BILL = { ...bills[0], id: 'b111e000-0000-4000-8000-0000000000f1', merchant: 'Apple Store', title: 'Apple Store', amount: 1299, currency: 'USD', expense_date: '2026-10-17', created_at: '2026-10-17T20:00:00+05:30', description: 'Payment: Credit Card' };

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
const requestCounts = new Map();

async function mockSupabase(context) {
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

    if (url.pathname === '/functions/v1/extract-receipt' && reading) return json(reading);
    // NFC Airdrop: the table's tag answers with the demo bill, already read when the staff sent it.
    if (url.pathname === '/functions/v1/resolve-tag') {
      return json({ found: true, table_label: 'Table 3', status: 'ready', bill: { pending_bill_id: 'a3000000-0000-4000-8000-000000000001', merchant_name: 'Blue Tokai Coffee', amount: 412, signed_url: null, extracted: BLUE_TOKAI_READING } });
    }

    if (url.pathname.startsWith('/rest/v1/') && req.method() === 'GET') {
      const table = url.pathname.slice('/rest/v1/'.length);
      let rows = table === 'expenses' ? [...bills, ...extraBills].filter((b) => b.id !== hiddenBill) : TABLES[table] ?? [];
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

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

// CHROMIUM_PATH: use an already-installed Chromium instead of the one Playwright downloads.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];

for (const theme of ['dark', 'light']) {
  for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
      isMobile: size === 'mobile', hasTouch: size === 'mobile',
    });
    await mockSupabase(context);
    await context.addInitScript(({ key, session, theme, reminders }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem('ez-bill-theme', theme);
      localStorage.setItem('ezbill.return-reminders.v1', JSON.stringify(reminders));
    }, { key: `sb-${projectRef}-auth-token`, session, theme, reminders: returnReminders });

    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(NOW));
    // A blocked request (an edge function or a write) logs a load failure: that is the mock working, not a fault.
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('net::ERR_FAILED')) problems.push(`${theme}/${size} ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => problems.push(`${theme}/${size} ${String(e).slice(0, 200)}`));

    const shoot = async (name, route, { full = false, before } = {}) => {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      if (before) await before();
      // A "full" shot grows the window to the page height, so the fixed tab bar stays at the foot.
      if (full) await page.setViewportSize({ width: viewport.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(OUT, `${name}-${size}-${theme}.png`) });
      if (full) await page.setViewportSize(viewport);
    };

    requestCounts.clear();
    await shoot('home', '/');
    if (process.env.COUNT_REQUESTS && theme === 'dark' && size === 'mobile') {
      console.log(`Home made ${[...requestCounts.values()].reduce((a, b) => a + b, 0)} backend requests:`);
      for (const [path, n] of [...requestCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${path}`);
    }
    await shoot('bill', `/expenses/${BLUE_TOKAI_ID}`);
    await shoot('bills', '/expenses');
    await shoot('bills-search', '/expenses?q=cappuccino');
    await shoot('spending', '/analytics');
    await shoot('money-leaks', '/money-leaks', { full: size === 'mobile' });
    await shoot('summary', '/summary', { full: true });
    if (size === 'desktop' && theme === 'dark') {
      // Prove the export works: press the button and keep the PDF it produces.
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: 'Save as PDF' }).click()]);
      await download.saveAs(path.join(OUT, 'monthly-summary.pdf'));
    }
    await shoot('warranty-vault', '/warranties');
    await shoot('warranty-open', '/warranties', { before: () => page.getByRole('button', { name: /Logitech/ }).click() });
    await shoot('warranty-add', '/warranties', { before: () => page.getByRole('button', { name: 'Add a warranty' }).click() });
    await shoot('subscriptions', '/subscriptions');
    await shoot('subscription-edit', '/subscriptions', { before: () => page.getByRole('button', { name: /Netflix/ }).click() });
    await shoot('documents', '/financial-docs');
    await shoot('ask-ai', '/ask-ai');
    await shoot('settings', '/settings', { full: size === 'mobile' });
    await shoot('security', '/security', { full: size === 'mobile' });
    await shoot('smart-support', `/expenses/${CROMA_ID}/support`, { full: size === 'mobile' }); // the demo bill already has a return reminder
    await shoot('import', '/email-bills', { full: size === 'mobile' });
    await shoot('nfc-airdrop', '/nfc-airdrop');
    await shoot('staff', '/staff');
    await shoot('splits', '/splits');
    await shoot('split-friend', `/splits/friend/${friends[1].id}`);
    await shoot('split-bill', `/expenses/${BLUE_TOKAI_ID}/split`, { full: size === 'mobile', before: () => page.getByRole('tab', { name: 'Line by line' }).click() });
    // Add a bill: the demo bill's own slip stands in for the photo, and a pretend reader answers.
    await page.goto(`${BASE}/expenses/${BLUE_TOKAI_ID}`, { waitUntil: 'networkidle' });
    const photo = await page.locator('.ez-slip-wrap').first().screenshot();
    const add = (file) => async () => {
      await page.locator('input[type=file]').last().setInputFiles(file);
      await page.getByRole('heading', { name: /Check the bill|Type in what you see/ }).waitFor();
    };
    reading = BLUE_TOKAI_READING; hiddenBill = BLUE_TOKAI_ID;
    await shoot('add-check', '/expenses/new?mode=upload', { full: true, before: add({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo }) });
    // The same bill again: it is already here, so the screen says so before anything is saved.
    hiddenBill = null;
    await shoot('add-duplicate', '/expenses/new?mode=upload', { full: true, before: add({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo }) });
    // A misread total: the lines no longer add up to it.
    reading = { ...BLUE_TOKAI_READING, amount: 421 };
    await shoot('add-mismatch', '/expenses/new?mode=upload', { full: true, before: add({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo }) });
    reading = null;
    await shoot('add-typed', '/expenses/new', { full: size === 'mobile' });
    await shoot('add-correct', `/expenses/new?edit=${CROMA_ID}`, { full: size === 'mobile' });
    await shoot('bills-select', '/expenses', { before: async () => {
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      await page.getByRole('checkbox').nth(1).click();
      await page.getByRole('checkbox').nth(3).click();
    } });
    extraBills = DUPLICATES;
    await shoot('bills-duplicates', '/expenses?checkDupes=1');
    // A bill in dollars: Home's total stays in rupees and says one bill was left out.
    extraBills = [USD_BILL];
    await shoot('home-two-currencies', '/');
    extraBills = [];
    if (size === 'mobile') {
      await shoot('home-full', '/', { full: true });
      await shoot('bill-full', `/expenses/${BLUE_TOKAI_ID}`, { full: true });
      await shoot('bill-shopping-full', `/expenses/${CROMA_ID}`, { full: true });
      await shoot('capture', '/', { before: () => page.getByRole('button', { name: 'Add a bill' }).click() });
    } else {
      await shoot('bill-shopping', `/expenses/${CROMA_ID}`);
    }
    // --all: every other main screen too, to check the ones not rebuilt yet.
    if (ALL) {
      for (const route of ['/email-bills']) {
        await shoot(`all${route.replaceAll('/', '-')}`, route);
      }
    }
    await context.close();

    // First run: the same person before they have set up.
    const fresh = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
    await mockSupabase(fresh);
    await fresh.route(/\/rest\/v1\/profiles/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...profile, onboarding_completed: false }) }));
    await fresh.addInitScript(({ key, session, theme }) => { localStorage.setItem(key, JSON.stringify(session)); localStorage.setItem('ez-bill-theme', theme); }, { key: `sb-${projectRef}-auth-token`, session, theme });
    const first = await fresh.newPage();
    await first.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await first.evaluate(() => document.fonts.ready);
    await first.waitForTimeout(350);
    await first.screenshot({ path: path.join(OUT, `onboarding-${size}-${theme}.png`) });
    await fresh.close();

    // Signed out: the sign-in and sign-up screens.
    const guest = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
    await mockSupabase(guest);
    await guest.addInitScript((t) => localStorage.setItem('ez-bill-theme', t), theme);
    const door = await guest.newPage();
    door.on('pageerror', (e) => problems.push(`${theme}/${size} ${String(e).slice(0, 200)}`));
    // The reset link signs the person in, so it comes last.
    const resetLink = `/reset-password#access_token=${session.access_token}&expires_at=1900000000&expires_in=3600&refresh_token=demo&token_type=bearer&type=recovery`;
    const doors = [
      ['login', '/login'], ['signup', '/signup'], ['tap', '/t/t3'],
      ['terms', '/terms'], ['privacy', '/privacy'], ['not-found', '/no-such-page'],
      ['forgot-password', '/forgot-password'],
      ['forgot-password-sent', '/forgot-password', async () => {
        await door.getByLabel('Email').fill(user.email);
        await door.getByRole('button', { name: 'Send the link' }).click();
        await door.getByRole('heading', { name: 'Check your email.' }).waitFor();
      }],
      ['reset-expired', '/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
      ['reset-password', resetLink, () => door.getByRole('heading', { name: 'Choose a new password.' }).waitFor()],
    ];
    for (const [name, route, before] of doors) {
      await door.goto(BASE + route, { waitUntil: 'networkidle' });
      await door.evaluate(() => document.fonts.ready);
      if (before) await before();
      await door.waitForTimeout(350);
      await door.screenshot({ path: path.join(OUT, `${name}-${size}-${theme}.png`) });
    }
    await guest.close();
  }
}

await browser.close();
if (problems.length) {
  console.error(`Console problems:\n${[...new Set(problems)].join('\n')}`);
  process.exitCode = 1;
}
console.log(`Screenshots written to ${OUT}`);
