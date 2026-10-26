# AGENTS.md

## Technical decisions

- Client-side PDF export (e.g. Monthly Summary page) uses `html2canvas-pro` + `jspdf`: capture the summary container at scale 2 on a dark background, slice the canvas into A4 pages. `html2canvas-pro` (not plain `html2canvas`) is required because the theme uses `oklch`/modern color functions.
- Shared broad-category mapping exists in `src/components/bills/BillRow.tsx`, `src/pages/expenses/MyExpenses.tsx` and `src/pages/MonthlySummary.tsx`; when changing category buckets, update all three.
- Monthly income has no transactional source; it is estimated from `profiles.income_range` via `incomeMidpoint()` (`src/lib/leak-engine.ts`) and labeled "Est. from profile". When no income is set, show a prompt to set it in Profile instead of a default value.
