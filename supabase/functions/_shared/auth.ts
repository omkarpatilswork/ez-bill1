/**
 * Signed-in user check for edge functions.
 *
 * Supabase's default verify_jwt also accepts the public anon key, so a function that
 * must only serve signed-in users has to look the token up itself. getUser asks
 * Supabase Auth whether the bearer token belongs to a real user; the anon key does not.
 */
import { createClient, type User } from "npm:@supabase/supabase-js@2";

export async function getUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

/** 401 JSON response; `headers` should carry the function's CORS headers. */
export function unauthorized(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
