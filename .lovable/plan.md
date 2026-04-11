

# Add Logout to Profile/Account Page

## What Changes

### 1. Profile page — add Sign Out button
Add a "Sign Out" button at the bottom of the Profile page (`src/pages/Profile.tsx`). When tapped, it calls `signOut()` from `useAuth` and redirects to `/login`.

### 2. Rename page title
Change "Profile" to "Account" in the page header to better match the "account" concept.

## Technical Details

**File: `src/pages/Profile.tsx`**
- Import `LogOut` icon from lucide-react and `Button` component
- Destructure `signOut` from `useAuth()`
- Add a sign-out handler that calls `signOut()` then `navigate('/login')`
- Add a styled "Sign Out" button (destructive variant) at the bottom of the page, inside a glass-card section

No other files need changes — the profile is already accessible via the user icon on Dashboard (mobile) and the sidebar footer (desktop).

