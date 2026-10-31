import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Recursively remove all objects under a folder prefix in a bucket (best-effort).
async function deleteStoragePrefix(admin: any, bucket: string, prefix: string) {
  try {
    const { data: entries } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    const files = (entries ?? []).filter((e: any) => e.id !== null).map((e: any) => `${prefix}${e.name}`);
    if (files.length) await admin.storage.from(bucket).remove(files);
    const folders = (entries ?? []).filter((e: any) => e.id === null);
    for (const f of folders) {
      await deleteStoragePrefix(admin, bucket, `${prefix}${f.name}/`);
    }
  } catch (_e) {
    // best-effort cleanup
  }
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
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const uid = user.id;

    // ---- Collect storage paths before deleting rows ----
    const pendingRes = await admin.from("tag_pending_bills").select("file_path").eq("created_by", uid);
    const pendingPaths = ((pendingRes.data ?? []) as any[]).map(r => r.file_path).filter(Boolean);

    const warrantyRes = await admin.from("warranties").select("image_path").eq("user_id", uid);
    const warrantyPaths = ((warrantyRes.data ?? []) as any[]).map(r => r.image_path).filter(Boolean);

    // ---- Delete stored files (best-effort) ----
    await deleteStoragePrefix(admin, "receipts", `${uid}/`);
    await deleteStoragePrefix(admin, "warranty-cards", `${uid}/`);
    if (pendingPaths.length) {
      await admin.storage.from("pending-receipts").remove(pendingPaths as string[]);
    }
    const strayWarranty = (warrantyPaths as string[]).filter(p => !p.startsWith(`${uid}/`));
    if (strayWarranty.length) {
      await admin.storage.from("warranty-cards").remove(strayWarranty);
    }

    // ---- Delete this user's rows ----
    const expRes = await admin.from("expenses").select("id").eq("user_id", uid);
    const expenseIds = ((expRes.data ?? []) as any[]).map(r => r.id);
    if (expenseIds.length) {
      await admin.from("expense_receipts").delete().in("expense_id", expenseIds);
      await admin.from("approval_actions").delete().in("expense_id", expenseIds);
    }

    const userTables = [
      "expenses",
      "friends",
      "financial_documents",
      "warranties",
      "detected_subscriptions",
      "gmail_connections",
      "processed_emails",
      "fin_scan_dedup_log",
      "sync_locks",
      "sync_runs",
      "split_payments",
      "bill_splits",
    ];
    for (const t of userTables) {
      await admin.from(t).delete().eq("user_id", uid);
    }
    await admin.from("tag_pending_bills").delete().eq("created_by", uid);

    // profiles & user_roles cascade with the auth user. audit_logs are kept
    // deliberately: they are an immutable security trail.

    // ---- Delete the auth account ----
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
