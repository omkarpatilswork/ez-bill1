import { supabase } from "@/integrations/supabase/client";

// Check if running inside a Capacitor native app
export function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export function isAndroid(): boolean {
  return (window as any).Capacitor?.getPlatform?.() === "android";
}

// UPI-related keywords to filter SMS
const UPI_KEYWORDS = [
  "upi", "debited", "credited", "paid", "received",
  "ref no", "ref:", "txn id", "transaction", "google pay",
  "phonepe", "paytm", "bhim", "imps", "neft",
  "a/c", "account", "rs.", "rs ", "inr",
];

function isUpiSms(text: string): boolean {
  const lower = text.toLowerCase();
  return UPI_KEYWORDS.some(kw => lower.includes(kw));
}

interface SmsMessage {
  body: string;
  address: string;
  date: number;
}

/**
 * Read recent SMS from the device (Android only) using capacitor-sms-inbox plugin.
 * Filters for UPI-related messages and sends them to the parse-upi-sms edge function.
 */
export async function scanUpiSmsFromDevice(): Promise<{
  transactions: any[];
  smsCount: number;
  error?: string;
}> {
  if (!isNativeApp() || !isAndroid()) {
    return { transactions: [], smsCount: 0, error: "SMS reading is only available on Android native app." };
  }

  try {
    // Dynamically import the SMS plugin (only available in native builds)
    const { SmsInbox } = await import("capacitor-sms-inbox");

    // Request permission and read recent SMS
    const permResult = await SmsInbox.requestPermission();
    if (!permResult.granted) {
      return { transactions: [], smsCount: 0, error: "SMS permission denied. Please grant SMS access in Settings." };
    }

    // Read last 100 SMS messages (roughly last few days)
    const result = await SmsInbox.getMessages({ maxCount: 100 });
    const messages: SmsMessage[] = result.messages || [];

    // Filter UPI-related messages
    const upiMessages = messages.filter(m => isUpiSms(m.body));

    if (upiMessages.length === 0) {
      return { transactions: [], smsCount: 0 };
    }

    // Combine all UPI SMS into one text block for AI parsing
    const combinedText = upiMessages.map(m => m.body).join("\n---\n");

    // Send to edge function
    const { data, error } = await supabase.functions.invoke("parse-upi-sms", {
      body: { sms_text: combinedText },
    });

    if (error) throw new Error("Failed to parse SMS");
    if (data?.error) throw new Error(data.error);

    return {
      transactions: data?.transactions || [],
      smsCount: upiMessages.length,
    };
  } catch (err: any) {
    return {
      transactions: [],
      smsCount: 0,
      error: err.message || "Failed to read SMS from device",
    };
  }
}
