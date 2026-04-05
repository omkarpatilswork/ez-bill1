

# Home Screen UI Overhaul

## Summary
Restructure the Dashboard home screen per user specifications: fix name bug, reorganize header buttons, switch currency to INR (₹), remove stat cards from main view into Reimburse action, update quick actions, and rename bottom nav tab.

## Changes

### 1. Fix "Hi there" name bug
The fallback `profile?.full_name?.split(' ')[0] || 'there'` shows "there" when no profile is loaded yet. Will ensure profile data is fetched before rendering and use a better fallback from the auth user metadata (`user.user_metadata.full_name`).

### 2. Header buttons reorganization (mobile)
- **Sync button** (RefreshCw) — stays as-is, navigates to `/email-bills`
- **Ask AI button** — new button with a sparkle/bot icon labeled or styled, placed next to Sync, navigates to `/ask-ai`
- **Profile button** (User icon) — navigates to a new `/profile` route (placeholder page for now since user said "we'll come into that later")

### 3. Search bar — navigate to All Bills on search
When the user types a query and submits (or after a short debounce), navigate to `/expenses?q=searchQuery` so the All Bills page handles universal search (by title, merchant, amount, category). The MyExpenses page will read the query param and apply filters.

### 4. Currency: $ → ₹ everywhere
Replace all `$` currency symbols with `₹` across Dashboard, charts, tooltips, recent bills, and desktop sections.

### 5. Remove stat cards (Total Bills, Pending, Approved) from main dashboard
These 3 stat cards will be removed from the home screen. Their data (pending, approved, total) will be accessible inside the **Reimburse** quick action, which will navigate to `/expenses` where this info already exists.

### 6. Quick Actions — update to 4 items
Remove "Help". Rename "Warranty" to "Claim Warranty". Reorder:
1. Split Bills
2. Reimburse
3. Claim Warranty
4. Scan Email

### 7. Bottom Nav — rename "Bills" to "All Bills", ₹ symbol
- Rename tab label from "Bills" to "All Bills"
- Any currency references in bottom nav (there are none currently, but the `$` icon won't be used)

### 8. Desktop charts — update currency to ₹
YAxis formatter and Tooltip formatter changed from `$` to `₹`.

## Files to Edit
- **`src/pages/Dashboard.tsx`** — all changes above (header, search redirect, currency, stat cards removal, quick actions)
- **`src/components/layout/BottomNav.tsx`** — rename "Bills" to "All Bills"
- **`src/pages/expenses/MyExpenses.tsx`** — read `q` query param for universal search filtering

## Technical Details
- Profile name fix: `profile?.full_name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || 'User'`
- Search redirect: `navigate(`/expenses?q=${encodeURIComponent(searchQuery)}`)` on Enter key
- Currency format: Replace all `$` literals and `toLocaleString` calls with `₹` prefix
- Quick actions array reduced to 4 items with updated labels

