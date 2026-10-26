-- Money Leaks: persist survival-mode inputs and leak alert preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS survival_balance numeric,
  ADD COLUMN IF NOT EXISTS salary_day integer,
  ADD COLUMN IF NOT EXISTS leak_alerts_enabled boolean DEFAULT true;