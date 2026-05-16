import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshToken(supabase: any, userId: string, connection: any, clientId: string, clientSecret: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: connection.refresh_token, grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "invalid_grant") {
      await supabase.from("gmail_connections").delete().eq("user_id", userId);
      throw new Error("Gmail connection expired. Please reconnect your Gmail account.");
    }
    throw new Error("Token refresh failed: " + (data.error_description || data.error));
  }
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabase.from("gmail_connections").update({
    access_token: data.access_token, token_expires_at: expiresAt,
  }).eq("user_id", userId);
  return data.access_token;
}

function decodeB64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch { return ""; }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|br)>/gi, "\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

function extractBodyText(payload: any): string {
  if (!payload) return "";
  let plain = "", html = "";
  const walk = (part: any) => {
    if (!part) return;
    const mime = part.mimeType || "";
    const data = part.body?.data;
    if (data && mime === "text/plain" && !plain) plain = decodeB64Url(data);
    else if (data && mime === "text/html" && !html) html = decodeB64Url(data);
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  if (plain && plain.trim().length > 40) return plain.trim();
  if (html) return htmlToText(html);
  return "";
}

// Warranty signal keywords for body-level filtering
const WARRANTY_KEYWORDS = /(warrant(y|ies)|extended warranty|guarantee|amc\b|service contract|protection plan|coverage period|covered until|valid (until|till)|expires? on|register your product|product registration)/i;
function looksLikeWarranty(subject: string, body: string): boolean {
  const sample = `${subject}\n${body.slice(0, 4000)}`;
  return WARRANTY_KEYWORDS.test(sample);
}

async function gmailFetch(url: string, accessToken: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function callExtract(text_content: string, source_hint: string, supabaseUrl: string, serviceKey: string) {
  const res = await fetch(`${supabaseUrl}/functions/v1/extract-warranty`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ text_content, source_hint }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.fallback || data?.error) return null;
  if (!data?.product_name || String(data.product_name).trim() === "") return null;
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const anonClient = createClient(supabaseUrl, anonKey);

    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET");
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Gmail integration not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: connection } = await supabase
      .from("gmail_connections").select("*").eq("user_id", user.id).single();
    if (!connection) {
      return new Response(JSON.stringify({ error: "Gmail not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    }

    const { max_results = 30, days = 365 } = await req.json().catch(() => ({}));

    // Warranty-focused query — registrations, certificates, AMC, extended warranty, order confirmations for appliances/electronics
    const query = `(subject:(warranty OR "warranty card" OR "warranty registration" OR "extended warranty" OR "product registration" OR "service contract" OR "protection plan" OR AMC OR guarantee) OR from:(samsung OR lg OR sony OR apple OR oneplus OR xiaomi OR mi.com OR realme OR vivo OR oppo OR boat OR jbl OR bose OR dell OR hp OR lenovo OR asus OR acer OR microsoft OR bosch OR philips OR haier OR whirlpool OR ifb OR voltas OR daikin OR bluestar OR godrej OR usha OR havells OR crompton OR bajaj OR prestige OR pigeon OR milton OR onida OR panasonic OR tcl OR vu OR mi-india OR canon OR nikon OR gopro OR garmin OR fitbit OR honor OR nothing)) newer_than:${days}d`;

    const fetchMax = Math.min(max_results * 3, 150);
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${fetchMax}`;

    let searchRes = await gmailFetch(searchUrl, accessToken);
    if (!searchRes.ok && searchRes.status === 401) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      searchRes = await gmailFetch(searchUrl, accessToken);
    }
    if (!searchRes.ok) {
      const txt = await searchRes.text();
      throw new Error(`Gmail API error: ${searchRes.status} ${txt}`);
    }

    const searchData = await searchRes.json();
    const messages = searchData.messages || [];

    // Existing warranties by gmail_message_id (dedup)
    const messageIds = messages.map((m: any) => m.id);
    const { data: existing } = await supabase
      .from("warranties").select("gmail_message_id")
      .eq("user_id", user.id).in("gmail_message_id", messageIds);
    const existingSet = new Set((existing || []).map((e: any) => e.gmail_message_id));

    const saved: any[] = [];
    const skipped: any[] = [];

    for (const msg of messages) {
      if (saved.length >= max_results) break;
      if (existingSet.has(msg.id)) { skipped.push({ id: msg.id, reason: "already_saved" }); continue; }

      try {
        const r = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          accessToken
        );
        if (!r.ok) continue;
        const md = await r.json();
        const hs = md.payload?.headers || [];
        const get = (n: string) => hs.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
        const subject = get("Subject");
        const from = get("From");
        const date = get("Date");
        const body = extractBodyText(md.payload);
        if (!body || body.length < 60) { skipped.push({ id: msg.id, reason: "empty_body" }); continue; }
        if (!looksLikeWarranty(subject, body)) { skipped.push({ id: msg.id, reason: "not_warranty" }); continue; }

        const extracted = await callExtract(
          `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body}`,
          `Gmail email from ${from}`,
          supabaseUrl, serviceKey
        );
        if (!extracted) { skipped.push({ id: msg.id, reason: "no_product" }); continue; }

        const insertPayload: any = {
          user_id: user.id,
          product_name: extracted.product_name || "",
          brand: extracted.brand || "",
          model_number: extracted.model_number || "",
          serial_number: extracted.serial_number || "",
          category: extracted.category || "Other",
          purchase_date: extracted.purchase_date || null,
          expiry_date: extracted.expiry_date || null,
          warranty_months: extracted.warranty_months ?? null,
          retailer: extracted.retailer || "",
          notes: extracted.notes || "",
          qr_url: extracted.qr_url || null,
          support_url: extracted.support_url || null,
          support_phone: extracted.support_phone || null,
          support_email: extracted.support_email || null,
          claim_url: extracted.claim_url || null,
          coverage: extracted.coverage || "",
          exclusions: extracted.exclusions || "",
          required_documents: extracted.required_documents || [],
          claim_steps: extracted.claim_steps || [],
          warranty_terms: extracted.warranty_terms || "",
          source: "email",
          gmail_message_id: msg.id,
          email_subject: subject,
          email_from: from,
          email_date: date ? new Date(date).toISOString() : null,
          raw_extracted: extracted,
        };

        const { data: inserted, error: insErr } = await supabase
          .from("warranties").insert(insertPayload).select().single();
        if (insErr) { skipped.push({ id: msg.id, reason: "db_error", error: insErr.message }); continue; }
        saved.push(inserted);
      } catch (err) {
        console.error("scan message error:", msg.id, err);
      }
    }

    return new Response(JSON.stringify({
      saved_count: saved.length,
      skipped_count: skipped.length,
      total_found: messages.length,
      saved,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("gmail-warranty-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});