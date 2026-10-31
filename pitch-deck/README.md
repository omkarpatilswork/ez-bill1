# EZZ BILL pitch deck v1

Animated pitch deck whose product slides show the real app. Every slide is a reusable 1920×1080 video scene.

**Status: Step 1 (gather assets).** The deck itself (Vite + React + TypeScript + GSAP, `npm run deck`, `npm run render`, `npm run pdf`) comes in Step 2, after you OK the assets.

This folder lives on the `claude/elegant-wright-gjkfzf` branch of `ez-bill1` and touches nothing in the app. Don't merge it into `main`.

## What's here

| Path | What |
|---|---|
| `assets.json` | Every image, clip and font, with its source, honesty label and status. Scenes ask for an id; version 2 swaps a file by editing this only. |
| `assets/site-demo/` | Demo-data app screens (ezzbill.com set, copied from your repos) |
| `assets/founder/`, `assets/jerseydrip/`, `assets/bijlee/`, `assets/logos/` | From omkarpatil.in |
| `assets/racked/` | Racked screenshots from the racked-app repo |
| `assets/video/` | Site phone walkthrough; your YouTube clip goes in `raw/` |
| `assets/fonts/` | Archivo, Schibsted Grotesk, Martian Mono (OFL) |
| `screens/live/`, `clips/journeys/` | Live captures from your account (gitignored) |
| `out/contact-sheet/` | Contact sheet: `index.html` plus one JPG per source |

## Run the captures on your Windows machine

The live captures need your login, so they run on your computer, not in the cloud.

```bash
git clone -b claude/elegant-wright-gjkfzf https://github.com/omkarpatilswork/ez-bill1
cd ez-bill1/pitch-deck
npm install
npx playwright install chromium
npm run check-tools          # finds ffmpeg / yt-dlp; offers winget and asks before installing
```

1. Put the bill photo for the test at `assets/sample_bill.jpg`. Check it shows no person's name or phone number.
2. Copy `capture/private-names.example.txt` to `capture/private-names.txt` and list the names to blur.
3. `npm run capture -- --login`: a Chrome window opens. Log in to ezbill.live yourself, then press Enter in the terminal. The session is kept in `./.profile` (gitignored).
4. `npm run capture`: runs every capture. It sends **one** ₹600 test bill to Table 3, opens `/t/t3` in a separate logged-out window, then captures the rest. Re-runs don't send again (`--resend` overrides). Pick steps with `--only=staff,tap,nfc-airdrop,expenses,bill,split,bulk-upload,email-bills,warranties,subscriptions,money-leaks,ask-ai,staff-desktop`.
5. `npm run capture:racked`: Racked home and leaderboard (log in if it asks).
6. `npm run fetch:youtube`: downloads https://youtu.be/RGl08gM4TGk and makes a frame strip with timestamps for choosing the slide 6 cut.
7. `npm run contact-sheet`, then open `out/contact-sheet/index.html` and check every blur.

### What the capture changes, and what it never does

- Before each capture it injects exactly two things: it hides the "Edit with Lovable" badge, and shows "EZZ BILLZ" as "EZZ BILL".
- Blurs are applied to the saved image, not the page: email addresses, people's names (your list, plus names it finds in split chips and the profile link), invoice, order and payment IDs, phone numbers, profile photos, and merchant names on Money Leaks. It blurs and never replaces anything. `npm run test:privacy` checks this against a fixture page.
- It never opens `/summary`, `/splits`, `/financial-docs`, `/profile` or `/settings`. It crops `/subscriptions` above the review queue and `/money-leaks` above "Why It's Happening". On the split screen it only switches the view to Custom and never presses Save.
- Phone captures are 412×915 at device scale 2.625 (1082×2402 px). `/staff` is also captured at 1920×1080 (@2x). Each screen gets a viewport still and a full-height `--tall` still, and the main flows also get a short MP4 recorded frame by frame, with blurs that follow the content.

### Getting the captures back for the deck

`screens/live/` and `clips/journeys/` are gitignored, because `ez-bill1` is a public repo. To hand them over, push them to a private repo, or say so and I'll set the folder up differently.

## Labels

Set in `assets.json` → `labels`: site screens show "Demo data", live captures show "Live app, personal details blurred", and the YouTube clip shows "Real cafe test". Racked screens show "Racked app" until you choose wording.
