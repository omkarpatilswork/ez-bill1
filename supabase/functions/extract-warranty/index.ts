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
  support_phone: null,
  support_email: null,
  claim_url: null,
  coverage: "",
  exclusions: "",
  required_documents: [],
  claim_steps: [],
  warranty_terms: "",
  notes: "",
  error: "The image was not readable. Try a clearer photo or fill in the details manually.",
  fallback: true,
  raw,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_base64, file_type, text_content, source_hint } = await req.json();
    if (!file_base64 && !text_content) return jsonResponse({ error: "file_base64 or text_content is required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isTextMode = !file_base64 && !!text_content;
    const mimeType = file_type || "image/png";
    if (file_base64 && file_base64.length > 10 * 1024 * 1024) {
      return jsonResponse({ error: "Image too large. Please use one under 7MB." }, 400);
    }

    const systemPrompt = `You are an OCR + knowledge engine for product WARRANTIES. The input may be a warranty card photo, warranty certificate, invoice used as warranty proof, product box with warranty info, OR an email body about a product warranty / purchase confirmation. Extract structured data AND fill in the BRAND'S standard claim guidance (well-known brands like Samsung, LG, Sony, Apple, Bosch, Dell, HP, Lenovo, OnePlus, Xiaomi, Realme, Vivo, Oppo, Haier, Whirlpool, IFB, Voltas, Daikin, Mi, boAt, JBL, etc.). Return ONLY valid JSON with these fields:

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
  "support_url": "string - official brand support / warranty page URL (use the well-known one if not printed; e.g. https://www.samsung.com/in/support/), or null",
  "support_phone": "string - brand's official customer-care phone number (India). Use the well-known toll-free number for the brand if not printed. null if truly unknown.",
  "support_email": "string - brand's official support email, or null",
  "claim_url": "string - direct URL to the warranty claim / service request form for this brand, or null",
  "coverage": "string - 1-3 sentences describing what the warranty COVERS (manufacturing defects, parts vs labour, in-home service, etc.)",
  "exclusions": "string - 1-2 sentences describing what is NOT covered (physical damage, liquid damage, unauthorized repair, consumables, etc.)",
  "required_documents": ["array of short strings - documents/info the customer must keep ready to claim (e.g. 'Original invoice / purchase bill', 'Warranty card with serial number', 'Product serial / IMEI', 'Government photo ID')"],
  "claim_steps": ["array of 4-7 short imperative-step strings explaining exactly how to claim this brand's warranty (e.g. 'Call <support_phone> or visit <claim_url>', 'Provide model number and serial number', 'Schedule a service technician visit or carry the product to the nearest authorised service centre', 'Get a service request / job-sheet number and track it online')"],
  "warranty_terms": "string - 2-4 sentence summary of the warranty terms (duration, type — standard/extended, transferable or not, anything important the customer should know)",
  "notes": "string - any extra notes printed (e.g. 'Extended warranty available'), or ''"
}

Rules:
- If you can see a QR code, read what URL it points to. If unreadable, set qr_url to null.
- If only purchase_date + warranty_months are visible, compute expiry_date (purchase_date + warranty_months).
- If only expiry_date + purchase_date are visible, compute warranty_months.
- Use null for unknown numeric/date fields, '' for unknown strings.
- For well-known brands, ALWAYS populate support_phone, support_url, claim_url, coverage, exclusions, required_documents and claim_steps from your knowledge of that brand's standard process — even if not printed on the card/email. Mark guessed phone numbers as null only if you are not confident.
- Phone numbers should be in dialable format with country code where useful (e.g. "1800-5-7267864" or "+91 1800-5-7267864").
- claim_steps should be specific and actionable, referencing the actual support channel (e.g. "Visit https://www.samsung.com/in/support/ and click Request Service" not "Contact support").
- Return ONLY JSON, no markdown.`;

    const userContent: any = isTextMode
      ? `Extract warranty info from this email body. ${source_hint ? `Source hint: ${source_hint}. ` : ""}If it is a purchase / order confirmation for a product, infer the standard manufacturer warranty for that brand+category. Return only JSON.\n\n--- EMAIL BODY ---\n${String(text_content).slice(0, 12000)}`
      : [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${file_base64}` } },
          { type: "text", text: "Extract warranty info. Read any QR code URL visible. Fill in brand claim guidance. Return only JSON." },
        ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
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