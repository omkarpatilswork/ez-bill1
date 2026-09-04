import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getUserExpenses(userId: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: expenses } = await supabase
    .from("expenses")
    .select("title, amount, currency, status, merchant, expense_date, cost_center, description, category_id, expense_categories(name)")
    .eq("user_id", userId)
    .order("expense_date", { ascending: false })
    .limit(200);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, department")
    .eq("id", userId)
    .single();

  return { expenses: expenses || [], profile };
}

function buildExpenseContext(expenses: any[], profile: any): string {
  if (!expenses.length) return "The user has no expenses recorded yet.";

  const total = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byMerchant: Record<string, number> = {};

  for (const e of expenses) {
    byStatus[e.status] = (byStatus[e.status] || 0) + Number(e.amount);
    const cat = e.expense_categories?.name || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount);
    if (e.merchant) byMerchant[e.merchant] = (byMerchant[e.merchant] || 0) + Number(e.amount);
  }

  const lines = [
    `User: ${profile?.full_name || "Unknown"}, Department: ${profile?.department || "Unknown"}`,
    `Total expenses: ${expenses.length}, Total amount: ₹${total.toFixed(2)}`,
    "",
    "By status: " + Object.entries(byStatus).map(([k, v]) => `${k}: ₹${v.toFixed(2)}`).join(", "),
    "By category: " + Object.entries(byCategory).map(([k, v]) => `${k}: ₹${v.toFixed(2)}`).join(", "),
    "Top merchants: " + Object.entries(byMerchant).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}: ₹${v.toFixed(2)}`).join(", "),
    "",
    "Recent expenses (newest first):",
    ...expenses.slice(0, 50).map(
      (e: any) =>
        `- ${e.expense_date} | ${e.title} | ₹${Number(e.amount).toFixed(2)} ${e.currency} | ${e.status} | merchant: ${e.merchant || "N/A"} | category: ${e.expense_categories?.name || "N/A"} | cost_center: ${e.cost_center || "N/A"}`
    ),
  ];
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, messages } = await req.json();
    const { expenses, profile } = await getUserExpenses(userId);
    const context = buildExpenseContext(expenses, profile);

    const systemPrompt = `You are an AI expense assistant for ExpenseDesk. You help users understand and analyze their expense data.

Here is the user's expense data:
${context}

Rules:
- Answer questions about the user's expenses using the data provided.
- Be concise, helpful, and use numbers/amounts when relevant.
- The user's currency is Indian Rupees. ALWAYS format amounts with the ₹ symbol and two decimal places (e.g. ₹1,250.00). Never use $ or USD.
- If the user asks something unrelated to expenses, politely redirect.
- Use GitHub-flavored markdown. When comparing multiple items, use proper markdown tables with a header row and | separators.`;

    if (action === "suggestions") {
      const suggestionsPrompt = `Based on the user's expense data, generate exactly 4 short question suggestions (max 8 words each) that would be useful for this user to ask. Return ONLY a JSON array of 4 strings, nothing else.`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: suggestionsPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error("Suggestions error:", res.status, t);
        // Always return 200 with fallback suggestions so the client never errors
        return new Response(JSON.stringify({ suggestions: [
          "What's my total spending?",
          "Which category costs the most?",
          "Show my pending expenses",
          "What are my recent expenses?",
        ] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "[]";
      let suggestions: string[];
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        suggestions = JSON.parse(cleaned);
      } catch {
        suggestions = [
          "What's my total spending?",
          "Which category costs the most?",
          "Show my pending expenses",
          "What are my recent expenses?",
        ];
      }

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Streaming chat
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text().catch(() => "");
      console.error("AI gateway error:", response.status, t);

      let fallbackMessage = "⚠️ The AI assistant is temporarily unavailable. Please try again in a moment.";
      if (response.status === 402) {
        fallbackMessage = "⚠️ AI credits have been exhausted for this workspace. Please add funds in **Settings → Workspace → Usage** to continue using Ask AI.";
      } else if (response.status === 429) {
        fallbackMessage = "⚠️ Too many requests right now. Please wait a few seconds and try again.";
      }

      // Return a synthetic SSE stream so the client renders a friendly message instead of crashing
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const chunk = { choices: [{ delta: { content: fallbackMessage } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ask-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
