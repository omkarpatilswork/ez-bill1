

# Automated UPI SMS Reading via Native App (Capacitor)

## Context
You want the app to automatically read UPI SMS from the phone. This requires turning the web app into a native mobile app using Capacitor, which gives access to device SMS permissions.

## What Gets Built

### 1. Capacitor Setup (Native App Shell)
- Install Capacitor dependencies (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`)
- Initialize Capacitor config pointing to the app's preview URL for hot-reload
- This lets you build the app as a real Android/iOS app

### 2. SMS Reading Plugin Integration
- Install `capacitor-sms-inbox` (Android) — a community plugin that reads SMS from the device inbox
- Create a helper that fetches recent SMS, filters for UPI-related messages (keywords like "debited", "UPI", "credited", "Ref No")
- Automatically sends matching SMS to the existing `parse-upi-sms` edge function for AI extraction
- **Note**: iOS does not allow apps to read SMS inbox — this feature will be Android-only

### 3. Updated UPI Tab UI
- Replace the manual paste textarea with an **"Auto Scan SMS"** button (when running as native app)
- Keep the paste option as a fallback (for web/iOS users)
- On Android: tapping "Scan SMS" reads recent UPI messages, parses them via AI, and shows results
- Auto-detect if running in Capacitor vs browser and show the appropriate UI

### 4. Flow
1. User taps "Scan UPI SMS" on Android
2. App requests SMS permission (one-time)
3. App reads recent SMS, filters UPI-related ones
4. Sends them to `parse-upi-sms` edge function
5. Shows parsed transactions with "Save as Expense" buttons

## Technical Details

**Files created/modified:**
1. `capacitor.config.ts` — Capacitor initialization
2. `src/lib/sms-reader.ts` — Native SMS reading + UPI filtering logic using Capacitor plugin
3. `src/pages/expenses/EmailBills.tsx` — Update UPI tab: auto-scan button for native, paste fallback for web
4. `package.json` — Add Capacitor + SMS plugin dependencies

**Important limitations:**
- SMS reading is **Android-only** (iOS blocks SMS access)
- User must grant SMS permission on first use
- You'll need to export to GitHub, then build locally with Android Studio to test native features

## After Implementation
You'll need to:
1. Export project to GitHub
2. Run `npm install` → `npx cap add android` → `npx cap sync`
3. Open in Android Studio to test SMS reading on a real device or emulator

For more details, see the [Lovable mobile development guide](https://docs.lovable.dev/tips-tricks/mobile-development).

