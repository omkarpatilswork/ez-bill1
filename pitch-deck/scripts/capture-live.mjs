#!/usr/bin/env node
// Live captures from ezbill.live, run on YOUR machine (it needs your login).
//
//   npm run capture                 everything, in order
//   npm run capture -- --only=ask-ai,money-leaks
//   npm run capture -- --login      just open the browser so you can log in
//
// What it does, and does not do:
// - Opens a visible Chromium with a persistent profile in ./.profile and waits
//   for you to log in yourself. It never types a password.
// - Before every capture it injects only two changes: hide the "Edit with
//   Lovable" badge, and show "EZZ BILLZ" as "EZZ BILL".
// - Privacy blurs (emails, people's names, invoice/payment ids, phone numbers,
//   profile photos, merchant names on Money Leaks) are applied to the saved
//   image, never by changing the page.
// - Sends exactly ONE test bill (₹600, assets/sample_bill.jpg) from /staff to
//   Table 3, then opens /t/t3 in a separate logged-out browser. A marker file
//   stops a second send on re-runs (use --resend to override).
// - Never opens /summary, /splits, /financial-docs, /profile or /settings, and
//   crops /subscriptions above the review queue.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { INIT_SCRIPT } from './lib/inject.mjs';
import { Capturer, CaptureLog, settle, sleep, hasFfmpeg, topOfText } from './lib/capture-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.EZB_BASE || 'https://ezbill.live').replace(/\/$/, '');
const SCREENS = path.join(ROOT, 'screens', 'live');
const CLIPS = path.join(ROOT, 'clips', 'journeys');
const PROFILE = path.join(ROOT, '.profile');
const SAMPLE_BILL = path.join(ROOT, 'assets', 'sample_bill.jpg');
const SENT_MARKER = path.join(SCREENS, '.test-bill-sent.json');
const TABLE_LABEL = 'Table 3';
const TAG_ID = 't3';
const TEST_TOTAL = '600';
const QUESTION = 'How much did I spend eating out this month?';

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false };

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (step) => !only.length || only.includes(step);
const channel = process.env.EZB_CHANNEL ?? 'chrome'; // your installed Chrome signs in to Google more reliably

const STEPS = ['staff', 'tap', 'nfc-airdrop', 'expenses', 'bill', 'split', 'bulk-upload', 'email-bills', 'warranties', 'subscriptions', 'money-leaks', 'ask-ai', 'staff-desktop'];

async function readNames() {
  try {
    const t = await fs.readFile(path.join(ROOT, 'capture', 'private-names.txt'), 'utf8');
    return t.split(/\r?\n/).map((s) => s.replace(/#.*/, '').trim()).filter(Boolean);
  } catch { return []; }
}

async function launch(profile) {
  const opts = { headless: false, ...profile, ignoreDefaultArgs: ['--enable-automation'], args: ['--disable-blink-features=AutomationControlled'] };
  try { return await chromium.launchPersistentContext(PROFILE, { ...opts, channel: channel || undefined }); }
  catch (e) {
    if (!channel) throw e;
    console.log(`  (Chrome channel "${channel}" not available, using Playwright Chromium)`);
    return chromium.launchPersistentContext(PROFILE, opts);
  }
}

async function go(page, route) {
  if (/^\/(summary|splits|financial-docs|profile|settings)(\/|$)/.test(route)) throw new Error(`refusing to open ${route}`);
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await settle(page);
  if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('Not logged in (redirected to /login). Run with --login first.');
}

async function waitForLogin(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await settle(page, { timeout: 8000 });
  const path0 = new URL(page.url()).pathname;
  if (!path0.startsWith('/login')) { console.log('Already logged in.'); return; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('\nLog in to ezbill.live in the browser window yourself, then press Enter here... ');
  rl.close();
}

async function main() {
  await fs.mkdir(SCREENS, { recursive: true });
  await fs.mkdir(CLIPS, { recursive: true });
  const names = await readNames();
  const log = await new CaptureLog(path.join(SCREENS, '_capture-log.json')).load();
  const ffmpeg = hasFfmpeg();
  if (!ffmpeg) console.log('ffmpeg not found: stills only. Run `npm run check-tools` to install it, then re-run for the journey clips.');
  console.log(`Names to blur from capture/private-names.txt: ${names.length} (plus names learned on screen)`);

  // ---------------- phone, logged in ----------------
  const ctx = await launch(PHONE);
  await ctx.addInitScript(INIT_SCRIPT);
  const page = ctx.pages()[0] || (await ctx.newPage());
  await waitForLogin(page);
  if (flag('login')) { console.log('Logged in. Profile saved in ./.profile'); await ctx.close(); return; }
  const cap = new Capturer({ outDir: SCREENS, clipDir: CLIPS, names, dpr: PHONE.deviceScaleFactor, log });

  if (want('staff')) {
    console.log('\n/staff (phone)');
    await go(page, '/staff');
    await cap.still(page, 'staff_phone_before', { route: 'staff' });
    const alreadySent = fss.existsSync(SENT_MARKER) && !flag('resend');
    if (alreadySent) {
      console.log(`  test bill already sent (${SENT_MARKER}); not sending again. Use --resend to override.`);
    } else {
      if (!fss.existsSync(SAMPLE_BILL)) throw new Error(`Missing ${SAMPLE_BILL}. Put the bill photo there first.`);
      const card = page.locator('.glass-card').filter({ hasText: new RegExp(`^\\s*${TABLE_LABEL}(?!\\d)`) }).first();
      if (!(await card.count())) throw new Error(`No "${TABLE_LABEL}" card on /staff`);
      await card.scrollIntoViewIfNeeded();
      const j = ffmpeg ? await cap.journey(page, 'staff-send-bill', { route: 'staff' }).init() : null;
      if (j) await j.hold(0.8);
      await card.getByRole('button', { name: /Send( new)? bill/ }).click();
      if (j) await j.realtime(700); else await sleep(700);
      const amount = page.locator('input[type="number"]').first();
      await amount.click();
      for (const ch of TEST_TOTAL) { await page.keyboard.type(ch); if (j) await j.frame(5); }
      await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_BILL);
      await page.getByAltText('Bill preview').waitFor({ timeout: 10000 });
      await sleep(300);
      if (j) await j.hold(1.0);
      await cap.still(page, 'staff_phone_sheet', { route: 'staff' });
      await page.getByRole('button', { name: 'Send to table' }).click();
      await fs.writeFile(SENT_MARKER, JSON.stringify({ sentAt: new Date().toISOString(), table: TABLE_LABEL, total: Number(TEST_TOTAL), photo: 'assets/sample_bill.jpg' }, null, 2));
      const ok = page.getByText('Bill sent', { exact: true });
      if (j) await j.realtime(4000, { until: async () => (await ok.count()) > 0 && (await page.locator('[role="dialog"]').count()) === 0 });
      await ok.first().waitFor({ timeout: 20000 });
      await settle(page, { timeout: 6000 });
      if (j) { await j.realtime(1200); await j.hold(1.2); await j.encode(); }
      await cap.still(page, 'staff_phone_after', { route: 'staff' });
      console.log(`  sent ONE test bill to ${TABLE_LABEL} (₹${TEST_TOTAL})`);
    }
  }

  // ---------------- guest tap page, separate logged-out browser ----------------
  if (want('tap')) {
    console.log(`\n/t/${TAG_ID} (logged-out guest)`);
    const guestBrowser = await chromium.launch({ headless: false, channel: channel || undefined }).catch(() => chromium.launch({ headless: false }));
    const guest = await guestBrowser.newContext({ ...PHONE });
    await guest.addInitScript(INIT_SCRIPT);
    const gp = await guest.newPage();
    await gp.goto(`${BASE}/t/${TAG_ID}`, { waitUntil: 'domcontentloaded' });
    await settle(gp);
    const gcap = new Capturer({ outDir: SCREENS, clipDir: CLIPS, names, dpr: PHONE.deviceScaleFactor, log });
    await gcap.still(gp, 'tap_guest', { route: 'tap' });
    await gcap.tall(gp, 'tap_guest', { route: 'tap' });
    if (ffmpeg) {
      const j = await gcap.journey(gp, 'tap-guest-scroll', { route: 'tap' }).init();
      await j.hold(1.0); await j.scroll(await j.scrollMax(), 2.5); await j.hold(1.0); await j.encode();
    }
    await guestBrowser.close(); // never signs in here
  }

  if (want('nfc-airdrop')) {
    console.log('\n/nfc-airdrop');
    await go(page, '/nfc-airdrop');
    await cap.still(page, 'nfc-airdrop', { route: 'nfc-airdrop' });
    await cap.tall(page, 'nfc-airdrop', { route: 'nfc-airdrop' });
  }

  if (want('expenses')) {
    console.log('\n/expenses → Food & Dining');
    await go(page, '/expenses');
    const chip = page.getByRole('button', { name: /^\s*Food & Dining/ }).first();
    const j = ffmpeg ? await cap.journey(page, 'expenses-food-filter', { route: 'expenses' }).init() : null;
    if (j) await j.hold(0.8);
    await chip.click();
    if (j) await j.realtime(1000); else await sleep(800);
    await settle(page, { timeout: 5000 });
    await cap.still(page, 'expenses_food', { route: 'expenses' });
    if (j) { await j.hold(0.6); await j.scroll(Math.min(900, await j.scrollMax()), 2.5); await j.hold(0.8); await j.encode(); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await cap.tall(page, 'expenses_food', { route: 'expenses' });
  }

  // Find one imported (not tapped) restaurant bill with 5+ line items.
  let billId = process.env.EZB_EXPENSE_ID || null;
  if ((want('bill') || want('split')) && !billId) {
    console.log('\nLooking for a Food & Dining bill with 5+ line items (not an NFC bill)...');
    await go(page, '/expenses');
    await page.getByRole('button', { name: /^\s*Food & Dining/ }).first().click().catch(() => {});
    await settle(page, { timeout: 5000 });
    const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/expenses/"]')].map((a) => a.getAttribute('href').split('/')[2]).filter((x) => x && x !== 'new'))]);
    for (const id of ids.slice(0, 40)) {
      await page.goto(`${BASE}/expenses/${id}`, { waitUntil: 'domcontentloaded' });
      await settle(page, { timeout: 8000, quiet: 400 });
      const info = await page.evaluate(() => {
        const t = document.body.innerText;
        const m = t.match(/Items \((\d+)\)/i);
        return { items: m ? Number(m[1]) : 0, nfc: /\[nfc\]|via nfc tag|tapped at/i.test(t) };
      });
      if (info.items >= 5 && !info.nfc) { billId = id; console.log(`  using bill ${id.slice(0, 8)}… (${info.items} items)`); break; }
    }
    if (!billId) console.log('  none found. Set EZB_EXPENSE_ID=<id> and re-run with --only=bill,split');
  }

  if (want('bill') && billId) {
    console.log('\nbill detail');
    await go(page, `/expenses/${billId}`);
    await cap.still(page, 'bill_detail', { route: 'bill' });
    await cap.tall(page, 'bill_detail', { route: 'bill' });
    if (ffmpeg) {
      const j = await cap.journey(page, 'bill-line-items', { route: 'bill' }).init();
      const top = await topOfText(page, ['Items (']);
      await j.hold(0.8); await j.scroll(top ? top - 120 : 600, 2.5); await j.hold(1.2); await j.encode();
    }
  }

  if (want('split') && billId) {
    console.log('\nsplit (nothing is saved)');
    await go(page, `/expenses/${billId}/split`);
    await cap.still(page, 'split', { route: 'split' });
    const custom = page.getByRole('button', { name: /Custom Split/ });
    const j = ffmpeg ? await cap.journey(page, 'split-custom', { route: 'split' }).init() : null;
    if (j) await j.hold(0.8);
    if (await custom.isEnabled().catch(() => false)) {
      await custom.click(); // local view toggle only; we never press Save
      if (j) await j.realtime(800); else await sleep(600);
      await settle(page, { timeout: 4000 });
      await cap.still(page, 'split_custom', { route: 'split' });
      if (j) { await j.scroll(Math.min(1400, await j.scrollMax()), 3); await j.hold(1); }
      await page.evaluate(() => window.scrollTo(0, 0));
      await cap.tall(page, 'split_custom', { route: 'split' });
    }
    if (j) await j.encode();
  }

  for (const [step, route, name] of [['bulk-upload', '/bulk-upload', 'bulk-upload'], ['email-bills', '/email-bills', 'email-bills'], ['warranties', '/warranties', 'warranties']]) {
    if (!want(step)) continue;
    console.log(`\n${route}`);
    await go(page, route);
    await cap.still(page, name, { route: step });
    await cap.tall(page, name, { route: step });
  }

  if (want('subscriptions')) {
    console.log('\n/subscriptions (summary + active list only)');
    const STOP = ['Review queue', 'We missed one — add manually', 'Connect Gmail to auto-detect subscriptions'];
    await go(page, '/subscriptions');
    await cap.still(page, 'subscriptions', { route: 'subscriptions', cropBefore: STOP });
    await cap.tall(page, 'subscriptions', { route: 'subscriptions', cropBefore: STOP });
    if (ffmpeg) {
      const stopY = await topOfText(page, STOP);
      const j = await cap.journey(page, 'subscriptions-scroll', { route: 'subscriptions' }).init();
      const vh = page.viewportSize().height;
      const to = stopY ? Math.max(0, stopY - vh - 24) : Math.min(1200, await j.scrollMax());
      await j.hold(0.8); if (to > 40) await j.scroll(to, 2.5); await j.hold(0.8); await j.encode();
    }
  }

  if (want('money-leaks')) {
    console.log('\n/money-leaks (score + category cards only, merchants blurred)');
    const STOP = ["Why It's Happening", 'Why It’s Happening'];
    await go(page, '/money-leaks');
    await cap.still(page, 'money-leaks', { route: 'money-leaks', cropBefore: STOP });
    await cap.tall(page, 'money-leaks', { route: 'money-leaks', cropBefore: STOP });
    if (ffmpeg) {
      const stopY = await topOfText(page, STOP);
      const j = await cap.journey(page, 'money-leaks-scroll', { route: 'money-leaks' }).init();
      const vh = page.viewportSize().height;
      const to = stopY ? Math.max(0, stopY - vh - 24) : Math.min(1000, await j.scrollMax());
      await j.hold(0.8); if (to > 40) await j.scroll(to, 2.5); await j.hold(0.8); await j.encode();
    }
  }

  if (want('ask-ai')) {
    console.log('\n/ask-ai');
    await go(page, '/ask-ai');
    const box = page.getByPlaceholder('Ask about your expenses...');
    const j = ffmpeg ? await cap.journey(page, 'ask-ai', { route: 'ask-ai' }).init() : null;
    if (j) await j.hold(0.8);
    await box.click();
    for (const ch of QUESTION) { await page.keyboard.type(ch); if (j) await j.frame(2); }
    if (j) await j.hold(0.4);
    await page.keyboard.press('Enter');
    // wait for the answer to finish: no spinner and text stable for 2.5 s (max 90 s)
    const textLen = () => page.evaluate(() => document.body.innerText.length);
    let last = -1, stableSince = Date.now();
    const done = async () => {
      const n = await textLen();
      const busy = await page.evaluate(() => !!document.querySelector('.animate-spin, .animate-bounce, .animate-pulse'));
      if (n !== last || busy) { last = n; stableSince = Date.now(); return false; }
      return Date.now() - stableSince > 2500;
    };
    if (j) await j.realtime(90000, { capFrames: 10, until: done });
    else { const end = Date.now() + 90000; while (Date.now() < end && !(await done())) await sleep(300); }
    await settle(page, { timeout: 5000 });
    if (j) { await j.hold(1.5); await j.encode(); }
    await cap.still(page, 'ask-ai', { route: 'ask-ai' });
    await cap.tall(page, 'ask-ai', { route: 'ask-ai' });
  }
  await ctx.close();

  // ---------------- /staff at 1920x1080 ----------------
  if (want('staff-desktop')) {
    console.log('\n/staff (1920x1080)');
    const dctx = await launch(DESKTOP);
    await dctx.addInitScript(INIT_SCRIPT);
    const dp = dctx.pages()[0] || (await dctx.newPage());
    const dcap = new Capturer({ outDir: SCREENS, clipDir: CLIPS, names, dpr: DESKTOP.deviceScaleFactor, log });
    await go(dp, '/staff');
    await dcap.still(dp, 'staff_desktop', { route: 'staff' });
    await dctx.close();
  }

  console.log(`\nDone. Stills in screens/live/, clips in clips/journeys/. Next: npm run contact-sheet`);
}

main().catch((e) => { console.error('\n' + (e.stack || e.message)); process.exit(1); });
