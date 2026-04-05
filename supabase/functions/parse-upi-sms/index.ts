import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sms_text } = await req.json();
    if (!sms_text || typeof sms_text !== "string" || sms_text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "sms_text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a specialist at parsing Indian UPI payment confirmation SMS messages from banks (HDFC, SBI, ICICI, Axis, Kotak, etc.) and UPI apps (Google Pay, PhonePe, Paytm, BHIM, etc.).

Given raw SMS text (which may contain one or more messages), extract each UPI transaction into a structured format.

For each transaction found, extract:
- merchant_name: The payee/merchant name (clean it up, e.g. "SWIGGY" not "swiggy@paytm")
- amount: Numeric amount in INR (number, not string)
- date: Date in YYYY-MM-DD format. If only partial date info, use today's date.
- upi_id: The UPI ID if mentioned (e.g. merchant@upi)
- transaction_id: UPI transaction reference number if present
- bank_name: The bank name if mentioned
- payment_status: "success", "failed", or "pending"
- description: A short one-line description combining merchant and amount

If the text doesn't contain any valid UPI transaction SMS, return an empty array.
Handle common formats:
- "Rs.500 debited from A/c XX1234 to MERCHANT on 01-04-25. UPI Ref: 123456789"
- "Paid Rs 200.00 to MERCHANT via UPI. Txn ID: ABC123"
- "You have received Rs.1000 from PERSON via UPI"
- Google Pay / PhonePe confirmation formats

Return ONLY valid JSON, no markdown.`;

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
          { role: "user", content: `Parse the following UPI SMS message(s) and return a JSON array of transactions:\n\n${sms_text}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_upi_transactions",
              description: "Extract UPI transactions from SMS text",
              parameters: {
                type: "object",
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        merchant_name: { type: "string" },
                        amount: { type: "number" },
                        date: { type: "string", description: "YYYY-MM-DD format" },
                        upi_id: { type: "string" },
                        transaction_id: { type: "string" },
                        bank_name: { type: "string" },
                        payment_status: { type: "string", enum: ["success", "failed", "pending"] },
                        description: { type: "string" },
                      },
                      required: ["merchant_name", "amount", "date", "payment_status", "description"],
                    },
                  },
                },
                required: ["transactions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_upi_transactions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    let transactions = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        transactions = parsed.transactions || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ transactions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-upi-sms error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
