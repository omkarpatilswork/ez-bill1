// Run: deno test supabase/functions/_shared/cors.test.ts
import { allowedOrigins, corsHeadersFor, withCors } from "./cors.ts";

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}
const env = (vars: Record<string, string>) => (n: string) => vars[n];
const staging = env({ ALLOWED_ORIGINS: " https://staging.example.app/ , " });

Deno.test("ALLOWED_ORIGINS adds trimmed origins to the defaults", () => {
  const list = allowedOrigins(staging);
  assertEquals([list.includes("https://ezbill.live"), list.includes("https://staging.example.app"), list.includes("")], [true, true, false]);
});

Deno.test("allowed origin is echoed; others and missing get no allow-origin", () => {
  assertEquals(corsHeadersFor("https://ezbill.live", env({}))["Access-Control-Allow-Origin"], "https://ezbill.live");
  assertEquals("Access-Control-Allow-Origin" in corsHeadersFor("https://evil.example", env({})), false);
  assertEquals("Access-Control-Allow-Origin" in corsHeadersFor(null, env({})), false);
});

Deno.test("preflight is answered without calling the handler", async () => {
  let called = false;
  const h = withCors(() => { called = true; return new Response("x"); }, staging);
  const res = await h(new Request("https://f.example", { method: "OPTIONS", headers: { Origin: "https://staging.example.app" } }));
  assertEquals([res.status, called, res.headers.get("Access-Control-Allow-Origin")], [204, false, "https://staging.example.app"]);
});

Deno.test("handler's own '*' is replaced; status, body and other headers kept", async () => {
  const h = withCors(() => new Response("hi", { status: 201, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/event-stream" } }), env({}));
  const res = await h(new Request("https://f.example", { method: "POST", headers: { Origin: "https://evil.example" } }));
  assertEquals([res.status, await res.text(), res.headers.get("Content-Type"), res.headers.get("Access-Control-Allow-Origin")], [201, "hi", "text/event-stream", null]);
});
