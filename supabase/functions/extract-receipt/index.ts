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

    // Use the actual mime type - Gemini supports image/* and application/pdf
    const mimeType = file_type || "image/png";
    console.log("Processing file type:", mimeType, "base64 length:", file_base64.length);

    // Check if file is too large (>10MB base64 ≈ 7.5MB file)
    if (file_base64.length > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "File is too large. Please upload an image under 7MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an OCR extraction engine. You receive an image or PDF of a receipt/bill/invoice. Extract structured data and return ONLY valid JSON with these fields:
{
  "merchant_name": "string - name of store/restaurant/provider, or 'Not Found'",
  "amount": "number - total amount as float without currency symbols, or null",
  "date_time": "string - YYYY-MM-DD HH:MM:SS format, or 'Not Found'",
  "bill_invoice_number": "string - invoice/receipt number, or 'Not Found'",
  "category": "string - one of: Travel, Meals, Office Supplies, Transportation, Accommodation, Software, Training, Other"
}

Rules:
- Do NOT infer or hallucinate missing values. Use 'Not Found' or null.
- Amount must be a valid number without currency symbols.
- Normalize date to YYYY-MM-DD HH:MM:SS when possible.
- Category should be inferred from merchant/items.
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
        text: "Extract all expense/receipt details from this image. Return only JSON.",
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

    // Parse JSON from the response, stripping any markdown fences
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
