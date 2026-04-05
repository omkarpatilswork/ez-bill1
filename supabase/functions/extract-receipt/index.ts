import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_base64, file_type } = await req.json();

    if (!file_base64 || !file_type) {
      return new Response(
        JSON.stringify({ error: "file_base64 and file_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const mimeType = file_type || "image/png";
    console.log("Processing file type:", mimeType, "base64 length:", file_base64.length);

    if (file_base64.length > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "File is too large. Please upload an image under 7MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an advanced OCR extraction engine for Indian bills, receipts, and invoices. Extract ALL structured data and return ONLY valid JSON with these fields:

{
  "merchant_name": "string - name of store/restaurant/provider, or 'Not Found'",
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
  "currency": "string - INR, USD, etc. Default INR for Indian bills"
}

Rules:
- Do NOT infer or hallucinate missing values. Use 'Not Found' or null.
- Amount must be a valid number without currency symbols.
- Extract EVERY line item visible on the bill with name, quantity, unit price, and total.
- If quantity is not shown, default to 1.
- Category should be smartly inferred from merchant name, items, or bill type.
- For Indian bills, look for GSTIN, FSSAI, and tax breakdowns (CGST/SGST/IGST).
- Payment method: look for UPI ID, card last 4 digits, "CASH", "PAID BY" etc.
- Normalize date to YYYY-MM-DD HH:MM:SS when possible.
- Return ONLY the JSON object. No markdown, no explanation.`;

    const userContent: any[] = [
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${file_base64}`,
        },
      },
      {
        type: "text",
        text: "Extract ALL bill details including every line item, tax, payment method, and merchant info. Return only JSON.",
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed", detail: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let extracted;
    try {
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Could not parse extraction result", raw: content }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-receipt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
