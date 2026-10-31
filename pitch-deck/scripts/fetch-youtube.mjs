#!/usr/bin/env node
// Downloads your real-world NFC demo (https://youtu.be/RGl08gM4TGk) into
// assets/video/raw/, then makes a frame strip (one frame every 2 s) so we can
// pick the 10-15 s cut for slide 6. The cut itself is non-destructive: it is a
// start/end pair in assets.json, so the full file is never edited.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://youtu.be/RGl08gM4TGk';
const RAW = path.join(ROOT, 'assets', 'video', 'raw');
const OUT = path.join(RAW, 'real-cafe-test.mp4');
const isWin = process.platform === 'win32';
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: isWin });

if (spawnSync('yt-dlp', ['--version'], { stdio: 'ignore', shell: isWin }).status !== 0) {
  console.error('yt-dlp is missing. Run: npm run check-tools'); process.exit(1);
}
fs.mkdirSync(RAW, { recursive: true });
const tmp = path.join(RAW, 'real-cafe-test.download.%(ext)s');
const r = run('yt-dlp', ['-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4',
  '--write-info-json', '--no-playlist', '-o', tmp, URL]);
if (r.status !== 0) { console.error(`yt-dlp exited with ${r.status}`); process.exit(1); }
const got = fs.readdirSync(RAW).find((f) => f.startsWith('real-cafe-test.download.') && f.endsWith('.mp4'));
if (!got) { console.error('Download finished but no mp4 found'); process.exit(1); }
fs.renameSync(path.join(RAW, got), OUT);
console.log(`saved ${path.relative(ROOT, OUT)}`);

const strip = path.join(RAW, 'real-cafe-test_frames.jpg');
const f = run('ffmpeg', ['-y', '-v', 'error', '-i', OUT, '-vf', "fps=1/2,scale=320:-2,drawtext=text='%{pts\\:hms}':x=8:y=8:fontcolor=white:box=1:boxcolor=black@0.6,tile=6x6", '-frames:v', '1', strip]);
if (f.status === 0) console.log(`frame strip: ${path.relative(ROOT, strip)} (timestamps on each frame)`);
console.log('\nNext: tell Claude which 10-15 s to use for slide 6, or edit "trim" for video.real-cafe-test in assets.json.');
