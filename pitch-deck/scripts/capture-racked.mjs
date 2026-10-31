#!/usr/bin/env node
// Racked screenshots (home + leaderboard) at the phone viewport, from your own
// login. Other members' names and photos are blurred in the saved image; your
// own row shows as "You".
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Capturer, CaptureLog, settle } from './lib/capture-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.RACKED_BASE || 'https://racked-app-liard.vercel.app').replace(/\/$/, '');
const OUT = path.join(ROOT, 'screens', 'live');
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };
const channel = process.env.EZB_CHANNEL ?? 'chrome';

await fs.mkdir(OUT, { recursive: true });
const opts = { headless: false, ...PHONE, ignoreDefaultArgs: ['--enable-automation'] };
const ctx = await chromium.launchPersistentContext(path.join(ROOT, '.profile-racked'), { ...opts, channel: channel || undefined })
  .catch(() => chromium.launchPersistentContext(path.join(ROOT, '.profile-racked'), opts));
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await settle(page);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('\nIf Racked asks you to sign in, do it in the browser window yourself, then press Enter here... ');
rl.close();

const log = await new CaptureLog(path.join(OUT, '_capture-log.json')).load();
const cap = new Capturer({ outDir: OUT, clipDir: path.join(ROOT, 'clips', 'journeys'), names: [], dpr: PHONE.deviceScaleFactor, log });
for (const [route, name] of [['/', 'racked_home'], ['/leaderboard', 'racked_leaderboard']]) {
  console.log(`\n${route}`);
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await cap.still(page, name, { route: 'racked' });
  await cap.tall(page, name, { route: 'racked' });
}
await ctx.close();
console.log('\nDone.');
