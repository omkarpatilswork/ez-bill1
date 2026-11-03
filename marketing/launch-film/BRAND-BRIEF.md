# EZZ BILL: brand brief and guidelines (for the 30 s launch film)

Audited 2026-11-03 from the app's own source (`omkarpatilswork/ez-bill1`: `src/index.css`, `tailwind.config.ts`, `index.html`, `src/components/layout/AppSidebar.tsx`, `src/pages/Login.tsx`, `README.md`, `docs/screenshots/`).
The live sites (ezbill.live, ezzbill.com) were **not** reachable: this cloud environment's network policy blocks both hosts. The info site's repo (`ezzbill-site`) could not be attached. Anything only on ezzbill.com (its logo file, headline, investor copy) is unverified.

## 1. Brand audit: observed

| Token | Hex | Read from |
|---|---|---|
| Ground (dark theme, default) | `#0E1110` | `--background: 160 10% 6%` |
| Card | `#171C1A` | `--card` |
| Raised / secondary | `#222A28` | `--secondary` |
| Border | `#2A322F` | `--border` |
| Ink | `#F4F4F1` | `--foreground` |
| Muted ink | `#83958F` | `--muted-foreground` |
| Primary green (buttons, logo tile) | `#31815C` | `--primary: 152 45% 35%` |
| Success green (money owed to you) | `#2E9E6A` | `--success` |
| Gold accent (name, totals, leak score) | `#E6AC19` | `--accent` / `--gold` |
| Gold wordmark gradient | `#EBBC47 → #CF9B17 → #E69019` (135°) | `.text-gold-gradient` |
| Red (leaks, destructive) | `#BB2A2A` | `--destructive` (the leak screen renders a brighter red in screenshots) |
| Info blue | `#2290C3` | `--info` |

- **Type:** the app loads no web font. It uses the system UI stack with Inter's stylistic sets switched on (`font-feature-settings: "cv11","ss01"`), headings at -0.02em tracking, tabular numbers on every amount. Receipts use a monospace (`ui-monospace`).
- **Logo (as the app draws it):** a `#31815C` rounded square (radius 8 px at 32 px) holding the lucide **Receipt** icon in white, next to **EZZ BILL** in bold with the gold gradient. No logo SVG or master file is in the repo.
- **Surfaces:** "liquid glass" cards (translucent, 24–28 px blur, 1 px light top inset), radius 12 px, soft deep shadows.

## 2. Voice and lines (verbatim)

- App title: "EZZ BILL — Smart Expense Manager"
- Login hero: "Your personal money manager" / "Automatically handle bills, track spending, and stay organized."
- Meta: "Your personal money manager that automatically handles bills for you"
- README: "the digital layer for bills" · "UPI solved payments. Nothing solved what comes after." · "EZZ BILL makes capture automatic, so the insights are there when you need them."
- In-app headings: "Money Leaks" · "Where Your Money Leaks" · "You leaked this month" · "Fix My Biggest Leak" · "Track every recurring payment in one place" · "Split a bill" · "Welcome back"
- CTA in the app: "Sign in" · "New here? Create an account"
- Note: the NFC screens say **"EZZ BILLZ"** ("Saved to your EZZ BILLZ"). The name used everywhere else is **EZZ BILL**.

## 3. Motifs
Dark green-black ground; gold for the name and the money that matters; green for good, red for leaks; big tabular rupee figures with a small ₹; uppercase letter-spaced labels ("LAST 30 DAYS", "YOU LEAKED THIS MONTH"); round icon tiles; merchant rows (Swiggy, Uber, Blinkit, Netflix).

## 4. Official campaigns
None found in the repo. Couldn't check ezzbill.com or socials from here.

## 5. Asset register

| Asset | Source | Status |
|---|---|---|
| Logo master | none in repo | **stand-in**: the app's own mark (green tile + lucide Receipt + gold wordmark), rebuilt from its code. Ask the owner for an official file. |
| Font | system UI / Inter features | **choice**: Inter (free, closest match, from npm `@fontsource/inter`) |
| Product screens | `docs/screenshots/*.webp` (real app, demo data), phone 600×1300, desktop 1600×1000 | have |
| High-res close-ups | the app's own code run here on demo data at 3× | to capture at build |
| Photos | none | optional (pictures route) |

## 6. What is true today (claims check)

- **Live today (web, ezbill.live):** Gmail import (read-only), AI receipt scanning with line items, Money Leaks, Subscription radar, Smart Split, warranties, Ask AI, analytics.
- **Not live yet:** Android app with the UPI SMS reader (not on the Play Store), iOS app; NFC table tap is a pilot with no restaurant rollout; no bank linking; no budget alerts.
- **The request:** "a 30 second launch video". The gap: none for the web app. The film shows SMS texts only as the *problem*, never as a feature that reads them. NFC and SMS reading are left out.
- **Every number on screen is demo data** (₹28,722, ₹5,615, ₹5,065, Rohan ₹420…) and carries a visible "Demo data" label.
- **Links:** the app is `ezbill.live` (one z); the brand is "EZZ BILL" (two z) and the info site is `ezzbill.com`. Risk: viewers type `ezzbill.live`.
