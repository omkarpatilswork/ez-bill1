
-- Friends table for bill splitting
CREATE TABLE public.friends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own friends"
  ON public.friends FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Bill splits table
CREATE TABLE public.bill_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  friend_id UUID REFERENCES public.friends(id) ON DELETE SET NULL,
  friend_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  is_self BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own splits"
  ON public.bill_splits FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
