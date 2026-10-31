-- ================= expense_categories: scope user-created rows to their owner =================
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS created_by uuid;

DROP POLICY IF EXISTS "Anyone authenticated can view categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Authenticated can create categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Authenticated can update categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Authenticated can delete categories" ON public.expense_categories;

CREATE POLICY "Authenticated can view categories"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (created_by IS NULL OR created_by = (select auth.uid()));

CREATE POLICY "Users can create their own categories"
  ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Users can update their own categories"
  ON public.expense_categories FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Users can delete their own categories"
  ON public.expense_categories FOR DELETE TO authenticated
  USING (created_by = (select auth.uid()));

-- ================= bill_tags: shared NFC tag registry — shared read, no client writes =================
ALTER TABLE public.bill_tags ADD COLUMN IF NOT EXISTS created_by uuid;

DROP POLICY IF EXISTS "Authenticated users manage bill tags" ON public.bill_tags;

CREATE POLICY "Authenticated can view bill tags"
  ON public.bill_tags FOR SELECT TO authenticated
  USING (created_by IS NULL OR created_by = (select auth.uid()));

-- ================= tag_pending_bills: staff-owned rows, claimant can claim =================
DROP POLICY IF EXISTS "Authenticated users manage pending bills" ON public.tag_pending_bills;

CREATE POLICY "Staff can view their pending bills"
  ON public.tag_pending_bills FOR SELECT TO authenticated
  USING (created_by = (select auth.uid()) OR claimed_by = (select auth.uid()));

CREATE POLICY "Staff can send pending bills"
  ON public.tag_pending_bills FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Staff and claimants can update pending bills"
  ON public.tag_pending_bills FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()) OR claimed_by IS NULL)
  WITH CHECK (created_by = (select auth.uid()) OR claimed_by = (select auth.uid()));

-- ================= storage.objects / pending-receipts bucket =================
DROP POLICY IF EXISTS "Authenticated users upload pending receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users read pending receipts" ON storage.objects;

CREATE POLICY "Staff upload own pending receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pending-receipts'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
