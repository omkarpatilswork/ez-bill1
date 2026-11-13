# Screenshots of the redesigned screens

`capture.mjs` opens the local dev server in a headless browser and photographs
the redesigned screens ("Ink & Paper") in dark and light, at phone size
(390x844) and desktop size (1440x900).

It never talks to a real backend. Every Supabase request is answered from
`demo-world.mjs`: Aarav Mehta's bills at 13:20 on 19 Oct 2026, with the Blue
Tokai Coffee bill (2 Cappuccino + 1 Almond Croissant = 412) as the latest one.
Anything that is not mocked is blocked. The session in the browser is a fake
one for a user that does not exist.

```bash
npx vite --host 127.0.0.1 --port 8080
```

```bash
node scripts/screens/capture.mjs
```

Images land in `scripts/screens/out/` (git-ignored), or in the folder given as
the first argument. Set `CHROMIUM_PATH` to use a Chromium that is already
installed instead of the one Playwright downloads.

Screens covered: `/` (Home) and `/expenses/:id` (Bill detail), plus the
"Add a bill" sheet and a shopping bill that shows the Return window and
Warranty vault rows.
