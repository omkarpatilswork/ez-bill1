import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Classifies email into one of our financial document types — or null (not financial).
function classify(subject: string, from: string): string | null {
  const t = `${subject} ${from}`.toLowerCase();

  // Trade / stock market FIRST (most specific)
  if (/(contract\s*note|trade\s*confirmation|order\s*executed|trade\s*executed|equity\s*delivery|p\s*&?\s*l\s*statement|portfolio\s*statement|holding\s*statement|demat|capital\s*gain)/.test(t)) return "trade";
  if (/(zerodha|groww|upstox|angel\s*one|angel\s*broking|dhan|kite|smallcase|paytm\s*money|5paisa|sharekhan|motilal|icici\s*direct|hdfc\s*securities|kotak\s*neo|kotak\s*securities|indmoney|ind\s*money)/.test(t) && /(executed|order|trade|buy|sell|contract|portfolio|holding|p&l|p\s*&\s*l)/.test(t)) return "trade";

  // Credit card statement
  if (/(credit\s*card\s*statement|card\s*statement|cc\s*statement|monthly\s*statement.*card|statement.*credit\s*card)/.test(t)) return "credit_card_statement";
  if (/(amex|american\s*express|sbi\s*card|hdfc\s*card|icici\s*card|axis\s*card|kotak\s*card|onecard|tata\s*neu|citi\s*card|hsbc\s*card|standard\s*chartered\s*card)/.test(t) && /(statement|due|minimum\s*due|total\s*due)/.test(t)) return "credit_card_statement";

  // Bank statement
  if (/(bank\s*statement|account\s*statement|statement\s*of\s*account|monthly\s*statement|quarterly\s*statement|annual\s*statement|consolidated\s*account)/.test(t)) return "bank_statement";

  // Bank transaction / UPI alert
  if (/(debit\s*alert|credit\s*alert|transaction\s*alert|amount\s*debited|amount\s*credited|debited\s*from|credited\s*to|upi\s*transaction|imps|neft|rtgs|funds\s*transfer|payment\s*received|payment\s*sent|withdrawn|deposit)/.test(t)) return "bank_transaction";
  if (/(hdfc|icici|sbi|axis|kotak|yes\s*bank|indusind|rbl|idfc|au\s*small|federal|canara|pnb|bob|union\s*bank)/.test(t) && /(debit|credit|transaction|alert|withdrawn|deposit|transfer)/.test(t)) return "bank_transaction";

  return null;
}

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
  await supabase.from("gmail_connections").update({
    access_token: data.access_token,
    token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  }).eq("user_id", userId);
  return data.access_token;
}

function gmailFetch(url: string, token: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

function decodeB64Url(s: string): string {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    const bin = atob(norm + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch { return ""; }
}

function extractTextBody(payload: any): string {
  if (!payload) return "";
  let out = "";
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data) out += "\n" + decodeB64Url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !out) out += "\n" + decodeB64Url(p.body.data).replace(/<[^>]+>/g, " ");
    if (p.parts) for (const q of p.parts) walk(q);
  };
  walk(payload);
  return out.replace(/\s+/g, " ").trim().slice(0, 8000);
}

async function aiClassifyAndExtract(docType: string, subject: string, from: string, body: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;
  const sysPrompt = `You extract structured fields from Indian financial emails. Return ONLY valid JSON for doc_type "${docType}":

- credit_card_statement: { "issuer": string, "card_last4": string, "total_amount": number|null, "min_due": number|null, "due_date": "YYYY-MM-DD"|null, "period_start": "YYYY-MM-DD"|null, "period_end": "YYYY-MM-DD"|null, "statement_date": "YYYY-MM-DD"|null }
- bank_statement: { "issuer": string, "account_label": string, "period_start": "YYYY-MM-DD"|null, "period_end": "YYYY-MM-DD"|null, "opening_balance": number|null, "closing_balance": number|null, "total_credits": number|null, "total_debits": number|null }
- bank_transaction: { "issuer": string, "txn_type": "debit"|"credit", "amount": number|null, "txn_date": "YYYY-MM-DD"|null, "counterparty": string, "reference_number": string, "account_label": string }
- trade: { "broker": string, "trade_symbol": string, "trade_side": "buy"|"sell", "trade_quantity": number|null, "trade_price": number|null, "trade_value": number|null, "trade_date": "YYYY-MM-DD"|null }

Use null/empty string when not found. Currency is always INR unless clearly otherwise. NO markdown, NO commentary.`;
  const userPrompt = `Subject: ${subject}\nFrom: ${from}\n\nEmail body:\n${body}`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const c = (j.choices?.[0]?.message?.content || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(c);
  } catch (e) {
    console.error("aiExtract failed:", e);
    return null;
  }
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET");
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return new Response(JSON.stringify({ error: "Gmail not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: connection } = await supabase.from("gmail_connections").select("*").eq("user_id", user.id).single();
    if (!connection) return new Response(JSON.stringify({ error: "Gmail not connected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    }

    const { days = 60, max_results = 100 } = await req.json().catch(() => ({}));

    const query = `(subject:(statement OR "credit card" OR "bank statement" OR "account statement" OR "contract note" OR "trade confirmation" OR "order executed" OR "debit alert" OR "credit alert" OR "transaction alert" OR "amount debited" OR "amount credited" OR "p&l" OR "portfolio") OR from:(zerodha OR groww OR upstox OR "angel one" OR "angel broking" OR dhan OR smallcase OR "paytm money" OR 5paisa OR sharekhan OR motilal OR "icici direct" OR "hdfc securities" OR "kotak neo" OR "kotak securities" OR indmoney OR "ind money" OR "hdfc bank" OR "icici bank" OR "sbi" OR "axis bank" OR kotak OR "yes bank" OR indusind OR rbl OR amex OR "american express" OR "sbi card" OR "onecard" OR citi OR hsbc OR "standard chartered")) newer_than:${days}d`;

    const fetchMax = Math.min(max_results * 3, 250);
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${fetchMax}`;
    let searchRes = await gmailFetch(searchUrl, accessToken);
    if (!searchRes.ok && searchRes.status === 401) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      searchRes = await gmailFetch(searchUrl, accessToken);
    }
    if (!searchRes.ok) throw new Error(`Gmail API error: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const messages = searchData.messages || [];

    const messageIds = messages.map((m: any) => m.id);
    let alreadySet = new Set<string>();
    if (messageIds.length) {
      const { data: existing } = await supabase
        .from("financial_documents")
        .select("gmail_message_id")
        .eq("user_id", user.id)
        .in("gmail_message_id", messageIds);
      alreadySet = new Set((existing || []).map((p: any) => p.gmail_message_id));
    }

    let saved = 0, skipped_dupe = 0, skipped_nomatch = 0, processed = 0;
    const byType: Record<string, number> = {};

    for (const m of messages) {
      if (saved + skipped_dupe + skipped_nomatch >= max_results) break;
      processed++;
      try {
        if (alreadySet.has(m.id)) { skipped_dupe++; continue; }

        const r = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, accessToken);
        if (!r.ok) continue;
        const md = await r.json();
        const headers = md.payload?.headers || [];
        const getH = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
        const subject = getH("Subject");
        const from = getH("From");
        const date = getH("Date");

        const docType = classify(subject, from);
        if (!docType) { skipped_nomatch++; continue; }

        const body = extractTextBody(md.payload);
        const ai = await aiClassifyAndExtract(docType, subject, from, body) || {};

        // Build content hash: docType + issuer + key amount/date
        const hashSeed = [
          docType,
          (ai.issuer || ai.broker || from).toString().toLowerCase().slice(0, 40),
          (ai.total_amount ?? ai.amount ?? ai.trade_value ?? "").toString(),
          (ai.due_date ?? ai.txn_date ?? ai.trade_date ?? ai.statement_date ?? ai.period_end ?? "").toString(),
          (ai.reference_number ?? ai.trade_symbol ?? "").toString(),
        ].join("|");
        const contentHash = await sha256(hashSeed);

        // Dedupe by content hash too
        const { data: dupe } = await supabase
          .from("financial_documents")
          .select("id")
          .eq("user_id", user.id)
          .eq("content_hash", contentHash)
          .limit(1)
          .maybeSingle();
        if (dupe) { skipped_dupe++; continue; }

        const issuer = ai.issuer || ai.broker || (from.split("<")[0] || from).trim();
        let title = subject || `${docType} from ${issuer}`;
        if (docType === "credit_card_statement" && ai.total_amount) title = `${issuer} card statement — ₹${ai.total_amount}`;
        if (docType === "bank_statement") title = `${issuer} statement${ai.period_end ? " · " + ai.period_end : ""}`;
        if (docType === "bank_transaction") title = `${ai.txn_type === "credit" ? "Credit" : "Debit"} · ${issuer}${ai.amount ? " · ₹" + ai.amount : ""}`;
        if (docType === "trade") title = `${(ai.trade_side || "").toUpperCase()} ${ai.trade_symbol || ""}${ai.trade_quantity ? " ×" + ai.trade_quantity : ""}${ai.trade_price ? " @ ₹" + ai.trade_price : ""}`;

        const insertRow: any = {
          user_id: user.id,
          doc_type: docType,
          issuer: issuer || "",
          account_label: ai.account_label || ai.card_last4 || "",
          title,
          description: subject,
          gmail_message_id: m.id,
          email_subject: subject,
          email_from: from,
          email_date: date ? new Date(date).toISOString() : null,
          content_hash: contentHash,
          raw_extracted: ai,
          status: "unread",
        };
        if (docType === "credit_card_statement") {
          Object.assign(insertRow, {
            total_amount: ai.total_amount ?? null,
            min_due: ai.min_due ?? null,
            due_date: ai.due_date || null,
            period_start: ai.period_start || null,
            period_end: ai.period_end || null,
            statement_date: ai.statement_date || null,
          });
        } else if (docType === "bank_statement") {
          Object.assign(insertRow, {
            period_start: ai.period_start || null,
            period_end: ai.period_end || null,
            opening_balance: ai.opening_balance ?? null,
            closing_balance: ai.closing_balance ?? null,
            total_credits: ai.total_credits ?? null,
            total_debits: ai.total_debits ?? null,
          });
        } else if (docType === "bank_transaction") {
          Object.assign(insertRow, {
            txn_date: ai.txn_date || null,
            txn_type: ai.txn_type || null,
            total_amount: ai.amount ?? null,
            counterparty: ai.counterparty || "",
            reference_number: ai.reference_number || "",
          });
        } else if (docType === "trade") {
          Object.assign(insertRow, {
            broker: ai.broker || issuer,
            trade_symbol: ai.trade_symbol || "",
            trade_side: ai.trade_side || "",
            trade_quantity: ai.trade_quantity ?? null,
            trade_price: ai.trade_price ?? null,
            trade_value: ai.trade_value ?? null,
            trade_date: ai.trade_date || null,
          });
        }

        const { error: insErr } = await supabase.from("financial_documents").insert(insertRow);
        if (insErr) { console.error("insert error", insErr); continue; }
        saved++;
        byType[docType] = (byType[docType] || 0) + 1;
      } catch (err) {
        console.error("msg error", m.id, err);
      }
    }

    return new Response(JSON.stringify({
      total_found: messages.length,
      processed,
      saved,
      skipped_dupe,
      skipped_nomatch,
      by_type: byType,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("gmail-financial-scan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});