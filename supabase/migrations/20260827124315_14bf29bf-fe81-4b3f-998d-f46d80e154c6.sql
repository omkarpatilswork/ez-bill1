CREATE TABLE public.bill_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  merchant_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tag_pending_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id TEXT NOT NULL REFERENCES public.bill_tags(tag_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  amount NUMERIC(12,2),
  merchant_name TEXT,
  claimed_by UUID REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ,
  expense_id UUID REFERENCES public.expenses(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tag_pending_bills_tag_id ON public.tag_pending_bills(tag_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_tags TO authenticated;
GRANT ALL ON public.bill_tags TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_pending_bills TO authenticated;
GRANT ALL ON public.tag_pending_bills TO service_role;

ALTER TABLE public.bill_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_pending_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage bill tags" ON public.bill_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage pending bills" ON public.tag_pending_bills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users upload pending receipts" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pending-receipts');
CREATE POLICY "Authenticated users read pending receipts" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'pending-receipts');

INSERT INTO public.bill_tags (tag_id, label, merchant_name) VALUES
  ('t3',  'Table 3',  'EZ Bill Pilot Cafe'),
  ('t7',  'Table 7',  'EZ Bill Pilot Cafe'),
  ('t12', 'Table 12', 'EZ Bill Pilot Cafe'),
  ('ctr', 'Counter',  'EZ Bill Pilot Cafe')
ON CONFLICT (tag_id) DO NOTHING;