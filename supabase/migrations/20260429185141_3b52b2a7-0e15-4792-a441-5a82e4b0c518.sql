
CREATE TABLE public.financial_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('credit_card_statement','bank_statement','bank_transaction','trade')),
  issuer TEXT DEFAULT '',
  account_label TEXT DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',

  -- statements
  period_start DATE,
  period_end DATE,
  statement_date DATE,
  total_amount NUMERIC,
  min_due NUMERIC,
  due_date DATE,
  opening_balance NUMERIC,
  closing_balance NUMERIC,
  total_credits NUMERIC,
  total_debits NUMERIC,

  -- transactions
  txn_date DATE,
  txn_type TEXT,
  counterparty TEXT,
  reference_number TEXT,

  -- trades
  trade_symbol TEXT,
  trade_side TEXT,
  trade_quantity NUMERIC,
  trade_price NUMERIC,
  trade_value NUMERIC,
  trade_date DATE,
  broker TEXT,

  raw_extracted JSONB DEFAULT '{}'::jsonb,

  gmail_message_id TEXT,
  email_subject TEXT,
  email_from TEXT,
  email_date TIMESTAMPTZ,
  content_hash TEXT,

  status TEXT NOT NULL DEFAULT 'unread',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_findoc_user_type ON public.financial_documents(user_id, doc_type);
CREATE INDEX idx_findoc_msgid ON public.financial_documents(user_id, gmail_message_id);
CREATE INDEX idx_findoc_hash ON public.financial_documents(user_id, content_hash);

ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own findocs"
ON public.financial_documents FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Finance can view all findocs"
ON public.financial_documents FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE TRIGGER findoc_updated_at
BEFORE UPDATE ON public.financial_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Add content_hash to expenses for duplicate detection on bills too
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_user_hash ON public.expenses(user_id, content_hash);
