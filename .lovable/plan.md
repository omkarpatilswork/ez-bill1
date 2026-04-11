

# Gmail Auto-Import with Smart Categorization

## What Changes

The Gmail import flow will be fully automated: scan → extract → auto-import all valid bills, skipping manual selection entirely. Bills will be smartly categorized, duplicates flagged, and subscriptions separated into their own section.

## Plan

### 1. Rewrite the Gmail scan-to-import flow (EmailBills.tsx)

**Remove the manual selection step.** When the user clicks "Scan Inbox":
- Scan Gmail → extract each attachment via AI → auto-import all valid bills directly
- Skip bills where extracted `amount` is null/0 (likely not real bills)
- Re-import previously imported bills (in case they were deleted)
- After import, check for duplicates (same merchant + amount + date) and show a dialog asking user to delete them
- Show a toast summary: "Imported X bills, Y duplicates found"
- Redirect/show results in the All Bills page

### 2. Smart merchant-to-category mapping

Create a `MERCHANT_CATEGORY_MAP` constant that maps known merchants to category IDs:

```text
Swiggy, Zomato, Dominos, McDonald's → Meals
Amazon, Flipkart, Myntra, Ajio → Shopping
Uber, Ola, Rapido → Transportation
Netflix, Hotstar, Spotify, Prime Video, YouTube Premium → Software (Subscriptions)
Jio, Airtel, Vi, BSNL, Tata Play → Utilities
BigBasket, Blinkit, Zepto, JioMart, DMart → Grocery
HPCL, BPCL, IOCL → Fuel
MakeMyTrip, Cleartrip, Yatra → Travel
OYO, Airbnb → Accommodation
```

This map is used during import as a fallback when AI extraction doesn't return a category. The AI-extracted category still takes priority.

### 3. Subscription bills section

Add a new "Subscriptions" tab/section in the All Bills page (MyExpenses.tsx):
- Add "Subscriptions" to the category filter chips
- Pattern-match merchants like Netflix, Hotstar, Spotify, YouTube Premium, Amazon Prime, credit card bills, insurance premiums
- These show separately with a recurring icon

### 4. Duplicate detection

After bulk import, query expenses for the current user where (merchant, amount, expense_date) matches multiple rows. Present a dialog listing duplicates and let the user confirm deletion of extras.

### 5. Credit card bills inclusion

Update the Gmail scan query in the edge function to also match `credit card` in subjects, and add credit card issuers (HDFC, ICICI, SBI, Axis, Kotak, Amex, CITI) to the from-sender list.

### 6. Edge function updates (gmail-scan/index.ts)

- Add credit card bill senders/subjects to the Gmail search query
- Keep existing exclusion patterns for brokers/statements

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/expenses/EmailBills.tsx` | Remove manual selection UI; auto-import flow; duplicate detection dialog; smart category mapping |
| `src/pages/expenses/MyExpenses.tsx` | Add "Subscriptions" filter category |
| `supabase/functions/gmail-scan/index.ts` | Add credit card bill keywords to search query |

## Technical Details

- **Merchant matching**: Case-insensitive substring match against the merchant name returned by AI extraction. Falls back to email subject/sender if merchant is "Not Found".
- **Duplicate detection SQL**: `SELECT merchant, amount, expense_date, count(*) FROM expenses WHERE user_id = ? GROUP BY merchant, amount, expense_date HAVING count(*) > 1`
- **Amount validation**: Bills with `amount === null || amount === 0` are skipped during auto-import as they're likely non-bill PDFs.
- **Status**: All auto-imported bills saved as `'draft'`.

