CREATE TABLE public.sync_locks (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE public.sync_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sync locks"
ON public.sync_locks
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.try_acquire_sync_lock(_kind text, _ttl_seconds int DEFAULT 300)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := now();
  _acquired boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.sync_locks(user_id, kind, acquired_at, expires_at)
  VALUES (_uid, _kind, _now, _now + make_interval(secs => _ttl_seconds))
  ON CONFLICT (user_id, kind) DO UPDATE
    SET acquired_at = EXCLUDED.acquired_at,
        expires_at  = EXCLUDED.expires_at
    WHERE public.sync_locks.expires_at < _now;

  GET DIAGNOSTICS _acquired = ROW_COUNT;
  RETURN _acquired > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sync_lock(_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.sync_locks
  WHERE user_id = auth.uid() AND kind = _kind;
$$;