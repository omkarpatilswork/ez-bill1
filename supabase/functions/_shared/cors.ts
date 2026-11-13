/**
 * CORS with an origin allow-list, replacing "Access-Control-Allow-Origin: *".
 *
 * Functions import `serve` from here instead of std's http/server.ts. It is std's
 * serve with every response passed through `withCors`, which answers preflight
 * requests and sets Access-Control-Allow-Origin only for allowed origins. A browser
 * page on any other site cannot read the response. (CORS only binds browsers; the
 * functions that need a signed-in user check that separately, see auth.ts.)
 *
 * Allowed: the production site, local dev, the Capacitor app origins, plus anything in
 * the ALLOWED_ORIGINS secret (comma-separated, e.g. the Netlify staging URL).
 */
import { serve as stdServe } from "https://deno.land/std@0.168.0/http/server.ts";

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://ezbill.live",
  "https://www.ezbill.live",
  "http://localhost:8080",
  "capacitor://localhost", // iOS app
  "https://localhost", // Android app
  "http://localhost", // Android app, older Capacitor scheme
];

export const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

type Env = (name: string) => string | undefined;
const denoEnv: Env = (name) =>
  (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(name);

export function allowedOrigins(env: Env = denoEnv): string[] {
  const extra = (env("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

export function corsHeadersFor(origin: string | null, env: Env = denoEnv): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

type Handler = (req: Request) => Response | Promise<Response>;

export function withCors(handler: Handler, env: Env = denoEnv): Handler {
  return async (req) => {
    const cors = corsHeadersFor(req.headers.get("Origin"), env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.delete("Access-Control-Allow-Origin");
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

/** std's serve, with the origin allow-list applied to every request. */
export function serve(handler: Handler): void {
  stdServe(withCors(handler));
}
