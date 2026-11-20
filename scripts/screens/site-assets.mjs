/**
 * The app screens used on ezzbill.com (the marketing site, repo ezzbill-site),
 * taken from the redesigned app with the demo world and the pretend backend.
 *
 *   npx vite --host 127.0.0.1 --port 8080
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/screens/site-assets.mjs <outDir>
 *   python3 scripts/screens/site-assets-webp.py <outDir> <ezzbill-site>/assets/screens
 *
 * Writes PNGs: phone screens (390x844 at 2x), full-length phone scrolls without
 * the tab bar (tall-*), the tab bar with each destination lit (nav-*), and
 * desktop screens (1440x900 at 2x, desk-*).
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { NOW, BLUE_TOKAI_ID, CROMA_ID } from './demo-world.mjs';
import { BLUE_TOKAI_READING, DUPLICATES, mockSupabase, projectRef, session, state } from './mock-backend.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const OUT = path.resolve(process.argv[2] || 'site-assets');
mkdirSync(OUT, { recursive: true });

// --lang=en-IN: date fields read day-first, as on an Indian phone (Chromium's own locale decides their format).
const browser = await chromium.launch({ args: ['--lang=en-IN'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const problems = [];
const HIDE_TAB_BAR = 'nav[aria-label="Main"].fixed { display: none !important; }';

async function context(viewport, { signedIn = true, mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile });
  await mockSupabase(ctx);
  await ctx.addInitScript(({ key, session, signedIn }) => {
    try {
      localStorage.setItem('ez-bill-theme', 'dark');
      if (signedIn) localStorage.setItem(key, JSON.stringify(session));
    } catch { /* about:blank */ }
  }, { key: `sb-${projectRef}-auth-token`, session, signedIn });
  // A fresh page for every shot: an emulated phone that is stretched to full length and back keeps the wrong zoom.
  const newPage = async () => {
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(NOW));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('net::ERR_FAILED')) problems.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => problems.push(String(e).slice(0, 200)));
    return page;
  };
  return { ctx, newPage };
}

async function open(newPage, route, before) {
  const page = await newPage();
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (before) await before(page);
  await page.waitForTimeout(400);
  return page;
}

const PHONE = { width: 390, height: 844 };
const phone = await context(PHONE);
const fresh = phone.newPage;

// Single phone screens.
const screens = [
  ['home', '/'],
  ['bill', `/expenses/${BLUE_TOKAI_ID}`],
  ['staff', '/staff'],
  ['smart-support', `/expenses/${CROMA_ID}/support`],
  ['capture', '/', (p) => p.getByRole('button', { name: 'Add a bill' }).click().then(() => p.getByRole('heading', { name: 'Where is it?' }).waitFor())],
];
for (const [name, route, before] of screens) {
  const page = await open(fresh, route, before);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.close();
}

// The one review screen, with a pretend reader: a clean read, a bill already saved, a misread total.
const billPage = await open(fresh, `/expenses/${BLUE_TOKAI_ID}`);
const photo = await billPage.locator('.ez-slip-wrap').first().screenshot();
await billPage.close();
const addFile = (p) => p.locator('input[type=file]').last().setInputFiles({ name: 'bill-table-3.png', mimeType: 'image/png', buffer: photo })
  .then(() => p.getByRole('heading', { name: /Check the bill|Type in what you see/ }).waitFor());
for (const [name, reading, hidden] of [['add-check', BLUE_TOKAI_READING, BLUE_TOKAI_ID], ['add-duplicate', BLUE_TOKAI_READING, null], ['add-mismatch', { ...BLUE_TOKAI_READING, amount: 421 }, BLUE_TOKAI_ID]]) {
  state.reading = reading; state.hiddenBill = hidden;
  const page = await open(fresh, '/expenses/new?mode=upload', addFile);
  await page.screenshot({ path: path.join(OUT, `${name}-top.png`) });
  // The part the site shows: the lines, tax and charges, and what the check says about them.
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('p, h2, h3, span')].find((e) => e.textContent.trim().toLowerCase() === 'lines on the bill');
    // Jump, not glide: the app scrolls smoothly, and a shot taken mid-glide catches the tab bar out of place.
    if (label) window.scrollTo({ top: label.getBoundingClientRect().top + window.scrollY - 24, behavior: 'instant' });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.setViewportSize({ width: PHONE.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}-full.png`) });
  await page.close();
}
state.reading = null; state.hiddenBill = null;

// Duplicates offered for review.
state.extraBills = DUPLICATES;
const dupes = await open(fresh, '/expenses?checkDupes=1');
await dupes.screenshot({ path: path.join(OUT, 'bills-duplicates.png') });
await dupes.close();
state.extraBills = [];

// Full-length scrolls without the tab bar (it is laid over the phone separately), and the tab bar itself.
const talls = [
  ['home', '/', 'home'],
  ['bills', '/expenses', 'bills'],
  ['money-leaks', '/money-leaks', 'insights'],
  ['spending', '/analytics', 'insights'],
  ['warranties', '/warranties', 'vault'],
  ['subscriptions', '/subscriptions', 'vault'],
  ['splits', `/expenses/${BLUE_TOKAI_ID}/split`, 'bills', (p) => p.getByRole('tab', { name: 'Line by line' }).click()],
];
const navDone = new Set();
for (const [name, route, nav, before] of talls) {
  const page = await open(fresh, route, before);
  if (!navDone.has(nav)) {
    // The bar is 64px tall; the Add button rises 28px above it.
    await page.screenshot({ path: path.join(OUT, `nav-${nav}.png`), clip: { x: 0, y: PHONE.height - 96, width: PHONE.width, height: 96 } });
    navDone.add(nav);
  }
  await page.addStyleTag({ content: HIDE_TAB_BAR });
  await page.setViewportSize({ width: PHONE.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `tall-${name}.png`) });
  await page.close();
}
await phone.ctx.close();

// The guest's phone after tapping the table's tag (signed out).
const guest = await context(PHONE, { signedIn: false });
const tap = await open(guest.newPage, '/t/t3');
await tap.screenshot({ path: path.join(OUT, 'tap.png') });
await guest.ctx.close();

// Desktop.
const desk = await context({ width: 1440, height: 900 }, { mobile: false });
for (const [name, route] of [['home', '/'], ['staff', '/staff'], ['money-leaks', '/money-leaks'], ['analytics', '/analytics'], ['bills', '/expenses']]) {
  const page = await open(desk.newPage, route);
  await page.screenshot({ path: path.join(OUT, `desk-${name}.png`) });
  await page.close();
}
await desk.ctx.close();

await browser.close();
if (problems.length) { console.error(`Console problems:\n${[...new Set(problems)].join('\n')}`); process.exitCode = 1; }
console.log(`Site screens written to ${OUT}`);
