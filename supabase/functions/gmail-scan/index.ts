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

    // Get user's Gmail connection
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

    // Refresh token if expired
    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    }

    const { max_results = 10 } = await req.json().catch(() => ({}));

    // Search Gmail for bill/invoice/receipt emails
    const query = "(subject:(invoice OR receipt OR bill OR payment OR order OR confirmation OR statement OR purchase) OR from:(swiggy OR zomato OR amazon OR flipkart OR uber OR ola OR paytm OR phonepe OR gpay OR razorpay OR paypal OR netflix OR spotify)) newer_than:90d";
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max_results}`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        // Try refresh once
        accessToken = await refreshToken(supabase, user.id, connection, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
        const retryRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!retryRes.ok) throw new Error("Gmail API error after refresh");
        const retryData = await retryRes.json();
        return await processMessages(retryData, accessToken, user.id, supabase);
      }
      const errText = await searchRes.text();
      throw new Error(`Gmail API error: ${searchRes.status} ${errText}`);
    }

    const searchData = await searchRes.json();
    return await processMessages(searchData, accessToken, user.id, supabase);
  } catch (e) {
    console.error("gmail-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processMessages(searchData: any, accessToken: string, userId: string, supabase: any) {
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

  const processedIds = new Set((processed || []).map((p: any) => p.gmail_message_id));

  // Fetch details for unprocessed messages
  const emails: any[] = [];
  for (const msg of messages) {
    if (processedIds.has(msg.id)) continue;

    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      const subject = getHeader("Subject");
      const from = getHeader("From");
      const date = getHeader("Date");

      // Find attachments (PDF or image)
      const attachments: any[] = [];
      const findAttachments = (parts: any[]) => {
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            const mime = part.mimeType || "";
            if (mime.startsWith("image/") || mime === "application/pdf") {
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
        if (mime.startsWith("image/") || mime === "application/pdf") {
          attachments.push({
            id: msgData.payload.body.attachmentId,
            filename: msgData.payload.filename,
            mimeType: mime,
            size: msgData.payload.body.size,
          });
        }
      }

      // Only include emails that have attachments (PDF or image)
      if (attachments.length === 0) continue;
      emails.push({
        message_id: msg.id,
        subject,
        from,
        date,
        attachments,
        has_body: true,
      });
    } catch (err) {
      console.error("Error processing message:", msg.id, err);
    }
  }

  return new Response(JSON.stringify({ emails, total_found: messages.length, new_count: emails.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
