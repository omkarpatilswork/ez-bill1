#!/usr/bin/env node
// Checks for ffmpeg and yt-dlp. If one is missing on Windows, offers the winget
// command and runs it only if you answer "y" (it is a system-wide install).
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';

const isWin = process.platform === 'win32';
const tools = [
  { name: 'ffmpeg', args: ['-version'], winget: 'Gyan.FFmpeg', other: 'brew install ffmpeg  |  sudo apt install ffmpeg' },
  { name: 'yt-dlp', args: ['--version'], winget: 'yt-dlp.yt-dlp', other: 'brew install yt-dlp  |  pipx install yt-dlp' },
];
const has = (t) => spawnSync(t.name, t.args, { stdio: 'ignore', shell: isWin }).status === 0;

const missing = tools.filter((t) => !has(t));
for (const t of tools) console.log(`${has(t) ? 'ok     ' : 'missing'}  ${t.name}`);
if (!missing.length) process.exit(0);

if (!isWin) {
  for (const t of missing) console.log(`Install ${t.name}: ${t.other}`);
  process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
for (const t of missing) {
  const cmd = `winget install --id ${t.winget} -e --source winget`;
  const a = (await rl.question(`\n${t.name} is missing. Run "${cmd}" now? This installs it system-wide. [y/N] `)).trim().toLowerCase();
  if (a === 'y' || a === 'yes') {
    const r = spawnSync('winget', ['install', '--id', t.winget, '-e', '--source', 'winget'], { stdio: 'inherit', shell: true });
    console.log(r.status === 0 ? `${t.name} installed. Open a NEW terminal so PATH picks it up.` : `winget exited with ${r.status}.`);
  } else {
    console.log(`Skipped. You can run it yourself later: ${cmd}`);
  }
}
rl.close();
