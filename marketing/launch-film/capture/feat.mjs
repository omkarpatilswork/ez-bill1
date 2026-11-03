// Take two: the five feature screens of the real app (demo data) at 5x, top of each screen.
import { chromium } from '/home/user/ezz-bill-film/node_modules/playwright-core/index.mjs';
const OUT = '/home/user/ezz-bill-film/assets/real/';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 5, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-31T20:00:00+05:30'));
p.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 160)));
for (const [route, name, h] of [['/email-bills', 'screen-import', 800], ['/subscriptions', 'screen-subs', 900]]) {
  await p.setViewportSize({ width: 430, height: Math.max(932, h) });
  await p.goto('http://127.0.0.1:8091' + route, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await p.addStyleTag({ content: '[class*="fixed"][class*="bottom-"]{display:none!important}' }); await p.mouse.move(2, 2); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + name + '.png', clip: { x: 0, y: 0, width: 430, height: h } }); console.log('saved', name);
}
await b.close();
