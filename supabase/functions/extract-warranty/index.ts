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
  product_name: "",
  brand: "",
  model_number: "",
  serial_number: "",
  category: "Other",
  purchase_date: null,
  expiry_date: null,
  warranty_months: null,
  retailer: "",
  qr_url: null,
  support_url: null,
  notes: "",
  error: "The image was not readable. Try a clearer photo or fill in the details manually.",
  fallback: true,
  raw,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_base64, file_type } = await req.json();
    if (!file_base64) return jsonResponse({ error: "file_base64 is required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const mimeType = file_type || "image/png";
    if (file_base64.length > 10 * 1024 * 1024) {
      return jsonResponse({ error: "Image too large. Please use one under 7MB." }, 400);
    }

    const systemPrompt = `You are an OCR engine for product WARRANTY CARDS, warranty certificates, invoices used as warranty proof, and product boxes with warranty info. Extract structured data and return ONLY valid JSON with these fields:

{
  "product_name": "string - product/appliance name as printed",
  "brand": "string - brand/manufacturer (Samsung, LG, Sony, Apple, Bosch, etc.) or ''",
  "model_number": "string - model number/code or ''",
  "serial_number": "string - serial number / IMEI / S.No or ''",
  "category": "Electronics | Appliances | Mobile | Computer | Furniture | Automobile | Tools | Other",
  "purchase_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null (warranty end date)",
  "warranty_months": "integer total warranty duration in months, or null",
  "retailer": "store/seller name or ''",
  "qr_url": "string - any URL encoded in a QR code / barcode visible on the card, or the website printed next to a QR (e.g. https://warranty.brand.com/register?sn=...). null if none visible.",
  "support_url": "string - official brand support / warranty registration URL printed on the card, or null",
  "notes": "string - short summary of any extra warranty terms printed (e.g. 'Covers manufacturing defects only', 'Extended warranty available'), or ''"
}

Rules:
- If you can see a QR code, read what URL it points to. If unreadable, set qr_url to null.
- If only purchase_date + warranty_months are visible, compute expiry_date (purchase_date + warranty_months).
- If only expiry_date + purchase_date are visible, compute warranty_months.
- Use null for unknown numeric/date fields, '' for unknown strings.
- Return ONLY JSON, no markdown.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${file_base64}` } },
            { type: "text", text: "Extract warranty info. Read any QR code URL visible. Return only JSON." },
          ] },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("AI gateway error:", response.status, errText);
      let message = "AI extraction failed. Please fill in the details manually.";
      if (response.status === 429) message = "AI is busy. Try again in a moment.";
      if (response.status === 402) message = "AI credits exhausted. Add funds in Settings → Workspace → Usage.";
      return jsonResponse({ error: message, fallback: true, upstream_status: response.status });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    try {
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      const extracted = JSON.parse(match ? match[0] : jsonStr);
      return jsonResponse(extracted);
    } catch {
      console.error("Failed to parse AI response:", content);
      return unreadableFallback(content);
    }
  } catch (e) {
    console.error("extract-warranty error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});