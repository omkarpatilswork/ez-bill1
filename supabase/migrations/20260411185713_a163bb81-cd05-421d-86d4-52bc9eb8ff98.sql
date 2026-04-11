
-- Fix #1: Prevent privilege escalation via self-modifiable manager_id
-- Drop the existing permissive UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a new UPDATE policy that prevents changing manager_id
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND manager_id IS NOT DISTINCT FROM (SELECT p.manager_id FROM public.profiles p WHERE p.id = auth.uid())
);
