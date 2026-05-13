import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const unreadableFallback = (raw = "") => jsonResponse({
  merchant_name: "Not Found",
  merchant_legal_name: "Not Found",
  aggregator: "Not Found",
  merchant_address: "Not Found",
  merchant_gstin: "Not Found",
  amount: null,
  subtotal: null,
  tax_amount: null,
  tax_details: "Not Found",
  discount: null,
  date_time: "Not Found",
  bill_invoice_number: "Not Found",
  payment_method: "Not Found",
  category: "Other",
  line_items: [],
  total_items: 0,
  currency: "INR",
  error: "The image or document was not readable. Please try a clearer file or fill in details manually.",
  fallback: true,
  raw,
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_base64, file_type, text_content, source_hint } = await req.json();

    if (!file_base64 && !text_content) {
      return jsonResponse({ error: "Either file_base64+file_type or text_content is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isTextMode = !file_base64 && !!text_content;
    const mimeType = file_type || "image/png";

    if (file_base64 && file_base64.length > 10 * 1024 * 1024) {
      return jsonResponse({ error: "File is too large. Please upload an image under 7MB." }, 400);
    }

    console.log(isTextMode
      ? `Processing email body text, length: ${text_content.length}`
      : `Processing file type: ${mimeType}, base64 length: ${file_base64.length}`);

    const systemPrompt = `You are an advanced OCR extraction engine for Indian bills, receipts, and invoices. Extract ALL structured data and return ONLY valid JSON with these fields:

{
  "merchant_name": "string - the POPULAR/COMMERCIAL/BRAND name of the merchant (e.g. 'Insider.in (Paytm Insider)' instead of 'WASTELAND ENTERTAINMENT PVT. LTD', 'Starbucks' instead of 'TATA STARBUCKS PRIVATE LIMITED', 'Domino's' instead of 'JUBILANT FOODWORKS LTD'). If the bill is from an aggregator (Swiggy, Zomato, BookMyShow, MakeMyTrip, Uber, Ola, Amazon, Flipkart, Dunzo, Insider, etc.), this MUST be the actual restaurant / cinema / hotel / vendor / store name shown on the bill — NOT the aggregator. Use 'Not Found' only if truly unknown.",
  "merchant_legal_name": "string - the registered legal entity name as printed (e.g. 'WASTELAND ENTERTAINMENT PVT. LTD'), or 'Not Found'",
  "aggregator": "string - name of the aggregator/marketplace platform if the bill was placed through one (Swiggy, Zomato, BookMyShow, Insider, MakeMyTrip, Goibibo, Uber, Ola, Rapido, Amazon, Flipkart, Myntra, Dunzo, Zepto, Blinkit, Instamart, etc.). Return 'Not Found' if the bill is directly from the merchant with NO aggregator involved. Do NOT invent — only set when clearly indicated on the bill.",
  "merchant_address": "string - full address if visible, or 'Not Found'",
  "merchant_gstin": "string - GSTIN number if visible on Indian bills, or 'Not Found'",
  "amount": "number - total/grand total amount as float without currency symbols, or null",
  "subtotal": "number - subtotal before tax if visible, or null",
  "tax_amount": "number - total tax (GST/CGST+SGST/IGST) as float, or null",
  "tax_details": "string - tax breakdown e.g. 'CGST 2.5% + SGST 2.5%', or 'Not Found'",
  "discount": "number - discount amount if any, or null",
  "date_time": "string - YYYY-MM-DD HH:MM:SS format, or 'Not Found'",
  "bill_invoice_number": "string - invoice/receipt/bill number, or 'Not Found'",
  "payment_method": "string - one of: UPI, Cash, Credit Card, Debit Card, Net Banking, Wallet, Other, or 'Not Found'",
  "category": "string - one of: Food & Dining, Grocery, Petrol & Fuel, Toll, Parking, Shopping, Utilities, Travel, Accommodation, Transportation, Office Supplies, Software, Medical, Entertainment, Education, Other",
  "line_items": [
    {
      "name": "string - item name",
      "quantity": "number - quantity, default 1",
      "unit_price": "number - price per unit",
      "total_price": "number - total for this item"
    }
  ],
  "total_items": "number - total count of line items, or 0",
  "currency": "string - MUST be a valid 3-letter ISO code: INR, USD, GBP, EUR, AED, etc. Default INR for Indian bills. Rs/₹ = INR. DHS/Dirham = AED. $/Dollar = USD. £/Pound = GBP. €/Euro = EUR."
}

Rules:
- Do NOT infer or hallucinate missing values. Use 'Not Found' or null.
- merchant_name: ALWAYS prefer the popular/commercial brand name customers know, not the registered legal entity. Map common Indian legal names to brands (e.g. 'JUBILANT FOODWORKS' → "Domino's", 'DEVYANI INTERNATIONAL' → 'KFC/Pizza Hut as applicable', 'TATA STARBUCKS' → 'Starbucks', 'WASTELAND ENTERTAINMENT' → 'Insider.in (Paytm Insider)').
- aggregator vs merchant: Swiggy / Zomato / BookMyShow / MakeMyTrip etc. are AGGREGATORS, never the merchant. The merchant is the underlying restaurant, cinema, hotel, or store. If no aggregator is involved, set aggregator to 'Not Found'.
- merchant_address: capture the full address printed on the bill (usually at the top under the merchant name), including city and pincode if present.
- Amount must be a valid number without currency symbols.
- Extract EVERY line item visible on the bill with name, quantity, unit price, and total.
- If quantity is not shown, default to 1.
- Category should be smartly inferred from merchant name, items, or bill type.
- For Indian bills, look for GSTIN, FSSAI, and tax breakdowns (CGST/SGST/IGST).
- Payment method: look for UPI ID, card last 4 digits, "CASH", "PAID BY" etc.
- Normalize date to YYYY-MM-DD HH:MM:SS when possible.
- CURRENCY: Rs, ₹, or Rupees means INR. DHS or Dirham means AED. Always return 3-letter ISO code.
- If the bill is from an Indian merchant (Swiggy, Zomato, Flipkart, etc.) the currency is ALWAYS INR regardless of any symbol shown.
- Smart discount: if you see offers, coupons, or items with reduced/struck prices, extract the total discount amount.
- Return ONLY the JSON object. No markdown, no explanation.`;

    const isPdf = mimeType === "application/pdf";

    // Text emails → fast text model. PDFs → GPT-5-mini. Images → Gemini Flash.
    const model = isTextMode ? "google/gemini-2.5-flash" : (isPdf ? "openai/gpt-5-mini" : "google/gemini-2.5-flash");

    const userContent: any = isTextMode
      ? `Extract ALL bill details from this email body. ${source_hint ? `Source hint: ${source_hint}. ` : ""}If the email is NOT a real bill/receipt/order confirmation (e.g. marketing, OTP, newsletter, shipping update with no amount), return {"amount": null}. Return only JSON.\n\n--- EMAIL BODY ---\n${String(text_content).slice(0, 12000)}`
      : [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${file_base64}` } },
          { type: "text", text: "Extract ALL bill details including every line item, tax, payment method, and merchant info. Return only JSON." },
        ];

    console.log("Using model:", model, "for mime type:", mimeType);

    let response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    // Fallback: if primary model fails for PDF, try the other model
    if (!response.ok && response.status === 400) {
      const fallbackModel = isPdf ? "google/gemini-2.5-pro" : "openai/gpt-5-mini";
      console.log("Primary model failed, falling back to:", fallbackModel);
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: fallbackModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("AI gateway error:", response.status, errText);
      let message = "AI extraction failed. Please fill in the details manually.";
      if (response.status === 429) message = "AI is busy right now. Please try again in a moment or fill in details manually.";
      if (response.status === 402) message = "AI credits exhausted for this workspace. Please add funds in Settings → Workspace → Usage, or fill in details manually.";
      // Return 200 with a fallback flag so the client shows a toast instead of crashing with a runtime error overlay.
      return jsonResponse({ error: message, fallback: true, upstream_status: response.status });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let extracted;
    try {
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      // AI refused or returned non-JSON (e.g. unreadable image). Return a soft
      // fallback so the client can show a friendly message instead of crashing.
      return unreadableFallback(content);
    }

    return jsonResponse(extracted);
  } catch (e) {
    console.error("extract-receipt error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
