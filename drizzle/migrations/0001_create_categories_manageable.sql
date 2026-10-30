-- Template demo policy: any signed-in user may manage the shared expense categories.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can create categories"
  ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update categories"
  ON public.expense_categories FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete categories"
  ON public.expense_categories FOR DELETE TO authenticated
  USING (true);