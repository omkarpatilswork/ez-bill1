// Open a route of the real app (demo data) in a phone viewport at 3x and screenshot it.
import { chromium } from '/home/user/ezz-bill-film/node_modules/playwright-core/index.mjs';
const [route = '/money-leaks', out = 'probe.png', full = '1'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-31T20:00:00+05:30'));
p.on('pageerror', e => console.log('pageerror:', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
await p.goto('http://127.0.0.1:8091' + route, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
console.log('url', p.url());
await p.screenshot({ path: '/home/user/ezz-bill-film/capture/' + out, fullPage: full === '1' });
await b.close();
