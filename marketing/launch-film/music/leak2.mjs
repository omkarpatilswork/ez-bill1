// "Leak, take two", 120 bpm, 15 bars of 4/4 (30 s): pings, a drive under the five features, a breath, a lift, home.
// Story map (t at 120 bpm, bar = 2 s):
//   bars 1-2  (0-4)    pings: a light pluck ostinato, quiet offbeat hats; beat 8 of bar 2 is a breath
//   bars 3-7  (4-14)   the red ₹5,615 lands on bar 3 (the drop): kick, bass, pad, the hook in A minor
//   bar 8     (14-16)  the tap: thin out to pad + pluck
//   bars 9-11 (16-22)  ₹32,952: the lift to C major, brighter hook
//   bar 12    (22-)    the end card's last chord rings
import { line } from "/root/.claude/skills/take-one/scripts/music/plan.mjs";
const BPB = 4, BARS = 15, BPM = 120;
const L = (t, s, role, v = 0.7, extra = {}) => line(t, s, { role, v, bpb: BPB, ...extra });
const byBar = (role, v, fn, extra = {}) => { const out = []; for (let b = 0; b < BARS; b++) { const s = fn(b); if (s) out.push(...L(b * 4, s, role, v, extra)); } return out; };
const CH = ["Am", "F", "Am", "F", "C", "G", "Am", "F", "C", "G", "F", "C", "G", "F", "C"];
const VO = { Am: "[A3 C4 E4]", F: "[F3 A3 C4]", C: "[G3 C4 E4]", G: "[G3 B3 D4]" };
const ROOT = { Am: "A1", F: "F1", C: "C2", G: "G1" };
const OST = { Am: ["A4", "E4", "C5", "E4"], F: ["A4", "F4", "C5", "F4"], C: ["G4", "E4", "C5", "E4"], G: ["G4", "D4", "B4", "D4"] };
const ost = (c, cut) => { const n = OST[c]; const a = [0, 1, 2, 3, 0, 1, 2, 3].map(i => n[i] + ":.5"); return cut ? a.slice(0, 6).join(" ") + " r:1" : a.join(" "); };
const LEAD = [null, null,
  "E5:1 r:.5 A5:.5 G5:.5 E5:.5 D5:1",   // 3  the drop: Gmail synced
  "C5:1.5 D5:.5 E5:1 r:1",              // 4
  "E5:1 r:.5 G5:.5 E5:.5 D5:.5 C5:1",   // 5  split
  "D5:1.5 B4:.5 D5:1 r:1",              // 6
  "E5:1 r:.5 A5:.5 C6:.5 B5:.5 A5:1",   // 7  subscriptions
  "G5:1.5 E5:.5 D5:1 r:1",              // 8
  "E5:1 r:.5 G5:.5 C6:.5 B5:.5 G5:1",   // 9  warranties
  "D5:1.5 B4:.5 G5:1 r:1",              // 10
  "A5:2 r:2",                           // 11 the concierge: a breath
  "G5:1 r:.5 C6:.5 B5:.5 G5:.5 E5:1",   // 12 the lift: money leaks
  "D5:1.5 G5:.5 B5:1 r:1",              // 13
  "A5:1 G5:.5 F5:.5 E5:1 D5:1",         // 14 the end card
  "C5:4"];                              // 15 home
const on = (b) => b >= 2 && b !== 10 && b <= 13;
export default () => {
  const pluck = byBar("inner", 0.55, b => b === 14 ? null : ost(CH[b], b === 1), {});
  const pad = byBar("accomp", 0.6, b => b < 2 ? null : `${VO[CH[b]]}:4`, { roll: 0.02 });
  const lead = byBar("melody", 0.74, b => LEAD[b]);
  const bass = byBar("bass", 0.75, b => !on(b) ? (b === 14 ? "C2:4" : null) : Array(8).fill(ROOT[CH[b]].replace("1", "2") + ":.5").join(" "));
  const kick = byBar("drum", 0.85, b => on(b) ? "C4:1 C4:1 C4:1 C4:1" : b === 14 ? "C4:1 r:3" : null);
  const snare = byBar("drum", 0.7, b => on(b) && b > 2 ? "r:1 C4:1 r:1 C4:1" : null);
  const hats = byBar("drum", 0.5, b => b === 10 || b === 14 ? null : b < 2 ? "r:.5 C4:.5@.5 r:.5 C4:.5@.5 r:.5 C4:.5@.5 r:.5 C4:.5@.6" : "r:.5 C4:.5 r:.5 C4:.5 r:.5 C4:.5 r:.5 C4:.5");
  const harmony = CH.map((name, b) => ({ t: b * 4, name }));
  return {
    title: "Leak, take two (EZZ BILL, 120)", seed: 5616, tail: 3.0, harmony,
    plan: {
      style: "drive", tempo: BPM, meter: "4/4", swing: 0.5, phraseBars: 4,
      sections: [
        { id: "pings", bars: 2, mood: "tension", key: "A", mode: "aeolian", melody: ["ostinato"], dyn: [0.45, 0.6] },
        { id: "drop", bars: 8, mood: "drive", key: "A", mode: "aeolian", melody: ["hook"], dyn: [0.75, 0.8] },
        { id: "tap", bars: 1, mood: "tension", key: "A", mode: "aeolian", melody: ["hook"], dyn: [0.55, 0.6] },
        { id: "lift", bars: 4, mood: "triumph", key: "C", mode: "major", melody: ["hook"], dyn: [0.8, 0.7], ending: true },
      ],
    },
    parts: [
      { id: "pluck", inst: "softPluck", role: "inner", notes: pluck, gainDb: -2, opts: { decay: 0.25, bright: 4200, grid: true }, send: 0.2, pan: -0.15 },
      { id: "pad", inst: "warmPad", role: "accomp", notes: pad, gainDb: -6, opts: { cut: 2400, attack: 0.08, release: 0.9, spread: 0.7 }, send: 0.3 },
      { id: "lead", inst: "softPluck", role: "melody", notes: lead, gainDb: 3, opts: { decay: 0.5, bright: 5600, delay: 0.375, feedback: 0.25, delayMix: 0.22 }, send: 0.25, pan: 0.1 },
      { id: "bass", inst: "bass", role: "bass", notes: bass, gainDb: -4, opts: { grid: true } },
      { id: "kick", inst: "kick", role: "drum", notes: kick, gainDb: 0, opts: { grid: true }, send: 0.05 },
      { id: "snare", inst: "snare", role: "drum", notes: snare, gainDb: 3, opts: { grid: true }, send: 0.25 },
      { id: "hat", inst: "hat", role: "drum", notes: hats, gainDb: 14, opts: { pan: 0.2, grid: true }, send: 0.1 },
    ],
    fx: { duck: { by: "kick", parts: ["pad", "bass"], depth: 0.3, release: 0.2 } },
  };
};
