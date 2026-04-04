-- Table to store Gmail OAuth tokens per user
CREATE TABLE public.gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  email_address text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own gmail connection"
  ON public.gmail_connections FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Table to track processed emails to avoid duplicates
CREATE TABLE public.processed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gmail_message_id text NOT NULL,
  subject text,
  sender text,
  received_at timestamptz,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own processed emails"
  ON public.processed_emails FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at on gmail_connections
CREATE TRIGGER update_gmail_connections_updated_at
  BEFORE UPDATE ON public.gmail_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();