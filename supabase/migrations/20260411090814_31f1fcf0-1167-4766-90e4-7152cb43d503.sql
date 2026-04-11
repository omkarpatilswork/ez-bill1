
-- 1. Fix storage: Managers can only view receipts of their managed employees
DROP POLICY IF EXISTS "Managers can view team receipts" ON storage.objects;
CREATE POLICY "Managers can view team receipts" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'receipts'
    AND public.has_role(auth.uid(), 'manager')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (storage.foldername(name))[1]::uuid
        AND p.manager_id = auth.uid()
    )
  );

-- 2. Add DELETE policy for receipts storage
CREATE POLICY "Users can delete own receipts" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Fix profiles: restrict update to safe columns only via RPC
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.update_my_profile(_full_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET full_name = _full_name, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

-- 4. Fix approval_actions: replace old insert policy with finance-only
DROP POLICY IF EXISTS "Approvers can insert actions" ON public.approval_actions;
-- "Only finance can insert approvals" already exists, keep it

-- Add immutability policies (if not existing)
DROP POLICY IF EXISTS "No update on approvals" ON public.approval_actions;
CREATE POLICY "No update on approvals" ON public.approval_actions
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No delete on approvals" ON public.approval_actions;
CREATE POLICY "No delete on approvals" ON public.approval_actions
  FOR DELETE TO authenticated USING (false);

-- 5. Fix user_roles: ensure no insert/update/delete
DROP POLICY IF EXISTS "No user insert on roles" ON public.user_roles;
CREATE POLICY "No user insert on roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No user update on roles" ON public.user_roles;
CREATE POLICY "No user update on roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No user delete on roles" ON public.user_roles;
CREATE POLICY "No user delete on roles" ON public.user_roles
  FOR DELETE TO authenticated USING (false);

-- 6. Fix gmail_connections: create safe view without tokens
CREATE OR REPLACE VIEW public.gmail_connections_safe AS
SELECT id, user_id, email_address, connected_at, updated_at, token_expires_at
FROM public.gmail_connections;

-- Revoke direct select and grant view access
REVOKE SELECT ON public.gmail_connections FROM authenticated;
GRANT SELECT ON public.gmail_connections_safe TO authenticated;

-- Keep ALL policy for edge functions (service role), 
-- but block authenticated users from reading raw tokens
DROP POLICY IF EXISTS "Users can manage own gmail connection" ON public.gmail_connections;

-- Separate policies: allow insert/update/delete but NOT select for authenticated
CREATE POLICY "Users can insert own gmail connection" ON public.gmail_connections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own gmail connection" ON public.gmail_connections
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own gmail connection" ON public.gmail_connections
  FOR DELETE TO authenticated USING (user_id = auth.uid());
