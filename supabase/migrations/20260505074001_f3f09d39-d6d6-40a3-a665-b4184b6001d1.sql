CREATE TABLE public.fin_scan_dedup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gmail_message_id text,
  email_subject text,
  email_from text,
  doc_type text,
  content_hash text,
  decision text NOT NULL,
  reason text,
  matched_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_scan_dedup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dedup log"
ON public.fin_scan_dedup_log
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_fin_scan_dedup_log_user_created ON public.fin_scan_dedup_log(user_id, created_at DESC);
CREATE INDEX idx_fin_scan_dedup_log_decision ON public.fin_scan_dedup_log(decision);