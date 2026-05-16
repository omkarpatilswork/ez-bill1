ALTER TABLE public.warranties
  ADD COLUMN IF NOT EXISTS support_phone TEXT,
  ADD COLUMN IF NOT EXISTS support_email TEXT,
  ADD COLUMN IF NOT EXISTS claim_url TEXT,
  ADD COLUMN IF NOT EXISTS coverage TEXT,
  ADD COLUMN IF NOT EXISTS exclusions TEXT,
  ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS claim_steps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS warranty_terms TEXT,
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_from TEXT,
  ADD COLUMN IF NOT EXISTS email_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_warranties_gmail_msg ON public.warranties(user_id, gmail_message_id);