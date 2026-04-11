export type AppRole = 'employee' | 'manager' | 'finance';

export interface Profile {
  id: string;
  full_name: string;
  display_name: string;
  phone: string | null;
  phone_verified: boolean;
  country: string | null;
  default_currency: string;
  onboarding_completed: boolean;
  terms_accepted_at: string | null;
  department: string;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
}

export interface Expense {
  id: string;
  user_id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  original_currency: string | null;
  converted_amount: number | null;
  conversion_rate: number | null;
  merchant: string;
  expense_date: string;
  category_id: string | null;
  cost_center: string;
  status: string;
  created_at: string;
  updated_at: string;
  category?: ExpenseCategory;
  profile?: Profile;
  receipts?: ExpenseReceipt[];
}

export interface ExpenseReceipt {
  id: string;
  expense_id: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
}
