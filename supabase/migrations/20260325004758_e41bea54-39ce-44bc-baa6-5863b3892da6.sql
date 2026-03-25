
DROP POLICY "Approvers can insert actions" ON public.approval_actions;

CREATE POLICY "Only finance can insert approvals" ON public.approval_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'finance'::app_role));
