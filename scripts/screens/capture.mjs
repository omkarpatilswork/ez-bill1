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
import { mkdirSync } from 'node:fs';
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

import { BLUE_TOKAI_READING, DUPLICATES, USD_BILL, mockSupabase, projectRef, requestCounts, session, state } from './mock-backend.mjs';

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

// CHROMIUM_PATH: use an already-installed Chromium instead of the one Playwright downloads.
// --lang=en-IN: date fields read day-first, as on an Indian phone (Chromium's own locale decides their format).
const browser = await chromium.launch({ args: ['--lang=en-IN'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
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
    state.reading = BLUE_TOKAI_READING; state.hiddenBill = BLUE_TOKAI_ID;
    await shoot('add-check', '/expenses/new?mode=upload', { full: true, before: add({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo }) });
    // The same bill again: it is already here, so the screen says so before anything is saved.
    state.hiddenBill = null;
    await shoot('add-duplicate', '/expenses/new?mode=upload', { full: true, before: add({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo }) });
    // A misread total: the lines no longer add up to it.
    state.reading = { ...BLUE_TOKAI_READING, amount: 421 };
    await shoot('add-mismatch', '/expenses/new?mode=upload', { full: true, before: add({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo }) });
    state.reading = null;
    await shoot('add-typed', '/expenses/new', { full: size === 'mobile' });
    await shoot('add-correct', `/expenses/new?edit=${CROMA_ID}`, { full: size === 'mobile' });
    await shoot('bills-select', '/expenses', { before: async () => {
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      await page.getByRole('checkbox').nth(1).click();
      await page.getByRole('checkbox').nth(3).click();
    } });
    state.extraBills = DUPLICATES;
    await shoot('bills-duplicates', '/expenses?checkDupes=1');
    // A bill in dollars: Home's total stays in rupees and says one bill was left out.
    state.extraBills = [USD_BILL];
    await shoot('home-two-currencies', '/');
    state.extraBills = [];
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
    // Guarded: the init script also runs on about:blank, where storage is off limits.
    await guest.addInitScript((t) => { try { localStorage.setItem('ez-bill-theme', t); } catch { /* about:blank */ } }, theme);
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
      // A fresh page load each time: two reset links differ only after '#', which would not reload the app.
      await door.goto('about:blank');
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
