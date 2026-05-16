-- warranties table
CREATE TABLE public.warranties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  brand TEXT DEFAULT '',
  model_number TEXT DEFAULT '',
  serial_number TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  purchase_date DATE,
  expiry_date DATE,
  warranty_months INTEGER,
  retailer TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  qr_url TEXT,
  support_url TEXT,
  image_path TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  raw_extracted JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warranties_user_expiry ON public.warranties(user_id, expiry_date);

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own warranties"
ON public.warranties
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_warranties_updated_at
BEFORE UPDATE ON public.warranties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('warranty-cards', 'warranty-cards', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own warranty cards"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'warranty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own warranty cards"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'warranty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own warranty cards"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'warranty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own warranty cards"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'warranty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);