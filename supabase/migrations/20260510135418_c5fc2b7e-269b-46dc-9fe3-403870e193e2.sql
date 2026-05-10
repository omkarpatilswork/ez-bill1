CREATE TABLE public.sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  days integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  saved integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX idx_sync_runs_user_started ON public.sync_runs(user_id, started_at DESC);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync runs"
ON public.sync_runs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sync runs"
ON public.sync_runs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sync runs"
ON public.sync_runs FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());