CREATE OR REPLACE FUNCTION public.try_acquire_sync_lock(_kind text, _ttl_seconds integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := now();
  _rows integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  -- Clear expired locks for this user/kind so re-acquisition works.
  DELETE FROM public.sync_locks
  WHERE user_id = _uid AND kind = _kind AND expires_at < _now;

  INSERT INTO public.sync_locks(user_id, kind, acquired_at, expires_at)
  VALUES (_uid, _kind, _now, _now + make_interval(secs => _ttl_seconds))
  ON CONFLICT (user_id, kind) DO NOTHING;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$function$;