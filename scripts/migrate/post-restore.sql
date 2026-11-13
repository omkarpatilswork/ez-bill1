-- Run once after restore-data.mjs. Safe to run again: it only adds what is missing.
--
-- On the live Lovable database the on_auth_user_created trigger went missing between
-- April and May 2026, so accounts created after that have no profiles and/or
-- user_roles row. Create them exactly as public.handle_new_user() would have.
INSERT INTO public.profiles (id, full_name, display_name, department)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
       COALESCE(u.raw_user_meta_data->>'department', 'General')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'employee'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);

-- Integrity report (every value should be 0, except the counts on the first line).
SELECT
  (SELECT count(*) FROM auth.users) AS users,
  (SELECT count(*) FROM public.expenses) AS bills,
  (SELECT count(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)) AS users_without_profile,
  (SELECT count(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)) AS users_without_role,
  (SELECT count(*) FROM public.expenses e WHERE e.category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.expense_categories c WHERE c.id = e.category_id)) AS bills_with_missing_category,
  (SELECT count(*) FROM public.expenses e WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id)) AS bills_without_owner,
  (SELECT count(*) FROM public.gmail_connections g WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.user_id)) AS gmail_without_owner;
