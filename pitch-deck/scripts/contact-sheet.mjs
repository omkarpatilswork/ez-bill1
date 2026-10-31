#!/usr/bin/env node
// Contact sheet of everything in assets.json, grouped and labelled by source,
// with flags. Writes out/contact-sheet/index.html and one JPG per section.
// Re-run after `npm run capture` to include your live captures.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'contact-sheet');
const THUMBS = path.join(OUT, 'thumbs');
fs.mkdirSync(THUMBS, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets.json'), 'utf8'));
let capLog = [];
try { capLog = JSON.parse(fs.readFileSync(path.join(ROOT, 'screens', 'live', '_capture-log.json'), 'utf8')).entries; } catch {}
const isWin = process.platform === 'win32';
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: isWin }).status === 0;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rel = (p) => path.relative(OUT, path.join(ROOT, p)).split(path.sep).join('/');
const exists = (p) => p && fs.existsSync(path.join(ROOT, p));

function videoStrip(id, file, trim) {
  if (!hasFfmpeg || !exists(file)) return null;
  const out = path.join(THUMBS, `${id.replace(/\W+/g, '_')}.jpg`);
  const args = ['-y', '-v', 'error'];
  if (trim && trim.start != null) args.push('-ss', String(trim.start));
  args.push('-i', path.join(ROOT, file), '-vf', "fps=1/3,scale=-2:420,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,tile=7x2:padding=6:color=0x0F1713", '-frames:v', '1', out);
  const r = spawnSync('ffmpeg', args, { stdio: 'ignore', shell: isWin });
  return r.status === 0 ? path.relative(OUT, out).split(path.sep).join('/') : null;
}

const SECTIONS = [
  ['site-demo', 'Site demo data', 'ezzbill.com app screens with demo data. On slides they carry the tag “Demo data”.'],
  ['live', 'Live app, blurred', 'ezbill.live from your account, captured on your machine with blurs. Tag: “Live app, personal details blurred”.'],
  ['youtube', 'YouTube', 'Your real-world NFC demo. Tag: “Real cafe test”.'],
  ['racked', 'Racked', 'Racked screenshots (your gym NFC test).'],
  ['founder-site', 'Founder site', 'omkarpatil.in photos and images for the proof and founder slides. No tag.'],
  ['font', 'Fonts', 'Archivo (headlines), Schibsted Grotesk (body), Martian Mono (numbers).'],
  ['input', 'Inputs you provide', ''],
];

function card(id, it) {
  const ok = it.file ? exists(it.file) : it.files?.every(exists);
  const label = manifest.labels[it.label];
  const flags = [...(it.flags || [])];
  const logged = it.file && capLog.find((e) => e.file === it.file);
  if (logged?.blurred) {
    const n = Object.entries(logged.blurred || logged.blurredMaxPerFrame || {}).map(([k, v]) => `${v} ${k}`).join(', ');
    if (n) flags.unshift(`Blurred: ${n}. Check nothing personal is still readable.`);
  }
  if (!ok && it.status !== 'pending-capture') flags.unshift('FILE MISSING');
  let media;
  if (it.type === 'font') {
    media = `<div class="font" style="font-family:'${esc(it.family)}'"><b>${esc(it.family)}</b><span>UPI solved payments. ₹24.07B 711 140</span></div>`;
  } else if (!ok) {
    media = `<div class="pending"><span>${it.status === 'pending-capture' ? 'Waiting for capture on your machine' : 'Missing'}</span><code>${esc(it.file)}</code></div>`;
  } else if (it.type === 'video') {
    const strip = videoStrip(id, it.file, it.trim);
    media = strip ? `<img class="strip" src="${esc(strip)}">` : `<img src="${esc(rel(it.poster || it.file))}">`;
  } else {
    const [w, h] = it.size || [1, 1];
    const tall = h / w > 2.4;
    const crop = it.cropBeforeY ? `style="object-position:top"` : '';
    const kind = w > h ? 'wide' : h / w > 1.8 ? 'phone' : 'photo';
    media = `<div class="thumb ${kind}${tall ? ' tall' : ''}"><img src="${esc(rel(it.file))}" ${crop}></div>`;
  }
  const meta = [it.size ? `${it.size[0]}×${it.size[1]}` : '', it.duration ? `${it.duration}s` : '', it.type === 'font' ? it.files.length + ' files' : ''].filter(Boolean).join(' · ');
  return `<figure class="${ok ? '' : 'is-pending'}">
    ${media}
    <figcaption>
      <div class="row"><b>${esc(id)}</b>${label ? `<span class="tag">${esc(label)}</span>` : ''}${it.status === 'pending-capture' && !ok ? '<span class="tag wait">pending</span>' : ''}</div>
      <div class="note">${esc(it.notes || '')}</div>
      <div class="file">${esc(it.file || (it.files || []).join(', '))}${meta ? ' · ' + esc(meta) : ''}</div>
      <div class="src">Source: ${esc(it.source)}</div>
      ${flags.map((f) => `<div class="flag">⚑ ${esc(f)}</div>`).join('')}
    </figcaption>
  </figure>`;
}

const fontFaces = Object.values(manifest.items).filter((i) => i.type === 'font')
  .flatMap((i) => i.files.map((f) => `@font-face{font-family:'${i.family}';src:url('${rel(f)}') format('woff2');font-weight:100 900;font-display:block}`)).join('\n');

const counts = Object.values(manifest.items).reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {});
const html = `<!doctype html><html><head><meta charset="utf-8"><title>EZZ BILL deck: assets contact sheet</title>
<style>
${fontFaces}
:root{--bg:#0F1713;--panel:#111915;--line:#22302a;--green:#47C48A;--gold:#C98A10;--text:#E9EFEA;--muted:#93A39A;--flag:#F2B544}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 'Schibsted Grotesk',system-ui,sans-serif;width:2400px}
header{padding:40px 48px 8px}h1{font:800 44px/1 'Archivo',sans-serif;margin:0 0 10px}header p{color:var(--muted);margin:4px 0}
section{padding:28px 48px 40px;border-top:1px solid var(--line)}h2{font:700 30px/1 'Archivo',sans-serif;margin:0 0 6px}section>p{color:var(--muted);margin:0 0 20px}
.grid{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;width:360px}
figure:has(.wide),figure:has(.strip){width:744px}
.thumb{border-radius:10px;overflow:hidden;background:#000;display:flex;justify-content:center}
.thumb img{display:block;width:100%;height:auto}
.thumb.phone img{height:700px;width:auto;max-width:100%;object-fit:cover;object-position:top}
.thumb.tall img{width:100%;height:700px;object-fit:cover;object-position:top}
.thumb.wide img,.thumb.photo img{width:100%;height:auto}
img.strip{width:100%;border-radius:10px;display:block}
.pending{height:300px;border:2px dashed #3a4a42;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted);text-align:center;padding:12px}
.pending code{font:12px 'Martian Mono',monospace;color:#6f8077}
.font{height:140px;display:flex;flex-direction:column;justify-content:center;gap:8px}.font b{font-size:30px}.font span{font-size:20px;color:var(--muted)}
figcaption{margin-top:10px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row b{font:500 13px 'Martian Mono',monospace}
.tag{font-size:12px;padding:2px 8px;border-radius:999px;background:rgba(71,196,138,.15);color:var(--green);border:1px solid rgba(71,196,138,.35)}
.tag.wait{background:rgba(201,138,16,.12);color:var(--gold);border-color:rgba(201,138,16,.4)}
.note{margin-top:6px}.file,.src{color:var(--muted);font-size:12.5px;margin-top:4px;word-break:break-all}.file{font-family:'Martian Mono',monospace;font-size:11.5px}
.flag{margin-top:6px;color:var(--flag);font-size:13.5px}
</style></head><body>
<header><h1>EZZ BILL deck v1 · assets contact sheet</h1>
<p>${Object.keys(manifest.items).length} entries in assets.json · ${counts.ready || 0} ready · ${counts['pending-capture'] || 0} waiting for captures on your machine. Flags (⚑) are things that look broken, odd or still personal.</p></header>
${SECTIONS.map(([key, title, sub]) => {
  const items = Object.entries(manifest.items).filter(([, i]) => i.sourceType === key);
  if (!items.length) return '';
  return `<section id="${key}"><h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="grid">${items.map(([id, it]) => card(id, it)).join('')}</div></section>`;
}).join('\n')}
</body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(OUT, 'index.html'));
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))); });
let n = 0;
for (const f of fs.readdirSync(OUT)) if (/^\d\d_.*\.jpg$/.test(f)) fs.rmSync(path.join(OUT, f));
await page.locator('header').screenshot({ path: path.join(OUT, `${String(n++).padStart(2, '0')}_header.jpg`), type: 'jpeg', quality: 88 });
for (const [key] of SECTIONS) {
  const s = page.locator(`section#${key}`);
  if (!(await s.count())) continue;
  await s.screenshot({ path: path.join(OUT, `${String(n++).padStart(2, '0')}_${key}.jpg`), type: 'jpeg', quality: 88 });
}
await browser.close();
console.log(`contact sheet: ${path.relative(ROOT, OUT)}/index.html and ${n} section images`);
