ALTER TABLE public.detected_subscriptions
  ADD COLUMN IF NOT EXISTS user_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_update jsonb;