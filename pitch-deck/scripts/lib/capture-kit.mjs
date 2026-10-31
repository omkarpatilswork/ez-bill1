// Shared helpers for live captures: wait for a screen to settle, take blurred
// stills (viewport and full-height), and record short blurred journeys as MP4.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { detectSensitive, blurRegions } from './privacy.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  return r.status === 0;
}

// Wait until the screen has finished loading: network quiet, no spinners or
// skeleton blocks, fonts ready, and the layout has stopped changing.
export async function settle(page, { timeout = 15000, quiet = 700 } = {}) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await page.waitForFunction(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const spinning = [...document.querySelectorAll('.animate-spin, [aria-busy="true"]')].some(vis);
    const skeleton = [...document.querySelectorAll('.animate-pulse, [class*="skeleton"]')].some((el) => { const r = el.getBoundingClientRect(); return vis(el) && r.width > 40 && r.height > 8; });
    return !spinning && !skeleton;
  }, null, { timeout, polling: 200 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  // layout stable: same height and same amount of text for `quiet` ms
  const sig = () => page.evaluate(() => `${document.documentElement.scrollHeight}:${document.body.innerText.length}`).catch(() => '');
  let last = await sig(), since = Date.now();
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await sleep(150);
    const now = await sig();
    if (now !== last) { last = now; since = Date.now(); } else if (Date.now() - since >= quiet) break;
  }
  await sleep(250); // let entry fades finish
}

// Find the element that scrolls the page (window or an inner container).
async function scrollInfo(page) {
  return page.evaluate(() => {
    window.__ezbScroller = null;
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > window.innerHeight + 4) return { kind: 'window', max: se.scrollHeight - window.innerHeight };
    let best = null;
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 4) continue;
      if (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth) best = el;
    }
    if (!best) return { kind: 'none', max: 0 };
    window.__ezbScroller = best; // a JS reference only; the DOM is not modified
    return { kind: 'inner', max: best.scrollHeight - best.clientHeight };
  });
}
async function scrollTo(page, y) {
  await page.evaluate((y) => {
    const el = window.__ezbScroller;
    if (el && el.isConnected) el.scrollTop = y; else window.scrollTo(0, y);
  }, y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Top (CSS px, document coordinates) of the first element whose text matches
// one of `texts`. Used to crop captures above sections we must not show.
export async function topOfText(page, texts) {
  return page.evaluate((texts) => {
    let best = null;
    for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,div,button,a')) {
      if (el.children.length > 4) continue;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!texts.some((x) => t === x || (t.startsWith(x) && t.length < x.length + 40))) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const y = r.top + window.scrollY;
      if (best === null || y < best) best = y;
    }
    return best;
  }, texts);
}

export class Capturer {
  constructor({ outDir, clipDir, names, dpr, log }) {
    Object.assign(this, { outDir, clipDir, names, dpr, log });
  }

  async detect(page, route) {
    return page.evaluate(detectSensitive, { names: this.names, route });
  }

  // Still of the current viewport. cropBefore: texts whose section must not appear.
  async still(page, name, { route = '', cropBefore = null } = {}) {
    const det = await this.detect(page, route);
    let buf = await page.screenshot({ type: 'png' });
    buf = await blurRegions(buf, det.rects, this.dpr, { format: 'png' });
    let crop = null;
    if (cropBefore) {
      const top = await topOfText(page, cropBefore);
      const scrollY = await page.evaluate(() => window.scrollY);
      if (top !== null && top - scrollY < page.viewportSize().height) crop = Math.max(0, Math.floor((top - scrollY - 16) * this.dpr));
    }
    if (crop !== null) buf = await (await import('sharp')).default(buf).extract({ left: 0, top: 0, width: page.viewportSize().width * this.dpr | 0, height: Math.max(1, crop) }).png().toBuffer();
    const file = path.join(this.outDir, `${name}.png`);
    await fs.writeFile(file, buf);
    this.log.add({ file, kind: 'still', route, viewport: page.viewportSize(), dpr: this.dpr, blurred: det.counts, cropPx: crop, learnedNames: det.learnedNameSources });
    console.log(`  saved ${path.relative(process.cwd(), file)}  blurred ${JSON.stringify(det.counts)}${crop !== null ? ` cropped at ${crop}px` : ''}`);
    return file;
  }

  // Full-height still: grow the viewport to the content height, shoot, restore.
  async tall(page, name, { route = '', cropBefore = null, maxHeight = 7000 } = {}) {
    const vp = page.viewportSize();
    await scrollTo(page, 0);
    let h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const info = await scrollInfo(page);
    if (info.kind === 'inner') h = vp.height + info.max;
    h = Math.min(Math.max(h, vp.height), maxHeight);
    await page.setViewportSize({ width: vp.width, height: h });
    await settle(page, { timeout: 6000, quiet: 500 });
    const det = await this.detect(page, route);
    let buf = await page.screenshot({ type: 'png' });
    buf = await blurRegions(buf, det.rects, this.dpr, { format: 'png' });
    let crop = null;
    if (cropBefore) {
      const top = await topOfText(page, cropBefore);
      if (top !== null) crop = Math.max(1, Math.floor((top - 16) * this.dpr));
    }
    const sharp = (await import('sharp')).default;
    if (crop !== null) buf = await sharp(buf).extract({ left: 0, top: 0, width: Math.round(vp.width * this.dpr), height: Math.min(crop, (await sharp(buf).metadata()).height) }).png().toBuffer();
    await page.setViewportSize(vp);
    await settle(page, { timeout: 4000, quiet: 300 });
    const file = path.join(this.outDir, `${name}--tall.png`);
    await fs.writeFile(file, buf);
    this.log.add({ file, kind: 'tall', route, viewport: { width: vp.width, height: h }, dpr: this.dpr, blurred: det.counts, cropPx: crop, learnedNames: det.learnedNameSources });
    console.log(`  saved ${path.relative(process.cwd(), file)}  (${h}px tall) blurred ${JSON.stringify(det.counts)}${crop !== null ? ` cropped at ${crop}px` : ''}`);
    return file;
  }

  journey(page, name, { route = '', fps = 30 } = {}) {
    return new Journey(this, page, name, { route, fps });
  }
}

// A journey is recorded frame by frame: every frame is a real screenshot with
// its own privacy pass, so blurs follow the content while it moves.
class Journey {
  constructor(cap, page, name, { route, fps }) {
    Object.assign(this, { cap, page, name, route, fps });
    this.frames = []; // { file, hold }
    this.dir = path.join(cap.clipDir, `.frames-${name}`);
    this.blurTotals = {};
  }
  async init() { await fs.rm(this.dir, { recursive: true, force: true }); await fs.mkdir(this.dir, { recursive: true }); return this; }
  async frame(hold = 1) {
    const det = await this.cap.detect(this.page, this.route);
    for (const [k, v] of Object.entries(det.counts)) this.blurTotals[k] = Math.max(this.blurTotals[k] || 0, v);
    const raw = await this.page.screenshot({ type: 'jpeg', quality: 95 });
    const buf = await blurRegions(raw, det.rects, this.cap.dpr, { format: 'jpeg', quality: 92 });
    const file = path.join(this.dir, `k_${String(this.frames.length).padStart(5, '0')}.jpg`);
    await fs.writeFile(file, buf);
    this.frames.push({ file, hold: Math.max(1, Math.round(hold)) });
  }
  async hold(seconds) { await this.frame(seconds * this.fps); }
  // Capture as fast as we can for `ms`, holding each frame for the real time it
  // stayed on screen (capped so long waits get compressed).
  async realtime(ms, { capFrames = 15, until = null } = {}) {
    const end = Date.now() + ms;
    let last = Date.now();
    while (Date.now() < end) {
      await this.frame(1);
      const now = Date.now();
      this.frames[this.frames.length - 1].hold = Math.min(capFrames, Math.max(1, Math.round(((now - last) / 1000) * this.fps)));
      last = now;
      if (until && (await until())) break;
    }
  }
  // Smooth eased scroll from the current position to `toY` (CSS px) over `seconds`.
  async scroll(toY, seconds = 2.5) {
    const info = await scrollInfo(this.page);
    const from = await this.page.evaluate(() => { const el = window.__ezbScroller; return el && el.isConnected ? el.scrollTop : window.scrollY; });
    const target = Math.max(0, Math.min(info.max, toY));
    const n = Math.max(2, Math.round(seconds * this.fps));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
      await scrollTo(this.page, from + (target - from) * e);
      await this.frame(1);
    }
  }
  async scrollMax() { return (await scrollInfo(this.page)).max; }
  async encode() {
    if (!hasFfmpeg()) { console.log(`  ffmpeg missing: kept frames in ${this.dir}`); return null; }
    // expand holds into a numbered sequence
    const seq = path.join(this.dir, 'seq');
    await fs.mkdir(seq, { recursive: true });
    let i = 0;
    for (const f of this.frames) for (let h = 0; h < f.hold; h++) await fs.copyFile(f.file, path.join(seq, `f_${String(i++).padStart(6, '0')}.jpg`));
    const final = path.join(this.cap.clipDir, `${this.name}.mp4`);
    const tmp = path.join(this.cap.clipDir, `${this.name}.tmp.mp4`);
    const code = await new Promise((resolve) => {
      const p = spawn('ffmpeg', ['-y', '-v', 'error', '-framerate', String(this.fps), '-i', path.join(seq, 'f_%06d.jpg'),
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], { stdio: 'inherit' });
      p.on('close', resolve);
    });
    if (code !== 0) { await fs.rm(tmp, { force: true }); throw new Error(`ffmpeg failed for ${this.name} (exit ${code})`); }
    await fs.rename(tmp, final);
    await fs.rm(this.dir, { recursive: true, force: true });
    const seconds = i / this.fps;
    this.cap.log.add({ file: final, kind: 'journey', route: this.route, seconds: Number(seconds.toFixed(2)), fps: this.fps, dpr: this.cap.dpr, blurredMaxPerFrame: this.blurTotals });
    console.log(`  saved ${path.relative(process.cwd(), final)} (${seconds.toFixed(1)} s) blurred ${JSON.stringify(this.blurTotals)}`);
    return final;
  }
}

export class CaptureLog {
  constructor(file) { this.file = file; this.entries = []; }
  async load() { try { this.entries = JSON.parse(await fs.readFile(this.file, 'utf8')).entries || []; } catch { this.entries = []; } return this; }
  add(e) {
    const rel = { ...e, file: path.relative(path.dirname(path.dirname(this.file)), e.file).split(path.sep).join('/'), at: new Date().toISOString() };
    this.entries = this.entries.filter((x) => x.file !== rel.file);
    this.entries.push(rel);
    return fs.writeFile(this.file, JSON.stringify({ note: 'Written by scripts/capture-live.mjs. Counts are how many regions were blurred, by reason. No captured text is stored here.', entries: this.entries }, null, 2));
  }
}
