import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Subjects/senders to exclude — brokerage & bank statements
const EXCLUDE_PATTERNS = [
  // Brokers
  /zerodha/i, /indmoney/i, /ind\s*money/i, /kotak\s*neo/i, /kotak\s*securities/i,
  /groww/i, /upstox/i, /angel\s*one/i, /angel\s*broking/i, /motilal\s*oswal/i,
  /icici\s*direct/i, /hdfc\s*securities/i, /sharekhan/i, /5paisa/i, /paytm\s*money/i,
  /kite/i, /coin\s*by\s*zerodha/i, /smallcase/i, /dhan/i,
  // Statement keywords
  /statement\s*of\s*account/i, /account\s*statement/i, /bank\s*statement/i,
  /portfolio\s*statement/i, /holding\s*statement/i, /demat\s*statement/i,
  /contract\s*note/i, /weekly\s*report/i, /monthly\s*statement/i,
  /transaction\s*statement/i, /ledger\s*statement/i, /p\s*&?\s*l\s*statement/i,
  /profit\s*(and|&)\s*loss/i, /capital\s*gain/i, /tax\s*statement/i,
  /annual\s*statement/i, /quarterly\s*statement/i,
  /mutual\s*fund\s*statement/i, /cas\s*statement/i, /consolidated\s*account/i,
];

function isExcluded(subject: string, from: string): boolean {
  const text = `${subject} ${from}`;
  return EXCLUDE_PATTERNS.some(p => p.test(text));
}

async function refreshToken(supabase: any, userId: string, connection: any, clientId: string, clientSecret: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Token refresh failed: " + (data.error_description || data.error));

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabase.from("gmail_connections").update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
  }).eq("user_id", userId);

  return data.access_token;
}

async function gmailFetch(url: string, accessToken: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
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
      .from("gmail_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ error: "Gmail not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    }

    const { max_results = 50, days = 30 } = await req.json().catch(() => ({}));

    // More focused query: bills & receipts only, exclude statements
    const query = `has:attachment (subject:(invoice OR receipt OR bill OR payment OR "order confirmation" OR purchase OR "credit card" OR subscription) OR from:(swiggy OR zomato OR amazon OR flipkart OR uber OR ola OR paytm OR phonepe OR gpay OR razorpay OR paypal OR netflix OR spotify OR bigbasket OR myntra OR ajio OR bookmyshow OR makemytrip OR cleartrip OR dunzo OR blinkit OR zepto OR jiomart OR "hdfc bank" OR "icici bank" OR "sbi card" OR "axis bank" OR "kotak" OR "amex" OR "american express" OR "citi" OR hotstar OR "youtube premium" OR "apple" OR airtel OR jio OR vi OR bsnl)) -subject:"statement of account" -subject:"account statement" -subject:"bank statement" -subject:"contract note" -subject:"portfolio" -subject:"holdings" -subject:"P&L" -subject:"weekly report" newer_than:${days}d`;

    // Fetch more results to compensate for filtering
    const fetchMax = Math.min(max_results * 2, 100);
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${fetchMax}`;

    let searchRes = await gmailFetch(searchUrl, accessToken);

    if (!searchRes.ok && searchRes.status === 401) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      searchRes = await gmailFetch(searchUrl, accessToken);
      if (!searchRes.ok) throw new Error("Gmail API error after refresh");
    } else if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Gmail API error: ${searchRes.status} ${errText}`);
    }

    const searchData = await searchRes.json();
    return await processMessages(searchData, accessToken, user.id, supabase, max_results);
  } catch (e) {
    console.error("gmail-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processMessages(searchData: any, accessToken: string, userId: string, supabase: any, maxResults: number) {
  const messages = searchData.messages || [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ emails: [], message: "No bill emails found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check which messages are already processed
  const messageIds = messages.map((m: any) => m.id);
  const { data: processed } = await supabase
    .from("processed_emails")
    .select("gmail_message_id")
    .eq("user_id", userId)
    .in("gmail_message_id", messageIds);

  const processedSet = new Set((processed || []).map((p: any) => p.gmail_message_id));

  const allEmails: any[] = [];

  for (const msg of messages) {
    if (allEmails.length >= maxResults) break;

    try {
      const msgRes = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        accessToken
      );
      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      const subject = getHeader("Subject");
      const from = getHeader("From");
      const date = getHeader("Date");

      // Exclude broker/bank statements
      if (isExcluded(subject, from)) continue;

      const attachments: any[] = [];
      const findAttachments = (parts: any[]) => {
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            const mime = part.mimeType || "";
            // Only PDFs and images (likely receipts)
            if (mime === "application/pdf" || mime.startsWith("image/")) {
              attachments.push({
                id: part.body.attachmentId,
                filename: part.filename,
                mimeType: mime,
                size: part.body.size,
              });
            }
          }
          if (part.parts) findAttachments(part.parts);
        }
      };

      if (msgData.payload?.parts) findAttachments(msgData.payload.parts);
      if (msgData.payload?.filename && msgData.payload?.body?.attachmentId) {
        const mime = msgData.payload.mimeType || "";
        if (mime === "application/pdf" || mime.startsWith("image/")) {
          attachments.push({
            id: msgData.payload.body.attachmentId,
            filename: msgData.payload.filename,
            mimeType: mime,
            size: msgData.payload.body.size,
          });
        }
      }

      if (attachments.length === 0) continue;

      allEmails.push({
        message_id: msg.id,
        subject,
        from,
        date,
        attachments,
        already_imported: processedSet.has(msg.id),
      });
    } catch (err) {
      console.error("Error processing message:", msg.id, err);
    }
  }

  return new Response(JSON.stringify({
    emails: allEmails,
    total_found: messages.length,
    count: allEmails.length,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
