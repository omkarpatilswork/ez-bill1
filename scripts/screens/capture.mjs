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
  NOW, USER_ID, BLUE_TOKAI_ID, CROMA_ID, user, profile, bills, receipts, subscriptions, warranties, returnReminders,
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
const croma = bills.find((b) => b.id === CROMA_ID);
const swiggy = bills.find((b) => b.merchant === 'Swiggy');
const DUPLICATES = [
  { ...croma, id: 'b111e000-0000-4000-8000-0000000000d1', created_at: '2026-10-16T18:40:00+05:30', description: croma.description.replace('[scan]', 'From email: Your Croma invoice') },
  { ...swiggy, id: 'b111e000-0000-4000-8000-0000000000d2', created_at: `${swiggy.expense_date}T22:05:00+05:30` },
];

const TABLES = {
  expenses: bills,
  profiles: [profile],
  user_roles: [],
  expense_receipts: receipts,
  detected_subscriptions: subscriptions,
  warranties,
  bill_splits: [],
};

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function mockSupabase(context) {
  await context.route(/^https:\/\/[a-z0-9]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (url.pathname.startsWith('/auth/v1/user')) return json(user);
    if (url.pathname.startsWith('/auth/v1/token')) return json(session);
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return json({ signedURL: `${url.pathname.replace('/storage/v1', '')}?token=demo` });
    if (url.pathname.startsWith('/storage/v1/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });

    if (url.pathname.startsWith('/rest/v1/') && req.method() === 'GET') {
      const table = url.pathname.slice('/rest/v1/'.length);
      let rows = table === 'expenses' ? [...bills, ...extraBills] : TABLES[table] ?? [];
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

    await shoot('home', '/');
    await shoot('bill', `/expenses/${BLUE_TOKAI_ID}`);
    await shoot('bills', '/expenses');
    await shoot('bills-search', '/expenses?q=cappuccino');
    await shoot('bills-select', '/expenses', { before: async () => {
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      await page.getByRole('checkbox').nth(1).click();
      await page.getByRole('checkbox').nth(3).click();
    } });
    extraBills = DUPLICATES;
    await shoot('bills-duplicates', '/expenses?checkDupes=1');
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
      for (const route of ['/splits', '/money-leaks', '/analytics', '/summary', '/ask-ai', '/warranties', '/subscriptions',
        '/financial-docs', '/expenses/new', '/bulk-upload', '/email-bills', '/settings', '/profile', '/security', '/nfc-airdrop', '/staff']) {
        await shoot(`all${route.replaceAll('/', '-')}`, route);
      }
    }
    await context.close();

    // Signed out: the sign-in and sign-up screens.
    const guest = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
    await mockSupabase(guest);
    await guest.addInitScript((t) => localStorage.setItem('ez-bill-theme', t), theme);
    const door = await guest.newPage();
    for (const route of ['/login', '/signup']) {
      await door.goto(BASE + route, { waitUntil: 'networkidle' });
      await door.evaluate(() => document.fonts.ready);
      await door.waitForTimeout(350);
      await door.screenshot({ path: path.join(OUT, `${route.slice(1)}-${size}-${theme}.png`) });
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
