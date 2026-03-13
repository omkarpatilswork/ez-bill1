
-- Enums
CREATE TYPE public.app_role AS ENUM ('employee', 'manager', 'finance');
CREATE TYPE public.expense_status AS ENUM ('draft', 'submitted', 'manager_approved', 'approved', 'rejected', 'reimbursed');
CREATE TYPE public.approval_level AS ENUM ('manager', 'finance');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT 'General',
  manager_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Expense categories
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT ''
);

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  merchant TEXT DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id UUID REFERENCES public.expense_categories(id),
  cost_center TEXT DEFAULT '',
  status expense_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense receipts
CREATE TABLE public.expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approval actions
CREATE TABLE public.approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  comments TEXT DEFAULT '',
  level approval_level NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user manages another user
CREATE OR REPLACE FUNCTION public.is_manager_of(_manager_id UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _employee_id AND manager_id = _manager_id
  )
$$;

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', 'General')
  );
  -- Default role: employee
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Managers can view managed profiles" ON public.profiles
  FOR SELECT TO authenticated USING (manager_id = auth.uid());
CREATE POLICY "Finance can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- RLS: User roles (read own)
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS: Expense categories (everyone can read)
CREATE POLICY "Anyone authenticated can view categories" ON public.expense_categories
  FOR SELECT TO authenticated USING (true);

-- RLS: Expenses
CREATE POLICY "Users can CRUD own expenses" ON public.expenses
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Managers can view team expenses" ON public.expenses
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'manager') AND public.is_manager_of(auth.uid(), user_id)
  );
CREATE POLICY "Finance can view all expenses" ON public.expenses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "Finance can update all expenses" ON public.expenses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- RLS: Expense receipts
CREATE POLICY "Users can manage own receipts" ON public.expense_receipts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_id AND user_id = auth.uid()));
CREATE POLICY "Managers can view team receipts" ON public.expense_receipts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = expense_id AND public.has_role(auth.uid(), 'manager') AND public.is_manager_of(auth.uid(), e.user_id)
  ));
CREATE POLICY "Finance can view all receipts" ON public.expense_receipts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- RLS: Approval actions
CREATE POLICY "Approvers can insert actions" ON public.approval_actions
  FOR INSERT TO authenticated WITH CHECK (approver_id = auth.uid());
CREATE POLICY "Users can view approvals on own expenses" ON public.approval_actions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_id AND user_id = auth.uid()));
CREATE POLICY "Approvers can view own actions" ON public.approval_actions
  FOR SELECT TO authenticated USING (approver_id = auth.uid());
CREATE POLICY "Finance can view all approvals" ON public.approval_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- RLS: Audit logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.expenses WHERE id = expense_id AND user_id = auth.uid()
  ));
CREATE POLICY "Finance can view all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

-- Storage RLS
CREATE POLICY "Users can upload own receipts" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view own receipts" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Managers can view team receipts" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'receipts' AND public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY "Finance can view all receipts" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'receipts' AND public.has_role(auth.uid(), 'finance')
  );
