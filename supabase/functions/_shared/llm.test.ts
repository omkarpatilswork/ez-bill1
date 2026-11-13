// Run: deno test supabase/functions/_shared/llm.test.ts
import {
  chatCompletion,
  fallbackModelFor,
  fromGeminiNative,
  hasInlineMedia,
  llmConfig,
  toGeminiNative,
  type ChatRequest,
} from "./llm.ts";

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

const envOf = (vars: Record<string, string>) => (name: string) => vars[name];

function recordingFetch(reply: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(reply.clone());
  }) as unknown as typeof fetch;
  return { calls, f };
}

const photo: ChatRequest = {
  tier: "vision",
  messages: [
    { role: "system", content: "You read bills." },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "data:application/pdf;base64,JVBERi0x" } },
        { type: "text", text: "Return only JSON." },
      ],
    },
  ],
};

Deno.test("config defaults to Gemini's rolling Flash alias for every tier", () => {
  const cfg = llmConfig(envOf({ LLM_API_KEY: "k" }));
  assertEquals(cfg.provider, "gemini");
  assertEquals(cfg.models, { text: "gemini-flash-latest", vision: "gemini-flash-latest", chat: "gemini-flash-latest" });
  assertEquals(cfg.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assertEquals(cfg.fallbackModel, null);
});

Deno.test("per-tier overrides win over LLM_MODEL; blank values are ignored", () => {
  const cfg = llmConfig(envOf({ LLM_MODEL: "m", LLM_MODEL_CHAT: "c", LLM_MODEL_TEXT: "  " }));
  assertEquals(cfg.models, { text: "m", vision: "m", chat: "c" });
});

Deno.test("openai-compatible provider uses LLM_BASE_URL without a trailing slash", () => {
  const cfg = llmConfig(envOf({ LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: "https://x.example/v1/" }));
  assertEquals([cfg.baseUrl, cfg.models.text], ["https://x.example/v1", "gpt-5-mini"]);
});

Deno.test("fallback model only when set and different from the tier's model", () => {
  assertEquals(fallbackModelFor("vision", envOf({})), null);
  assertEquals(fallbackModelFor("vision", envOf({ LLM_MODEL_FALLBACK: "gemini-flash-latest" })), null);
  assertEquals(fallbackModelFor("vision", envOf({ LLM_MODEL_FALLBACK: "gemini-pro-latest" })), "gemini-pro-latest");
});

Deno.test("detects inline files", () => {
  assertEquals(hasInlineMedia(photo.messages), true);
  assertEquals(hasInlineMedia([{ role: "user", content: "hi" }]), false);
});

Deno.test("native request: system instruction, inline file, JSON mode", () => {
  const body = toGeminiNative({ ...photo, response_format: { type: "json_object" } });
  assertEquals(body, {
    contents: [{
      role: "user",
      parts: [{ inlineData: { mimeType: "application/pdf", data: "JVBERi0x" } }, { text: "Return only JSON." }],
    }],
    systemInstruction: { parts: [{ text: "You read bills." }] },
    generationConfig: { responseMimeType: "application/json" },
  });
});

Deno.test("native reply converts to OpenAI shape and drops thought parts", () => {
  const out = fromGeminiNative({
    candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: '{"amount":' }, { text: "412}" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    modelVersion: "gemini-x",
  }, "gemini-flash-latest") as any;
  assertEquals(out.choices[0].message.content, '{"amount":412}');
  assertEquals(out.choices[0].finish_reason, "stop");
  assertEquals(out.model, "gemini-x");
  assertEquals(out.usage.total_tokens, 15);
});

Deno.test("blocked or empty native reply gives empty content, not a crash", () => {
  const out = fromGeminiNative({ candidates: [{ finishReason: "SAFETY" }] }, "m") as any;
  assertEquals([out.choices[0].message.content, out.choices[0].finish_reason], ["", "content_filter"]);
  assertEquals((fromGeminiNative({}, "m") as any).choices[0].message.content, "");
});

Deno.test("Gemini + file goes to native generateContent with the API key header", async () => {
  const { calls, f } = recordingFetch(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })));
  const res = await chatCompletion(photo, { env: envOf({ LLM_API_KEY: "secret" }), fetch: f });
  assertEquals(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
  assertEquals((calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "secret");
  assertEquals((await res.json()).choices[0].message.content, "{}");
});

Deno.test("text, tools and streaming go to the OpenAI-compatible endpoint unchanged", async () => {
  const { calls, f } = recordingFetch(new Response("{}"));
  const tools = [{ type: "function", function: { name: "t", parameters: {} } }];
  await chatCompletion(
    { tier: "text", messages: [{ role: "user", content: "sms" }], tools, tool_choice: { type: "function" } },
    { env: envOf({ LLM_API_KEY: "secret", LLM_MODEL_TEXT: "gemini-a" }), fetch: f },
  );
  assertEquals(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assertEquals((calls[0].init.headers as Record<string, string>).Authorization, "Bearer secret");
  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals([sent.model, sent.tools.length, "stream" in sent], ["gemini-a", 1, false]);

  await chatCompletion({ tier: "chat", messages: [{ role: "user", content: "hi" }], stream: true }, {
    env: envOf({ LLM_API_KEY: "secret" }),
    fetch: f,
  });
  assertEquals(JSON.parse(calls[1].init.body as string).stream, true);
});

Deno.test("explicit model overrides the tier; upstream errors pass through", async () => {
  const { calls, f } = recordingFetch(new Response('{"error":{"code":429}}', { status: 429 }));
  const res = await chatCompletion({ ...photo, model: "gemini-pro-latest" }, { env: envOf({ LLM_API_KEY: "k" }), fetch: f });
  assertEquals(calls[0].url.includes("/models/gemini-pro-latest:generateContent"), true);
  assertEquals(res.status, 429);
});

Deno.test("missing key returns 500 without calling out", async () => {
  const { calls, f } = recordingFetch(new Response("{}"));
  const res = await chatCompletion(photo, { env: envOf({}), fetch: f });
  assertEquals([res.status, calls.length], [500, 0]);
});
