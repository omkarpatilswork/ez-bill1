import { chromium } from '/home/user/ezz-bill-film/node_modules/playwright-core/index.mjs';
const OUT = '/home/user/ezz-bill-film/assets/real/';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 5, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-31T20:00:00+05:30'));
await p.goto('http://127.0.0.1:8091/expenses', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
await p.addStyleTag({ content: '[class*="fixed"][class*="bottom-"]{display:none!important}' });
const want = [['Myntra', '2,499'], ['ChatGPT Plus', '1,999'], ['Blinkit', '1,240'], ['Netflix', '649'], ['Amazon', '3,149'], ['Swiggy', '486'], ['Zepto', '489'], ['Spotify', '119']];
for (const [m, a] of want) {
  // the smallest rounded card that holds both the merchant and this amount
  const id = await p.evaluate(([m, a]) => {
    const els = [...document.querySelectorAll('[class*="rounded"]')].filter(el => el.innerText.includes(m) && el.innerText.includes('₹' + a + '.00') && el.innerText.split('₹').length === 2);
    els.sort((x, y) => x.innerText.length - y.innerText.length);
    const el = els.find(e => getComputedStyle(e).borderTopWidth !== '0px') || els[0];
    if (!el) return null; el.setAttribute('data-film', m); return m;
  }, [m, a]);
  if (!id) { console.log('missing', m, a); continue; }
  const loc = p.locator(`[data-film="${m}"]`); await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
  await loc.screenshot({ path: OUT + 'bill-' + m.toLowerCase().replace(/[^a-z]+/g, '-') + '.png' }); console.log('saved', m);
}
await b.close();
