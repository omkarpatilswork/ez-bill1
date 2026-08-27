import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// How long a tap-ready bill stays reachable through its tag after staff
// upload it. Keeps a later tapper from ever seeing a stale stranger's bill.
const GRACE_WINDOW_MINUTES = 45;

// Public, unauthenticated endpoint: this is what a tap resolves to before
// the tapper has signed in. It never exposes table rows directly — only a
// short-lived signed URL to the one relevant photo, minted with the service
// role key. See supabase/migrations/20260827122151_nfc_airdrop_tags.sql for
// why bill_tags / tag_pending_bills have no anon RLS policy of their own.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tag_id } = await req.json();
    if (!tag_id) {
      return jsonResponse({ error: "tag_id is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: tag, error: tagErr } = await admin
      .from("bill_tags")
      .select("*")
      .eq("tag_id", tag_id)
      .maybeSingle();

    if (tagErr) throw tagErr;
    if (!tag) {
      return jsonResponse({ found: false });
    }

    const sinceISO = new Date(Date.now() - GRACE_WINDOW_MINUTES * 60_000).toISOString();
    const { data: pending, error: pendingErr } = await admin
      .from("tag_pending_bills")
      .select("*")
      .eq("tag_id", tag_id)
      .is("claimed_at", null)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingErr) throw pendingErr;

    if (!pending) {
      return jsonResponse({ found: true, status: "idle", table_label: tag.label });
    }

    const { data: signed, error: signErr } = await admin.storage
      .from("pending-receipts")
      .createSignedUrl(pending.file_path, 300); // 5 minutes, just long enough to fetch + extract

    if (signErr) throw signErr;

    return jsonResponse({
      found: true,
      status: "ready",
      table_label: tag.label,
      bill: {
        pending_bill_id: pending.id,
        signed_url: signed?.signedUrl || null,
        amount: pending.amount,
        merchant_name: pending.merchant_name || tag.merchant_name,
      },
    });
  } catch (e) {
    console.error("resolve-tag error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
