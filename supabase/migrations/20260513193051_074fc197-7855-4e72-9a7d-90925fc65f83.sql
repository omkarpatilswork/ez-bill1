
ALTER TABLE public.detected_subscriptions
  ADD COLUMN IF NOT EXISTS next_billing_date date,
  ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at date,
  ADD COLUMN IF NOT EXISTS started_at date,
  ADD COLUMN IF NOT EXISTS last_email_snippet text;
