# EZZ BILL Investor Pitch Deck

## What to build
Create a polished, shareable investor presentation in the EZZ BILL visual style. Present the product and its mobile journeys using the prepared phone-first launch video, authentic mobile screenshots, and verified demo-account figures. Mark unknown market, revenue, and fundraising facts as placeholders rather than inventing them.

## Plan
1. Capture key product journeys at phone size from the signed-in demo, and prepare the launch video and screenshots as hosted app media.
2. Build an investor-ready slide experience with a clear narrative, responsive 16:9 slides, phone-framed product screens, demo metrics, and explicit placeholders for unknown business facts.
3. Add keyboard, touch, and URL-based slide navigation, plus a clear way to open and share the deck.
4. Verify the deck in the running app and inspect every slide for legibility, asset loading, and layout issues.

## Technical details
Use a public `/pitch` presentation route with a single fixed-resolution slide renderer scaled to the viewport, semantic slide typography, and `?slide=N` navigation. Keep app media in Lovable Assets pointers. Do not add invented financial or market claims.
