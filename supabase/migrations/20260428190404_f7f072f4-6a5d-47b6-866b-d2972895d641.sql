CREATE TABLE public.detected_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_key TEXT NOT NULL,
  service_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  source TEXT NOT NULL DEFAULT 'gmail',
  email_status TEXT NOT NULL DEFAULT 'active',
  user_confirmed_status TEXT,
  last_email_subject TEXT,
  last_email_from TEXT,
  last_email_date TIMESTAMP WITH TIME ZONE,
  last_amount NUMERIC,
  email_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_key)
);

ALTER TABLE public.detected_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own detected subscriptions"
  ON public.detected_subscriptions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_detected_subscriptions_updated_at
  BEFORE UPDATE ON public.detected_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_detected_subs_user ON public.detected_subscriptions (user_id);