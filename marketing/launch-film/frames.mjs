// Render review frames of film.html (served over local http) + a contact sheet.
// Usage: node frames.mjs <portrait 0|1> <t1,t2,...>     env: FILM=film.html W=1920 H=1080
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
const portrait = process.argv[2] === '1';
const times = (process.argv[3] || '0,1,2,3,4,5').split(',').map(Number);
const FILM = process.env.FILM || 'film.html';
const W = Number(process.env.W || (portrait ? 1080 : 1920)), H = Number(process.env.H || (portrait ? 1350 : 1080));
const dir = (FILM === 'film.html' ? 'review/' : 'review-' + FILM.replace('.html', '') + '/') + (portrait ? 'portrait' : 'square');
fs.mkdirSync(dir, { recursive: true });
const { srv, url } = await serve('.');
// Metal is the Mac's graphics engine: ask for it on a Mac only, every other system keeps Chrome's own choice
const GPU = process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url + '/' + FILM + (portrait ? '?portrait=1' : ''));
await page.waitForFunction(() => typeof window.renderFrame === 'function' && window.READY === true, null, { timeout: 120000 });
for (const t of times) {
  const b64 = await page.evaluate(async (t) => { await window.renderFrame(t); const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; return c.toDataURL('image/png').split(',')[1]; }, t);
  fs.writeFileSync(`${dir}/t${t.toFixed(2).padStart(5, '0')}.png`, Buffer.from(b64, 'base64'));
}
await browser.close(); srv.close();
const cols = 6, rows = Math.max(1, Math.ceil(fs.readdirSync(dir).filter(f => /^t.*\.png$/.test(f)).length / cols)); // grid grows with the frame count (a fixed 6x4 dropped frames past 24)
// a concat list instead of -pattern_type glob: the Windows ffmpeg builds have no glob support
const list = `${dir}/sheet-list.txt`; fs.writeFileSync(list, fs.readdirSync(dir).filter(f => /^t.*\.png$/.test(f)).sort().map(f => `file '${f}'`).join('\n') + '\n');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=360:-1,tile=${cols}x${rows}:padding=6:color=gray`, '-frames:v', '1', `${dir}/sheet.png`]); fs.unlinkSync(list);
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'no console errors', '\nframes + sheet:', dir);
