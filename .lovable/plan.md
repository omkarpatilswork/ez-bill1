

# UPI SMS Bill Extraction Feature

## Context
UPI payment confirmation SMS messages (from banks, Google Pay, PhonePe, Paytm etc.) contain transaction details like amount, merchant, UPI ID, and date. Since this is a web app, we cannot read SMS directly from the device. The practical approach is a **paste-and-parse** flow where users copy-paste their UPI SMS text and we extract structured bill data using AI.

## What Gets Built

### 1. New "UPI Bills" Tab/Section
Add a new section accessible from the Email Bills page or as a separate quick action. The UI will have:
- A text area where users paste one or more UPI SMS messages
- A "Parse SMS" button that sends the text to an edge function
- Parsed results displayed as cards showing: merchant, amount, date, UPI ID, payment status
- An "Add as Expense" button on each parsed result to save it

### 2. New Edge Function: `parse-upi-sms`
- Receives raw SMS text (supports multiple SMS pasted together)
- Uses Lovable AI (gemini-2.5-flash) to extract structured data:
  - Amount, merchant name, UPI ID, date/time, transaction ID, bank name, payment status
- Returns an array of parsed transactions
- Handles edge cases: partial SMS, non-UPI messages, multiple formats (HDFC, SBI, ICICI, etc.)

### 3. Quick Action Integration
- Add "UPI Bills" to the homepage quick actions grid
- Navigates to the UPI SMS parsing page

## Technical Details

**Edge function (`supabase/functions/parse-upi-sms/index.ts`)**:
- CORS headers, LOVABLE_API_KEY auth
- System prompt trained on Indian bank UPI SMS formats
- Returns JSON array of extracted transactions
- Model: `google/gemini-2.5-flash` (fast, cost-effective for text parsing)

**Frontend changes**:
- New component or tab within EmailBills page for UPI SMS input
- Reuses existing expense creation flow to save parsed bills
- Category auto-detection from merchant/UPI ID patterns

**Database**: No new tables needed — parsed UPI transactions become regular expenses via the existing `expenses` table.

## Files Changed
1. `supabase/functions/parse-upi-sms/index.ts` — new edge function
2. `src/pages/expenses/EmailBills.tsx` — add UPI tab alongside Gmail section
3. `src/pages/Dashboard.tsx` — add UPI Bills quick action
4. `src/components/layout/AppSidebar.tsx` — optional nav entry

