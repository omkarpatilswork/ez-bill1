

# Security Hardening Plan

Based on the security scan, RLS is already enabled on all tables, roles are properly in a separate `user_roles` table, and the `has_role` security definer function exists. However, there are **7 findings** to address — mostly missing deny policies for operations that shouldn't be allowed.

## Findings to Fix

### 1. Enable Leaked Password Protection
- Use `configure_auth` tool to enable leaked password protection (HaveIBeenPwned check on signup/login).

### 2. Explicit Deny Policies for Missing Operations
The scan flagged tables where missing policies could theoretically allow operations. While Supabase's default-deny behavior should block these, explicit deny policies are best practice.

**Migration SQL:**

```sql
-- user_roles: Deny INSERT/UPDATE/DELETE for all users (only service role can modify)
CREATE POLICY "No user insert on roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No user update on roles" ON public.user_roles FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No user delete on roles" ON public.user_roles FOR DELETE TO authenticated USING (false);

-- approval_actions: Deny UPDATE/DELETE (immutable audit trail)
CREATE POLICY "No update on approvals" ON public.approval_actions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No delete on approvals" ON public.approval_actions FOR DELETE TO authenticated USING (false);

-- expense_categories: Deny INSERT/UPDATE/DELETE for non-finance
CREATE POLICY "Only finance can insert categories" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "Only finance can update categories" ON public.expense_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "Only finance can delete categories" ON public.expense_categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- audit_logs: Deny UPDATE/DELETE (immutable)
CREATE POLICY "No update on audit logs" ON public.audit_logs FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No delete on audit logs" ON public.audit_logs FOR DELETE TO authenticated USING (false);
```

### 3. No Code Changes Needed
The frontend already uses `auth.uid()` via the Supabase client and never passes user_id from client input for policy purposes — the RLS policies correctly reference `auth.uid()`. The `has_role` and `is_manager_of` security definer functions already have `SET search_path = public`.

## Summary
- 1 auth config change (leaked password protection)
- 1 migration with ~11 explicit deny/restrict policies
- 0 code file changes

