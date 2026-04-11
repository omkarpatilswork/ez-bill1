-- Update existing reimbursed expenses to approved
UPDATE public.expenses SET status = 'approved' WHERE status = 'reimbursed';

-- Recreate enum without reimbursed
ALTER TYPE public.expense_status RENAME TO expense_status_old;

CREATE TYPE public.expense_status AS ENUM ('draft', 'submitted', 'manager_approved', 'approved', 'rejected');

ALTER TABLE public.expenses
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.expense_status USING status::text::public.expense_status,
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.approval_actions
  ALTER COLUMN action TYPE text;

DROP TYPE public.expense_status_old;