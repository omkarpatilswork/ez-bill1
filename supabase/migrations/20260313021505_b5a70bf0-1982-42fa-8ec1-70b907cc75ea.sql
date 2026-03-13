
-- user_roles: Deny INSERT/UPDATE/DELETE for all users (only service role can modify)
CREATE POLICY "No user insert on roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No user update on roles" ON public.user_roles FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No user delete on roles" ON public.user_roles FOR DELETE TO authenticated USING (false);

-- approval_actions: Deny UPDATE/DELETE (immutable audit trail)
CREATE POLICY "No update on approvals" ON public.approval_actions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No delete on approvals" ON public.approval_actions FOR DELETE TO authenticated USING (false);

-- expense_categories: Only finance can manage categories
CREATE POLICY "Only finance can insert categories" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "Only finance can update categories" ON public.expense_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "Only finance can delete categories" ON public.expense_categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- audit_logs: Deny UPDATE/DELETE (immutable)
CREATE POLICY "No update on audit logs" ON public.audit_logs FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No delete on audit logs" ON public.audit_logs FOR DELETE TO authenticated USING (false);
