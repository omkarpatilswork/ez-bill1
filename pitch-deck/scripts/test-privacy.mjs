#!/usr/bin/env node
// Self-test for the capture pipeline, offline: loads a fixture page with fake
// personal data and checks the two injections and the blur detection.
// Writes out/test/*.png and a short clip so you can eyeball the blurs.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INIT_SCRIPT } from './lib/inject.mjs';
import { Capturer, CaptureLog, settle, hasFfmpeg } from './lib/capture-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'test');
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
await ctx.addInitScript(INIT_SCRIPT);
const page = await ctx.newPage();
await page.goto('file://' + path.join(ROOT, 'scripts', 'test', 'fixture.html'));
await settle(page, { timeout: 3000 });
await page.screenshot({ path: path.join(OUT, 'privacy_raw.png') });

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };
const text = await page.evaluate(() => document.body.innerText);
check(!text.includes('EZZ BILLZ'), 'no "EZZ BILLZ" left in visible text (incl. text added after load)');
check((text.match(/EZZ BILL\b/g) || []).length >= 2, '"EZZ BILL" shown instead');
check(await page.evaluate(() => getComputedStyle(document.getElementById('lovable-badge')).display === 'none'), 'Lovable badge hidden');

const log = new CaptureLog(path.join(OUT, '_log.json'));
const cap = new Capturer({ outDir: OUT, clipDir: OUT, names: [], dpr: 2.625, log });
const det = await cap.detect(page, 'money-leaks');
console.log('      detected:', JSON.stringify(det.counts));
check((det.counts.email || 0) >= 1, 'email blurred');
check((det.counts.phone || 0) >= 1, 'phone blurred');
check((det.counts.id || 0) >= 2, 'payment id + UTR blurred');
check((det.counts['labelled-id'] || 0) >= 1, 'invoice number value blurred');
check((det.counts.name || 0) >= 6, 'participant + friend names blurred everywhere (learned from People chips)');
check((det.counts.profile || 0) >= 1, 'profile link blurred');
check((det.counts.merchant || 0) >= 1, 'Money Leaks "mostly <merchant>" blurred');
// things that must stay sharp
const sharpTexts = ['₹1,240.00', 'Blue Tokai Coffee', 'Cappuccino', '₹28,722', 'Gemini 2.5 Flash', 'UPI'];
const overlaps = await page.evaluate(({ rects, sharpTexts }) => {
  const hits = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) for (const s of sharpTexts) {
    const i = n.nodeValue.indexOf(s); if (i < 0) continue;
    const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + s.length);
    const r = rg.getBoundingClientRect();
    if (rects.some((b) => r.left < b.x + b.w && b.x < r.right && r.top < b.y + b.h && b.y < r.bottom)) hits.push(s);
  }
  return hits;
}, { rects: det.rects, sharpTexts });
check(overlaps.length === 0, `amounts, merchants and app copy stay sharp${overlaps.length ? ' (blurred: ' + overlaps.join(', ') + ')' : ''}`);

await cap.still(page, 'privacy_still', { route: 'money-leaks', cropBefore: ['Review queue'] });
await cap.tall(page, 'privacy_tall', { route: 'money-leaks', cropBefore: ['Review queue'] });
const tallMeta = (await (await import('sharp')).default(path.join(OUT, 'privacy_tall--tall.png')).metadata());
const reviewTop = await page.evaluate(() => [...document.querySelectorAll('h3')].find((h) => h.textContent === 'Review queue').getBoundingClientRect().top + scrollY);
check(tallMeta.height <= Math.ceil(reviewTop * 2.625), `tall capture cropped above "Review queue" (${tallMeta.height}px <= ${Math.ceil(reviewTop * 2.625)}px)`);
if (hasFfmpeg()) {
  const j = await cap.journey(page, 'privacy_scroll', { route: 'money-leaks' }).init();
  await j.hold(0.3); await j.scroll(400, 1); await j.hold(0.3);
  check(!!(await j.encode()), 'journey encoded to mp4');
}
await browser.close();
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nAll privacy checks passed. Look at out/test/*.png to eyeball the blurs.');
process.exit(fails.length ? 1 : 0);
