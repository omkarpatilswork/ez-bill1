ALTER TABLE public.expenses
ALTER COLUMN currency SET DEFAULT 'INR';

CREATE OR REPLACE FUNCTION public.ensure_expense_currency_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    NEW.currency := 'INR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_expense_currency_default_on_expenses ON public.expenses;
CREATE TRIGGER ensure_expense_currency_default_on_expenses
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.ensure_expense_currency_default();