import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Patterns that should NOT be imported as bills (statements, trades, etc.)
// — these go into the "Financial Documents" hub instead via gmail-financial-scan.
const NON_BILL_PATTERNS = [
  /statement\s*of\s*account/i, /account\s*statement/i, /bank\s*statement/i,
  /credit\s*card\s*statement/i, /card\s*statement/i,
  /portfolio\s*statement/i, /holding\s*statement/i, /demat\s*statement/i,
  /contract\s*note/i, /trade\s*confirmation/i,
  /transaction\s*statement/i, /ledger\s*statement/i, /p\s*&?\s*l\s*statement/i,
  /profit\s*(and|&)\s*loss/i, /capital\s*gain/i, /tax\s*statement/i,
  /annual\s*statement/i, /quarterly\s*statement/i, /monthly\s*statement/i,
  /mutual\s*fund\s*statement/i, /cas\s*statement/i, /consolidated\s*account/i,
  // Wallet / UPI / payment-app statements (mess up totals)
  /paytm\s*(monthly|account|wallet|transaction)?\s*statement/i,
  /(google\s*pay|gpay|phonepe|amazon\s*pay|mobikwik|freecharge)\s*statement/i,
  /(monthly|weekly|daily)\s*spend(ing)?\s*(summary|report)/i,
  /spends?\s*(summary|report|recap)/i,
  /transaction\s*(summary|history|report)/i,
  // Broker / stock-market activity (not bills)
  /(order|trade)\s*(executed|placed|confirmation|update)/i,
  /(buy|sell)\s*order\s*(executed|placed|confirmed)?/i,
  /margin\s*(call|statement|shortfall)/i,
  /equity\s*(trade|order|statement)/i,
  /sip\s*(installment|investment|confirmation|statement)/i,
  /folio\s*statement/i, /nav\s*statement/i,
];

// Sender-domain blocklist — emails from these are never bills (brokers, wallets, banks sending statements).
const NON_BILL_SENDERS = [
  'groww', 'zerodha', 'upstox', 'angelone', 'angel one', 'angelbroking',
  '5paisa', 'icicidirect', 'kotaksecurities', 'hdfcsec', 'sharekhan',
  'motilaloswal', 'iifl', 'edelweiss', 'paytmmoney', 'dhan.co', 'fyers',
  'coin.zerodha', 'kuvera', 'smallcase', 'indmoney', 'scripbox',
  'cdslindia', 'nsdl', 'camsonline', 'kfintech',
];

function isNonBill(subject: string, from: string): boolean {
  const text = `${subject} ${from}`;
  if (NON_BILL_PATTERNS.some(p => p.test(text))) return true;
  const fromLower = from.toLowerCase();
  if (NON_BILL_SENDERS.some(s => fromLower.includes(s))) return true;
  return false;
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
  if (!res.ok) {
    // If token is revoked/expired, delete the stale connection so the user can reconnect
    if (data.error === "invalid_grant") {
      await supabase.from("gmail_connections").delete().eq("user_id", userId);
      throw new Error("Gmail connection expired. Please reconnect your Gmail account.");
    }
    throw new Error("Token refresh failed: " + (data.error_description || data.error));
  }

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

    const { max_results = 80, days = 30 } = await req.json().catch(() => ({}));

    // Maximum-coverage query: broad subjects + huge sender list across food, travel, shopping,
    // utilities, telecom, OTT, fintech, edtech, insurance, healthcare, fuel, ride-hailing, SaaS.
    const subjectMatch = `subject:(invoice OR receipt OR bill OR payment OR "order confirmation" OR "order placed" OR purchase OR "tax invoice" OR "e-invoice" OR "GST invoice" OR "payment confirmation" OR "payment successful" OR "booking confirmation" OR "ticket" OR "your order" OR "your bill" OR "your invoice" OR "your receipt" OR "thanks for your order" OR "thank you for your" OR "renewal" OR "subscription" OR "due" OR "premium")`;
    const senderMatch = `from:(swiggy OR zomato OR dominos OR mcdonalds OR kfc OR pizzahut OR starbucks OR dunzo OR blinkit OR zepto OR bigbasket OR jiomart OR dmart OR amazon OR flipkart OR myntra OR ajio OR meesho OR nykaa OR tatacliq OR croma OR reliance OR shoppersstop OR uber OR ola OR rapido OR bookmyshow OR insider OR makemytrip OR cleartrip OR yatra OR easemytrip OR goibibo OR irctc OR oyo OR airbnb OR booking OR agoda OR indigo OR vistara OR airindia OR spicejet OR akasaair OR netflix OR hotstar OR "disney" OR spotify OR "youtube premium" OR "prime video" OR sony OR zee5 OR voot OR jiocinema OR apple OR icloud OR adobe OR microsoft OR google OR canva OR notion OR dropbox OR github OR openai OR chatgpt OR claude OR perplexity OR airtel OR jio OR "vi " OR vodafone OR bsnl OR tataplay OR "tata sky" OR dish OR "act fibernet" OR hathway OR razorpay OR paytm OR phonepe OR gpay OR cred OR mobikwik OR "hdfc bank" OR "icici bank" OR "sbi card" OR "axis bank" OR kotak OR yesbank OR indusind OR rbl OR amex OR "american express" OR citi OR hsbc OR standardchartered OR onecard OR "tata neu" OR niyo OR fi OR jupiter OR slice OR uni OR lazypay OR simpl OR zestmoney OR bajajfinserv OR hdfclife OR "icici prudential" OR licindia OR maxlife OR sbilife OR "tata aig" OR "policybazaar" OR "acko" OR "digit" OR pharmeasy OR netmeds OR 1mg OR practo OR cult OR hpcl OR bpcl OR iocl OR "indian oil" OR "bharat petroleum" OR "hindustan petroleum" OR fastag OR paytmfastag OR upstox OR groww OR zerodha OR coursera OR udemy OR byjus OR unacademy OR vedantu OR linkedin)`;
    // Exclude statements/trades — those go to financial-scan
    const exclusions = `-subject:"statement of account" -subject:"account statement" -subject:"bank statement" -subject:"credit card statement" -subject:"contract note" -subject:"portfolio" -subject:"holdings" -subject:"P&L" -subject:"weekly report" -subject:"monthly statement" -subject:"trade confirmation" -subject:unsubscribe -subject:newsletter`;
    const query = `(has:attachment OR ${subjectMatch}) (${subjectMatch} OR ${senderMatch}) ${exclusions} newer_than:${days}d`;

    // Fetch more results to compensate for filtering
    const fetchMax = Math.min(max_results * 3, 200);
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

      // Exclude statements/contracts — those go to the financial-scan flow
      if (isNonBill(subject, from)) continue;

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
