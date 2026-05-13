import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Built-in catalog of popular subscription services. Each service has:
 *  - key: stable identifier
 *  - name: display name
 *  - category: grouping
 *  - senders: lowercase email-domain or sender substrings to match the From header
 *  - keywords: lowercase substrings to match the Subject header
 */
interface ServiceDef {
  key: string;
  name: string;
  category: string;
  senders: string[];
  keywords: string[];
}

const SERVICES: ServiceDef[] = [
  // OTT
  { key: 'netflix', name: 'Netflix', category: 'OTT', senders: ['netflix.com'], keywords: ['netflix'] },
  { key: 'prime_video', name: 'Amazon Prime Video', category: 'OTT', senders: ['primevideo.com', 'amazon.in', 'amazon.com'], keywords: ['prime video'] },
  { key: 'hotstar', name: 'Disney+ Hotstar', category: 'OTT', senders: ['hotstar.com', 'disneyplus'], keywords: ['hotstar', 'disney+'] },
  { key: 'jiocinema', name: 'JioCinema', category: 'OTT', senders: ['jiocinema'], keywords: ['jiocinema', 'jio cinema'] },
  { key: 'sonyliv', name: 'Sony LIV', category: 'OTT', senders: ['sonyliv'], keywords: ['sony liv', 'sonyliv'] },
  { key: 'zee5', name: 'Zee5', category: 'OTT', senders: ['zee5'], keywords: ['zee5'] },
  { key: 'youtube_premium', name: 'YouTube Premium', category: 'OTT', senders: ['youtube.com', 'google.com'], keywords: ['youtube premium', 'youtube music premium'] },
  // Music
  { key: 'spotify', name: 'Spotify', category: 'Music', senders: ['spotify.com'], keywords: ['spotify'] },
  { key: 'apple_music', name: 'Apple Music', category: 'Music', senders: ['apple.com'], keywords: ['apple music'] },
  { key: 'gaana', name: 'Gaana', category: 'Music', senders: ['gaana.com'], keywords: ['gaana'] },
  { key: 'wynk', name: 'Wynk Music', category: 'Music', senders: ['wynk'], keywords: ['wynk'] },
  // Cloud
  { key: 'google_one', name: 'Google One', category: 'Cloud', senders: ['google.com'], keywords: ['google one', 'google storage'] },
  { key: 'icloud', name: 'iCloud+', category: 'Cloud', senders: ['apple.com'], keywords: ['icloud'] },
  { key: 'dropbox', name: 'Dropbox', category: 'Cloud', senders: ['dropbox.com'], keywords: ['dropbox'] },
  { key: 'onedrive', name: 'OneDrive / Microsoft 365', category: 'Cloud', senders: ['microsoft.com', 'onedrive'], keywords: ['microsoft 365', 'onedrive', 'office 365'] },
  // SaaS
  { key: 'notion', name: 'Notion', category: 'SaaS', senders: ['notion.so', 'notion.com'], keywords: ['notion'] },
  { key: 'figma', name: 'Figma', category: 'SaaS', senders: ['figma.com'], keywords: ['figma'] },
  { key: 'canva', name: 'Canva Pro', category: 'SaaS', senders: ['canva.com'], keywords: ['canva'] },
  { key: 'adobe', name: 'Adobe Creative Cloud', category: 'SaaS', senders: ['adobe.com'], keywords: ['adobe', 'creative cloud'] },
  { key: 'github', name: 'GitHub', category: 'SaaS', senders: ['github.com'], keywords: ['github'] },
  { key: 'slack', name: 'Slack', category: 'SaaS', senders: ['slack.com'], keywords: ['slack'] },
  { key: 'zoom', name: 'Zoom', category: 'SaaS', senders: ['zoom.us'], keywords: ['zoom'] },
  { key: 'linkedin', name: 'LinkedIn Premium', category: 'SaaS', senders: ['linkedin.com'], keywords: ['linkedin premium'] },
  // AI
  { key: 'chatgpt', name: 'ChatGPT Plus', category: 'AI', senders: ['openai.com'], keywords: ['chatgpt', 'openai'] },
  { key: 'claude', name: 'Claude Pro', category: 'AI', senders: ['anthropic.com'], keywords: ['claude', 'anthropic'] },
  { key: 'perplexity', name: 'Perplexity Pro', category: 'AI', senders: ['perplexity.ai'], keywords: ['perplexity'] },
  { key: 'midjourney', name: 'Midjourney', category: 'AI', senders: ['midjourney'], keywords: ['midjourney'] },
  { key: 'copilot', name: 'GitHub Copilot', category: 'AI', senders: ['github.com'], keywords: ['copilot'] },
  // Telecom
  { key: 'airtel', name: 'Airtel', category: 'Telecom', senders: ['airtel.in', 'airtel.com'], keywords: ['airtel'] },
  { key: 'jio', name: 'Jio', category: 'Telecom', senders: ['jio.com', 'reliancejio'], keywords: ['jio recharge', 'reliance jio', 'jio prepaid', 'jio postpaid'] },
  { key: 'vi', name: 'Vi (Vodafone Idea)', category: 'Telecom', senders: ['myvi.in', 'vodafoneidea'], keywords: ['vi recharge', 'vodafone idea'] },
  { key: 'act', name: 'ACT Fibernet', category: 'Telecom', senders: ['actcorp', 'actfibernet'], keywords: ['act fibernet', 'act broadband'] },
  { key: 'hathway', name: 'Hathway', category: 'Telecom', senders: ['hathway'], keywords: ['hathway'] },
  // Fitness
  { key: 'cultfit', name: 'cult.fit', category: 'Fitness', senders: ['cult.fit', 'curefit'], keywords: ['cult.fit', 'cultfit', 'curefit'] },
  // Memberships
  { key: 'amazon_prime', name: 'Amazon Prime', category: 'Membership', senders: ['amazon.in', 'amazon.com'], keywords: ['amazon prime membership', 'prime membership'] },
  { key: 'swiggy_one', name: 'Swiggy One', category: 'Membership', senders: ['swiggy.in', 'swiggy.com'], keywords: ['swiggy one', 'swiggy super'] },
  { key: 'zomato_gold', name: 'Zomato Gold', category: 'Membership', senders: ['zomato.com'], keywords: ['zomato gold', 'zomato pro'] },
  { key: 'flipkart_plus', name: 'Flipkart Plus', category: 'Membership', senders: ['flipkart.com'], keywords: ['flipkart plus'] },
  // Gaming
  { key: 'psn', name: 'PlayStation Plus', category: 'Gaming', senders: ['playstation.com', 'sony.com'], keywords: ['playstation plus', 'psn'] },
  { key: 'xbox', name: 'Xbox Game Pass', category: 'Gaming', senders: ['xbox.com', 'microsoft.com'], keywords: ['game pass', 'xbox'] },
  // Education / Language
  { key: 'duolingo', name: 'Duolingo Super', category: 'Education', senders: ['duolingo.com'], keywords: ['duolingo'] },
  { key: 'coursera', name: 'Coursera Plus', category: 'Education', senders: ['coursera.org'], keywords: ['coursera'] },
  { key: 'udemy', name: 'Udemy', category: 'Education', senders: ['udemy.com'], keywords: ['udemy'] },
  { key: 'masterclass', name: 'MasterClass', category: 'Education', senders: ['masterclass.com'], keywords: ['masterclass'] },
  { key: 'audible', name: 'Audible', category: 'Education', senders: ['audible.com', 'audible.in'], keywords: ['audible'] },
  { key: 'kindle_unlimited', name: 'Kindle Unlimited', category: 'Education', senders: ['amazon.com', 'amazon.in'], keywords: ['kindle unlimited'] },
  // News
  { key: 'nytimes', name: 'New York Times', category: 'News', senders: ['nytimes.com'], keywords: ['new york times', 'nytimes'] },
  { key: 'medium', name: 'Medium', category: 'News', senders: ['medium.com'], keywords: ['medium membership'] },
];

// Patterns suggesting subscription activity
const ACTIVE_PATTERNS = [
  /subscription/i, /renewal/i, /renewed/i, /payment\s+(received|successful|confirmation)/i,
  /invoice/i, /receipt/i, /your\s+plan/i, /membership/i, /auto-?renew/i,
  /welcome\s+to/i, /thanks\s+for\s+subscribing/i, /billing/i,
  /(has\s+been\s+)?(extended|started|activated|charged)/i,
  /trial\s+(has\s+)?(started|begun|begins)/i, /free\s+trial/i,
  /your\s+(monthly|annual|yearly)\s+(plan|subscription)/i,
  /next\s+billing\s+date/i, /will\s+renew\s+on/i,
];
const CANCELLED_PATTERNS = [
  /cancell?ation/i, /cancell?ed/i, /your\s+subscription\s+(has\s+)?ended/i,
  /subscription\s+(has\s+been\s+)?cancell?ed/i, /no\s+longer\s+(a\s+)?member/i,
  /(we'?re\s+)?sorry\s+to\s+see\s+you\s+go/i, /membership\s+ended/i,
];

function matchService(subject: string, from: string): ServiceDef | null {
  const sub = subject.toLowerCase();
  const fr = from.toLowerCase();
  for (const svc of SERVICES) {
    if (svc.senders.some(s => fr.includes(s))) return svc;
    if (svc.keywords.some(k => sub.includes(k))) return svc;
  }
  return null;
}

function detectStatus(subject: string, snippet: string): 'active' | 'cancelled' {
  const text = `${subject} ${snippet}`;
  if (CANCELLED_PATTERNS.some(p => p.test(text))) return 'cancelled';
  return 'active';
}

function parseAmount(text: string): number | null {
  // Match ₹1,499.00 / Rs. 199 / INR 299 / $9.99
  const m = text.match(/(?:₹|rs\.?|inr|\$)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(n) ? null : n;
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

async function gmailFetch(url: string, token: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

/* ---------- Body extraction helpers ---------- */
function decodeB64Url(s: string): string {
  if (!s) return '';
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch { return ''; }
}
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function extractBodyText(payload: any): string {
  if (!payload) return '';
  const parts: string[] = [];
  const walk = (p: any) => {
    if (!p) return;
    const mime = p.mimeType || '';
    const data = p.body?.data;
    if (data && (mime === 'text/plain' || mime === 'text/html')) {
      const decoded = decodeB64Url(data);
      parts.push(mime === 'text/html' ? htmlToText(decoded) : decoded);
    }
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  return parts.join('\n').slice(0, 4000);
}

/* ---------- Date parsing ---------- */
function parseLooseDate(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  // ISO
  const iso = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // dd Mon yyyy / Mon dd, yyyy
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const m1 = t.toLowerCase().match(/(\d{1,2})[\s\-]+([a-z]{3,9})[\s\-,]+(\d{4})/);
  if (m1) {
    const mi = months.findIndex(m => m1[2].startsWith(m));
    if (mi >= 0) {
      const d = new Date(+m1[3], mi, +m1[1]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const m2 = t.toLowerCase().match(/([a-z]{3,9})\s+(\d{1,2})[\s,]+(\d{4})/);
  if (m2) {
    const mi = months.findIndex(m => m2[1].startsWith(m));
    if (mi >= 0) {
      const d = new Date(+m2[3], mi, +m2[2]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  // dd/mm/yyyy
  const m3 = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m3) {
    const yr = +m3[3] < 100 ? 2000 + +m3[3] : +m3[3];
    const d = new Date(yr, +m3[2] - 1, +m3[1]);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}
function findNextBillingDate(text: string): string | null {
  const patterns = [
    /(?:next\s+(?:billing|payment|charge|renewal)\s+(?:date|on)?|will\s+(?:be\s+)?(?:auto[-\s]?)?renew(?:ed)?\s+on|renews\s+on|renewal\s+date)\s*[:\-]?\s*([A-Za-z0-9,\-\/\s]{6,30})/i,
    /(?:auto[-\s]?renews?|charged?)\s+on\s+([A-Za-z0-9,\-\/\s]{6,30})/i,
    /(?:trial\s+ends?|free\s+trial\s+ends?)\s+on\s+([A-Za-z0-9,\-\/\s]{6,30})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const d = parseLooseDate(m[1]);
      if (d) return d;
    }
  }
  return null;
}
function findTrial(text: string): boolean {
  return /(free\s+trial|trial\s+(has\s+)?(started|begun)|trial\s+period|in\s+trial)/i.test(text);
}
function findCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
  if (/(annual|yearly|per\s*year|\/\s*year|\/\s*yr|12\s*months)/i.test(text)) return 'yearly';
  if (/(weekly|per\s*week|\/\s*week)/i.test(text)) return 'weekly';
  return 'monthly';
}
function findCurrency(text: string): string {
  if (/₹|\bINR\b|\brs\.?\b/i.test(text)) return 'INR';
  if (/\$|\bUSD\b/i.test(text)) return 'USD';
  if (/€|\bEUR\b/i.test(text)) return 'EUR';
  if (/£|\bGBP\b/i.test(text)) return 'GBP';
  return 'INR';
}
function addCycle(dateISO: string, cycle: 'monthly' | 'yearly' | 'weekly'): string {
  const d = new Date(dateISO);
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
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
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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

    const { days = 180 } = await req.json().catch(() => ({}));

    // Broad query for subscription-related emails (no attachment requirement)
    const query = `(subject:(subscription OR renewal OR renewed OR membership OR "payment received" OR "payment successful" OR "your plan" OR "auto-renew" OR cancellation OR cancelled OR "welcome to" OR "trial started" OR "free trial" OR "has been extended" OR "has been renewed" OR "next billing" OR "will renew") OR from:(netflix OR spotify OR hotstar OR primevideo OR youtube OR openai OR anthropic OR perplexity OR notion OR figma OR canva OR adobe OR github OR slack OR zoom OR linkedin OR sonyliv OR zee5 OR jiocinema OR gaana OR wynk OR dropbox OR microsoft OR apple OR airtel OR jio OR myvi OR vodafone OR actcorp OR cult OR curefit OR swiggy OR zomato OR flipkart OR playstation OR xbox OR midjourney OR duolingo OR coursera OR udemy OR masterclass OR audible OR nytimes OR medium)) newer_than:${days}d`;

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=200`;
    let searchRes = await gmailFetch(searchUrl, accessToken);
    if (!searchRes.ok && searchRes.status === 401) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      searchRes = await gmailFetch(searchUrl, accessToken);
    }
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Gmail API error: ${searchRes.status} ${errText}`);
    }
    const searchData = await searchRes.json();
    const messages = searchData.messages || [];

    // Aggregate per service. Process up to 100 messages (metadata only — fast).
    interface Agg {
      svc: ServiceDef;
      count: number;
      lastDate: number;
      lastSubject: string;
      lastFrom: string;
      lastAmount: number | null;
      hasCancellation: boolean;
      hasActive: boolean;
    }
    const aggregates = new Map<string, Agg>();
    const limit = Math.min(messages.length, 100);

    for (let i = 0; i < limit; i++) {
      const msg = messages[i];
      try {
        const r = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          accessToken,
        );
        if (!r.ok) continue;
        const m = await r.json();
        const headers = m.payload?.headers || [];
        const get = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
        const subject = get('Subject');
        const from = get('From');
        const dateStr = get('Date');
        const snippet = m.snippet || '';

        const svc = matchService(subject, from);
        if (!svc) continue;
        // Subscription signal — must look like sub/renewal/membership/cancellation
        const isSubSignal = ACTIVE_PATTERNS.some(p => p.test(subject) || p.test(snippet))
          || CANCELLED_PATTERNS.some(p => p.test(subject) || p.test(snippet));
        if (!isSubSignal) continue;

        const status = detectStatus(subject, snippet);
        const ts = dateStr ? new Date(dateStr).getTime() : Date.now();
        const amt = parseAmount(`${subject} ${snippet}`);

        const ex = aggregates.get(svc.key);
        if (!ex) {
          aggregates.set(svc.key, {
            svc, count: 1, lastDate: ts, lastSubject: subject, lastFrom: from, lastAmount: amt,
            hasCancellation: status === 'cancelled', hasActive: status === 'active',
          });
        } else {
          ex.count++;
          if (ts > ex.lastDate) {
            ex.lastDate = ts; ex.lastSubject = subject; ex.lastFrom = from;
            if (amt) ex.lastAmount = amt;
          }
          if (status === 'cancelled') ex.hasCancellation = true;
          else ex.hasActive = true;
        }
      } catch (err) {
        console.error('msg error', msg.id, err);
      }
    }

    // Decide email_status: cancelled only if cancellation is the LATEST signal.
    // Simplification: if hasCancellation AND no active signal AFTER it, mark cancelled.
    // We don't track per-signal timestamps separately, so use rule:
    //  - hasCancellation && !hasActive => cancelled
    //  - hasCancellation && hasActive => active (renewed after cancel attempt)
    //  - else => active
    const results: any[] = [];
    for (const [, a] of aggregates) {
      const email_status = a.hasCancellation && !a.hasActive ? 'cancelled' : 'active';
      results.push({
        user_id: user.id,
        service_key: a.svc.key,
        service_name: a.svc.name,
        category: a.svc.category,
        source: 'gmail',
        email_status,
        last_email_subject: a.lastSubject.slice(0, 300),
        last_email_from: a.lastFrom.slice(0, 200),
        last_email_date: new Date(a.lastDate).toISOString(),
        last_amount: a.lastAmount,
        email_count: a.count,
      });
    }

    // Upsert: preserve user_confirmed_status by NOT touching it on conflict.
    if (results.length > 0) {
      // We need to upsert without overwriting user_confirmed_status.
      // Strategy: fetch existing rows for these keys, then for each, update or insert.
      const keys = results.map(r => r.service_key);
      const { data: existing } = await supabase
        .from('detected_subscriptions')
        .select('service_key, user_confirmed_status')
        .eq('user_id', user.id)
        .in('service_key', keys);
      const existingMap = new Map((existing || []).map((e: any) => [e.service_key, e.user_confirmed_status]));

      for (const r of results) {
        const payload: any = { ...r };
        // upsert — keep existing user_confirmed_status (do not overwrite)
        if (existingMap.has(r.service_key)) {
          payload.user_confirmed_status = existingMap.get(r.service_key) ?? null;
        } else {
          payload.user_confirmed_status = null;
        }
        await supabase.from('detected_subscriptions').upsert(payload, { onConflict: 'user_id,service_key' });
      }
    }

    return new Response(JSON.stringify({
      scanned: limit,
      total_found: messages.length,
      detected_count: results.length,
      detected: results.map(r => ({ service_key: r.service_key, service_name: r.service_name, status: r.email_status })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error('gmail-subscription-scan error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});