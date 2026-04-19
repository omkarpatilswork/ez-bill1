
-- Add status to bill_splits
ALTER TABLE public.bill_splits
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Payments log: each row = a payment received from (or made to) a friend
CREATE TABLE IF NOT EXISTS public.split_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  friend_id uuid,
  friend_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'received', -- 'received' (friend paid you) | 'paid' (you paid friend)
  note text DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.split_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own split payments"
ON public.split_payments
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_split_payments_user_friend
  ON public.split_payments(user_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_user_friend
  ON public.bill_splits(user_id, friend_id);
