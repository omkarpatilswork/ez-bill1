// Capture the real app's pieces (demo data) at 3x as plates for the film.
import { chromium } from '/home/user/ezz-bill-film/node_modules/playwright-core/index.mjs';
const OUT = '/home/user/ezz-bill-film/assets/real/';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 5, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-31T20:00:00+05:30'));
p.on('pageerror', e => console.log('pageerror:', e.message));
const hideNav = () => p.addStyleTag({ content: '.fixed.bottom-0, nav.fixed, [class*="fixed"][class*="bottom-"]{display:none!important}' });
const shot = async (loc, name) => { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await loc.screenshot({ path: OUT + name + '.png' }); console.log('saved', name); };

await p.goto('http://127.0.0.1:8091/money-leaks', { waitUntil: 'networkidle' }); await p.waitForTimeout(2200); await hideNav();
await shot(p.locator('div.rounded-3xl').filter({ hasText: 'Leaked in' }).first(), 'leak-hero');
await shot(p.getByRole('button', { name: /Fix My Biggest Leak/ }), 'fix-button');
for (const c of []) await shot(p.locator('button.glass-card').filter({ has: p.locator('span', { hasText: new RegExp('^' + c + '$') }) }).first(), 'row-' + c.toLowerCase());
await shot(p.getByText('Where Your Money Leaks').locator('xpath=..'), 'leaks-heading');
await p.getByRole('button', { name: /Fix My Biggest Leak/ }).click(); await p.waitForTimeout(1500); await p.mouse.move(5, 5);
await shot(p.locator('div.glass-card').filter({ hasText: 'Plug this leak' }).first(), 'detail-card');

await p.goto('http://127.0.0.1:8091/expenses', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); await hideNav();
for (const m of ['Myntra', 'ChatGPT Plus', 'Blinkit', 'Netflix', 'Amazon']) {
  const row = p.locator('div,button,a').filter({ has: p.locator('p,span,h3,h4', { hasText: new RegExp('^' + m + '$') }) }).filter({ hasText: '₹' });
  const n = await row.count(); // the innermost match is the row card
  await shot(row.nth(n - 1), 'bill-' + m.toLowerCase().replace(/[^a-z]+/g, '-'));
}
await b.close();
