/**
 * The one place that decides which AI provider and model the edge functions use.
 *
 * Callers send an OpenAI-style chat request plus a `tier`, and always get back an
 * OpenAI-style HTTP response, whichever provider runs:
 *   - non-streaming: JSON with `choices[0].message.content` / `choices[0].message.tool_calls`
 *   - `stream: true`: server-sent events carrying `choices[0].delta.content`
 * So the functions (and the browser code that reads Ask AI's stream) keep the shapes
 * they had with the Lovable AI gateway.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   LLM_API_KEY         required. A Gemini API key by default.
 *   LLM_PROVIDER        "gemini" (default) or "openai-compatible".
 *   LLM_BASE_URL        openai-compatible only. Default https://api.openai.com/v1.
 *   LLM_MODEL           model for every tier. Gemini default: "gemini-3.6-flash".
 *   LLM_MODEL_FALLBACKS comma-separated models tried in order when the chosen one is
 *                       overloaded, rate-limited, failing or gone (HTTP 429, 5xx, 404).
 *                       Gemini default: "gemini-3.5-flash,gemini-flash-lite-latest" (the
 *                       last is Google's rolling alias, so something always resolves).
 *                       Set to "none" to switch fallbacks off.
 *   LLM_MODEL_TEXT      override for text-only extraction (email bodies, SMS, statements).
 *   LLM_MODEL_VISION    override for photos and PDFs of bills and warranty cards.
 *   LLM_MODEL_CHAT      override for Ask AI, merchant support and subscription pricing.
 *   LLM_MODEL_FALLBACK  optional second model that extract-receipt retries with when the
 *                       first one rejects the input (HTTP 400). Unset = no retry.
 *
 * With Gemini, requests that carry a file (photo or PDF) go to Gemini's native
 * generateContent endpoint, which documents inline PDFs; everything else goes to its
 * OpenAI-compatible endpoint. The native reply is converted back to the OpenAI shape.
 */

export type Tier = "text" | "vision" | "chat";

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export interface ChatRequest {
  tier: Tier;
  messages: ChatMessage[];
  /** Use this model instead of the tier's model (e.g. the fallback model). */
  model?: string;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type: "json_object" | "text" };
  /** 0 makes the model repeat itself: the same bill read twice gives the same answer. */
  temperature?: number;
}

export type Provider = "gemini" | "openai-compatible";

export interface LlmConfig {
  provider: Provider;
  apiKey: string | undefined;
  baseUrl: string;
  models: Record<Tier, string>;
  fallbackModel: string | null;
  fallbacks: string[];
}

type Env = (name: string) => string | undefined;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Checked 13 Nov 2026 against the live API: gemini-flash-latest, 3.8 and 3.7 Flash were
// returning 503 "high demand"; 3.6 and 3.5 Flash answered in ~1.5 s; gemini-2.5-flash
// returned 404 "no longer available to new users".
const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: "gemini-3.6-flash",
  "openai-compatible": "gpt-5-mini",
};
const DEFAULT_FALLBACKS: Record<Provider, string[]> = {
  gemini: ["gemini-3.5-flash", "gemini-flash-lite-latest"],
  "openai-compatible": [],
};
/** Statuses that mean "try another model": rate limit/quota, server trouble, model gone. */
const RETRY_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

const denoEnv: Env = (name) =>
  (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(name);

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function llmConfig(env: Env = denoEnv): LlmConfig {
  const provider: Provider = nonEmpty(env("LLM_PROVIDER")) === "openai-compatible" ? "openai-compatible" : "gemini";
  const base = nonEmpty(env("LLM_MODEL")) ?? DEFAULT_MODEL[provider];
  return {
    provider,
    apiKey: nonEmpty(env("LLM_API_KEY")),
    baseUrl: provider === "gemini"
      ? `${GEMINI_BASE}/openai`
      : (nonEmpty(env("LLM_BASE_URL")) ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    models: {
      text: nonEmpty(env("LLM_MODEL_TEXT")) ?? base,
      vision: nonEmpty(env("LLM_MODEL_VISION")) ?? base,
      chat: nonEmpty(env("LLM_MODEL_CHAT")) ?? base,
    },
    fallbackModel: nonEmpty(env("LLM_MODEL_FALLBACK")) ?? null,
    fallbacks: parseFallbacks(env("LLM_MODEL_FALLBACKS"), DEFAULT_FALLBACKS[provider]),
  };
}

function parseFallbacks(raw: string | undefined, defaults: string[]): string[] {
  const v = nonEmpty(raw);
  if (!v) return defaults;
  if (v.toLowerCase() === "none") return [];
  return v.split(",").map((m) => m.trim()).filter(Boolean);
}

/** True when an API key is set, i.e. AI calls can be attempted. */
export function isLlmConfigured(env: Env = denoEnv): boolean {
  return !!llmConfig(env).apiKey;
}

/** The model extract-receipt should retry with after a 400, or null for no retry. */
export function fallbackModelFor(tier: Tier, env: Env = denoEnv): string | null {
  const cfg = llmConfig(env);
  return cfg.fallbackModel && cfg.fallbackModel !== cfg.models[tier] ? cfg.fallbackModel : null;
}

export function hasInlineMedia(messages: ChatMessage[]): boolean {
  return messages.some((m) =>
    Array.isArray(m.content) &&
    m.content.some((p) => p.type === "image_url" && p.image_url.url.startsWith("data:"))
  );
}

/**
 * Send a chat request to the configured provider. Resolves to an OpenAI-shaped
 * Response; on provider errors the status code is passed through (429 = rate limit or
 * quota, 400 = rejected input, 401/403 = bad key, 404 = unknown model).
 */
export async function chatCompletion(
  req: ChatRequest,
  deps: { env?: Env; fetch?: typeof fetch } = {},
): Promise<Response> {
  const cfg = llmConfig(deps.env ?? denoEnv);
  const doFetch = deps.fetch ?? fetch;
  if (!cfg.apiKey) {
    return jsonError(500, "LLM_API_KEY is not configured");
  }
  // An explicit model (extract-receipt's 400 retry) is tried alone; otherwise the tier's
  // model, then the fallbacks, moving on only for statuses in RETRY_STATUSES.
  const candidates = req.model
    ? [req.model]
    : [...new Set([cfg.models[req.tier], ...cfg.fallbacks])];
  let res: Response | undefined;
  for (const [i, model] of candidates.entries()) {
    res = await callModel(cfg, model, req, doFetch);
    if (res.ok || !RETRY_STATUSES.has(res.status) || i === candidates.length - 1) return res;
    console.warn(`llm: ${model} returned ${res.status}; trying ${candidates[i + 1]}`);
    await res.body?.cancel();
  }
  return res!;
}

async function callModel(cfg: LlmConfig, model: string, req: ChatRequest, doFetch: typeof fetch): Promise<Response> {
  const apiKey = cfg.apiKey!;
  const native = cfg.provider === "gemini" && !req.stream && !req.tools && hasInlineMedia(req.messages);
  console.log(`llm: ${cfg.provider}${native ? " (native)" : ""} model=${model} tier=${req.tier}`);

  if (native) {
    let body: unknown;
    try {
      body = toGeminiNative(req);
    } catch (e) {
      return jsonError(400, e instanceof Error ? e.message : String(e));
    }
    const res = await doFetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return res;
    const json = await res.json();
    return new Response(JSON.stringify(fromGeminiNative(json, model)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body: Record<string, unknown> = { model, messages: req.messages };
  if (req.stream) body.stream = true;
  if (req.tools) body.tools = req.tools;
  if (req.tool_choice) body.tool_choice = req.tool_choice;
  if (req.response_format) body.response_format = req.response_format;
  if (typeof req.temperature === "number") body.temperature = req.temperature;
  return doFetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------- Gemini native

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function partsOf(content: ChatMessage["content"]): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((p): GeminiPart => {
    if (p.type === "text") return { text: p.text };
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(p.image_url.url);
    if (!m) throw new Error("Only base64 data URLs can be sent as files");
    return { inlineData: { mimeType: m[1], data: m[2] } };
  });
}

export function toGeminiNative(req: ChatRequest): Record<string, unknown> {
  const system = req.messages
    .filter((m) => m.role === "system")
    .flatMap((m) => partsOf(m.content))
    .map((p) => ("text" in p ? p.text : ""))
    .filter(Boolean)
    .join("\n\n");
  const body: Record<string, unknown> = {
    contents: req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: partsOf(m.content) })),
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const generationConfig: Record<string, unknown> = {};
  if (req.response_format?.type === "json_object") generationConfig.responseMimeType = "application/json";
  if (typeof req.temperature === "number") generationConfig.temperature = req.temperature;
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  return body;
}

const FINISH_REASON: Record<string, string> = { STOP: "stop", MAX_TOKENS: "length" };

export function fromGeminiNative(json: any, model: string): Record<string, unknown> {
  const candidate = json?.candidates?.[0];
  const parts: any[] = candidate?.content?.parts ?? [];
  const content = parts
    .filter((p) => typeof p?.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  const reason = candidate?.finishReason;
  return {
    object: "chat.completion",
    model: json?.modelVersion ?? model,
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: reason ? (FINISH_REASON[reason] ?? "content_filter") : null,
    }],
    usage: json?.usageMetadata
      ? {
        prompt_tokens: json.usageMetadata.promptTokenCount ?? 0,
        completion_tokens: json.usageMetadata.candidatesTokenCount ?? 0,
        total_tokens: json.usageMetadata.totalTokenCount ?? 0,
      }
      : undefined,
  };
}
