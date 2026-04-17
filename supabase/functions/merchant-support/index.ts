import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SupportData {
  merchant: {
    name: string;
    normalized_name: string;
    logo_url: string | null;
    category: string;
  };
  contact: {
    phone: string | null;
    phone_confidence: "high" | "medium" | "low";
    email: string | null;
    email_confidence: "high" | "medium" | "low";
    working_hours: string | null;
  };
  website: {
    official_url: string | null;
    support_url: string | null;
    help_center_url: string | null;
    track_order_url: string | null;
  };
  location: {
    address: string | null;
    address_confidence: "high" | "medium" | "low";
    google_maps_url: string | null;
  };
  returns_warranty: {
    return_eligible: boolean | null;
    return_window_days: number | null;
    exchange_policy: string | null;
    warranty_duration: string | null;
    warranty_conditions: string | null;
    policy_url: string | null;
    tags: string[];
  };
  confidence_scores: {
    overall: "high" | "medium" | "low";
    sources: string[];
  };
}

function buildFallbackSupportData({
  merchantName,
  merchantAddress,
  category,
  fallbackSource,
}: {
  merchantName: string;
  merchantAddress?: string | null;
  category?: string | null;
  fallbackSource: string;
}): SupportData {
  return {
    merchant: {
      name: merchantName,
      normalized_name: merchantName,
      logo_url: null,
      category: category || "other",
    },
    contact: {
      phone: null,
      phone_confidence: "low",
      email: null,
      email_confidence: "low",
      working_hours: null,
    },
    website: {
      official_url: null,
      support_url: null,
      help_center_url: null,
      track_order_url: null,
    },
    location: {
      address: merchantAddress || null,
      address_confidence: merchantAddress ? "high" : "low",
      google_maps_url: `https://www.google.com/maps/search/${encodeURIComponent(merchantName)}`,
    },
    returns_warranty: {
      return_eligible: null,
      return_window_days: null,
      exchange_policy: null,
      warranty_duration: null,
      warranty_conditions: null,
      policy_url: null,
      tags: [],
    },
    confidence_scores: {
      overall: "low",
      sources: ["bill data", fallbackSource],
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let merchantName = "";
  let merchantAddress: string | null = null;
  let merchantCategory: string | null = null;

  try {
    const requestData = await req.json();
    const { merchant_name, merchant_address, purchase_date, items, category } = requestData;

    merchantName = merchant_name ?? "";
    merchantAddress = merchant_address ?? null;
    merchantCategory = category ?? null;

    if (!merchant_name || merchant_name.trim() === "") {
      return new Response(
        JSON.stringify({ error: "merchant_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("merchant-support error: LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify(buildFallbackSupportData({
        merchantName: merchant_name,
        merchantAddress: merchant_address,
        category,
        fallbackSource: "system fallback: ai unavailable",
      })), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemsList = items && items.length > 0
      ? `\nItems purchased: ${JSON.stringify(items)}`
      : "";

    const addressHint = merchant_address
      ? `\nKnown address from bill: "${merchant_address}"`
      : "";

    const prompt = `You are a merchant support data extraction and enrichment engine for Indian businesses.

Given this bill information:
- Merchant: "${merchant_name}"
- Category: "${category || "Unknown"}"
- Purchase Date: "${purchase_date || "Unknown"}"${addressHint}${itemsList}

Your task:
1. NORMALIZE the merchant name (e.g., "RELIANCE TRENDS PVT LTD" → "Reliance Trends")
2. IDENTIFY the merchant category (electronics, apparel, grocery, restaurant, fuel, pharmacy, etc.)
3. FIND official support information from VERIFIED sources only
4. DETERMINE return/warranty policies based on the merchant and items
5. ASSIGN confidence scores to each data point

CRITICAL RULES:
- NEVER hallucinate or guess phone numbers, emails, or URLs
- If you're not confident about data, set it to null
- Only use data from official merchant websites, Google Business listings, or well-known directories
- Prefer official domains (e.g., reliance*.com for Reliance, amazon.in for Amazon)
- For local/small merchants, only provide Google Maps data

Return ONLY valid JSON matching this exact structure:
{
  "merchant": {
    "name": "Original name from bill",
    "normalized_name": "Clean display name",
    "logo_url": null,
    "category": "electronics|apparel|grocery|restaurant|fuel|pharmacy|travel|entertainment|utilities|services|other"
  },
  "contact": {
    "phone": "Customer care number or null",
    "phone_confidence": "high|medium|low",
    "email": "Support email or null",
    "email_confidence": "high|medium|low",
    "working_hours": "e.g. Mon-Sat 9AM-9PM or null"
  },
  "website": {
    "official_url": "Main website or null",
    "support_url": "Support/contact page or null",
    "help_center_url": "Help center URL or null",
    "track_order_url": "Order tracking URL or null"
  },
  "location": {
    "address": "Store address (from bill or verified) or null",
    "address_confidence": "high|medium|low",
    "google_maps_url": "Google Maps search URL"
  },
  "returns_warranty": {
    "return_eligible": true/false/null,
    "return_window_days": number or null,
    "exchange_policy": "Brief policy or null",
    "warranty_duration": "e.g. 1 year manufacturer warranty or null",
    "warranty_conditions": "Any conditions or null",
    "policy_url": "Returns policy page URL or null",
    "tags": ["no return on sale items", "original packaging required", etc.]
  },
  "confidence_scores": {
    "overall": "high|medium|low",
    "sources": ["bill data", "official website", "google maps", etc.]
  }
}

Confidence rules:
- HIGH: Data directly from the bill or well-known official source (Amazon, Flipkart, Swiggy, etc.)
- MEDIUM: From trusted aggregator (Google Maps, Justdial) or known chain policy
- LOW: Inferred from category or AI estimation

For warranty/returns, use these category defaults ONLY if exact policy unknown (mark as LOW confidence):
- Electronics: 1 year manufacturer warranty, 7-10 day return
- Apparel: 7-15 day exchange, no return on sale items
- Grocery: No returns on perishables
- Restaurant/Food delivery: Refund within 24h for quality issues
- Fuel: No returns applicable`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      const fallbackSource = response.status === 402
        ? "system fallback: credits exhausted"
        : response.status === 429
          ? "system fallback: rate limited"
          : "system fallback: ai enrichment unavailable";

      return new Response(JSON.stringify(buildFallbackSupportData({
        merchantName: merchant_name,
        merchantAddress: merchant_address,
        category,
        fallbackSource,
      })), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let supportData: SupportData;
    try {
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      supportData = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse AI response:", content);
      supportData = buildFallbackSupportData({
        merchantName: merchant_name,
        merchantAddress: merchant_address,
        category,
        fallbackSource: "system fallback: invalid ai response",
      });
    }

    // Ensure google maps URL always exists
    if (!supportData.location?.google_maps_url) {
      if (!supportData.location) {
        supportData.location = { address: null, address_confidence: "low", google_maps_url: "" };
      }
      supportData.location.google_maps_url = `https://www.google.com/maps/search/${encodeURIComponent(merchant_name)}`;
    }

    return new Response(JSON.stringify(supportData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("merchant-support error:", e);

    if (merchantName.trim()) {
      return new Response(JSON.stringify(buildFallbackSupportData({
        merchantName,
        merchantAddress,
        category: merchantCategory,
        fallbackSource: "system fallback: unexpected error",
      })), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
