// Type-check stand-in for https://deno.land/std@0.168.0/http/server.ts, used by
// check-functions.sh when deno.land cannot be reached. Same signature as std's serve.
export type Handler = (request: Request) => Response | Promise<Response>;
export function serve(handler: Handler): void {
  Deno.serve(handler);
}
