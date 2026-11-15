/**
 * Renders the share image (public/og-image.png, 1200 x 630) from og-image.tsx,
 * with the app's own fonts, slip and colours. Needs the dev server running:
 *
 *   npx vite --host 127.0.0.1 --port 8080
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/screens/og/make-og-image.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const OUT = path.resolve(here, '../../../public/og-image.png');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/scripts/screens/og/og-image.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(`Wrote ${OUT}`);
