
-- Fix: Change view to SECURITY INVOKER (default, but explicit)
DROP VIEW IF EXISTS public.gmail_connections_safe;
CREATE VIEW public.gmail_connections_safe
WITH (security_invoker = true)
AS
SELECT id, user_id, email_address, connected_at, updated_at, token_expires_at
FROM public.gmail_connections;

GRANT SELECT ON public.gmail_connections_safe TO authenticated;
