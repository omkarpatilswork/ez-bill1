

# Mobile Responsive Plan

## Summary
Apply mobile-first responsive design across all pages, the sidebar navigation, and shared components. The app currently uses some responsive classes (e.g. `md:grid-cols-2`) but lacks mobile-specific adjustments for headers, tables, buttons, typography, and the sidebar.

## Changes by File

### 1. `src/components/layout/AppLayout.tsx`
- Reduce header height and padding on mobile (`h-12 px-3 sm:h-14 sm:px-4`)
- Reduce main padding: `p-3 sm:p-4 md:p-6`

### 2. `src/components/layout/AppSidebar.tsx`
- Already uses `collapsible="icon"` which works with the shadcn sidebar's built-in mobile sheet behavior -- no major changes needed, sidebar auto-converts to overlay on mobile via the `useIsMobile` hook in the sidebar component

### 3. `src/pages/Dashboard.tsx`
- **Header**: Stack title/button vertically on mobile (`flex-col sm:flex-row gap-3`), button full-width on mobile (`w-full sm:w-auto`)
- **Responsive typography**: `text-2xl sm:text-3xl` for h1
- **Charts row**: Stack vertically on mobile (`grid-cols-1 lg:grid-cols-5`)
- **Recent expenses table**: Convert to card-based layout on mobile using a responsive wrapper -- hide table on mobile, show stacked cards instead using `hidden sm:block` / `block sm:hidden` pattern
- Reduce chart heights on mobile (200px vs 240px)

### 4. `src/pages/expenses/Analytics.tsx`
- **Header**: Stack title and time-range selector vertically on mobile, select full-width
- **Stat cards grid**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` (already partially done)
- **Chart grids**: Already use `lg:grid-cols-*`, add explicit `grid-cols-1`
- **Responsive typography**: Scale headings
- **Top merchants progress bars**: Already vertical, just ensure padding

### 5. `src/pages/expenses/MyExpenses.tsx`
- **Header**: Stack h1 and button vertically on mobile, button full-width
- **Filter row**: Select full-width on mobile
- **Table**: On mobile, show a card list instead of table (same pattern as Dashboard)

### 6. `src/pages/expenses/NewExpense.tsx`
- **Form grids**: Already uses `md:grid-cols-2` and `md:grid-cols-3` -- good
- **Buttons**: Stack vertically on mobile (`flex-col sm:flex-row`), full-width buttons on mobile
- **Responsive heading**: `text-2xl sm:text-3xl`
- **Container**: `px-4` padding on mobile

### 7. `src/pages/expenses/ExpenseDetail.tsx`
- **Header**: Stack title and status badge on mobile
- **Detail grid**: Already uses `md:grid-cols-2` -- good
- **Submit button**: Full-width on mobile
- **Responsive heading**: `text-2xl sm:text-3xl`

### 8. `src/pages/manager/ManagerDashboard.tsx`
- **Header**: Stack title/button vertically, button full-width on mobile
- **Stat grid**: `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`
- **Responsive heading**

### 9. `src/pages/manager/PendingApprovals.tsx`
- **Table**: Card list on mobile
- **Dialog**: Already responsive via shadcn

### 10. `src/pages/finance/FinanceDashboard.tsx`
- **Header**: Stack title/buttons vertically, buttons full-width on mobile
- **Stat grid**: `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`

### 11. `src/pages/finance/AllExpenses.tsx`
- **Filter/action bar**: Stack vertically on mobile, buttons full-width
- **Table**: Horizontal scroll wrapper with `overflow-x-auto` on mobile (keeping table since it has checkboxes for batch actions)

### 12. `src/pages/finance/Reports.tsx`
- **Chart grids**: Ensure `grid-cols-1` on mobile
- **Chart heights**: Reduce on mobile

### 13. `src/pages/Login.tsx` & `src/pages/Signup.tsx`
- Already well-structured for mobile (centered card, `max-w-md`, `px-4`)
- Ensure inputs have `min-h-[44px]` touch targets

### 14. `src/components/dashboard/StatCard.tsx`
- Reduce padding slightly on mobile: `p-4 sm:p-5`
- Ensure text scales: `text-xl sm:text-2xl` for value

### 15. `src/index.css`
- No structural changes needed, CSS variables are responsive-agnostic

## Technical Approach
- **Mobile table alternative**: Create a reusable pattern where tables use `hidden sm:table` and a card-based list uses `sm:hidden` to show on mobile only. Each card shows key fields stacked vertically.
- **Touch targets**: Add `min-h-[44px]` to buttons and interactive elements via Tailwind
- **No horizontal scroll**: Verified all grids collapse to single column; tables get scroll wrapper or card alternative

## Estimated Scope
~12 files modified, no new dependencies needed. All changes are Tailwind class adjustments.

