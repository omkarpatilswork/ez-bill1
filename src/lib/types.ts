export type AppRole = 'employee' | 'manager' | 'finance';
export type ExpenseStatus = 'draft' | 'submitted' | 'manager_approved' | 'approved' | 'rejected' | 'reimbursed';
export type ApprovalLevel = 'manager' | 'finance';

export interface Profile {
  id: string;
  full_name: string;
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
  merchant: string;
  expense_date: string;
  category_id: string | null;
  cost_center: string;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: ExpenseCategory;
  profile?: Profile;
  receipts?: ExpenseReceipt[];
  approval_actions?: ApprovalAction[];
}

export interface ExpenseReceipt {
  id: string;
  expense_id: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
}

export interface ApprovalAction {
  id: string;
  expense_id: string;
  approver_id: string;
  action: 'approved' | 'rejected';
  comments: string;
  level: ApprovalLevel;
  created_at: string;
  approver?: Profile;
}

export interface AuditLog {
  id: string;
  expense_id: string | null;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export const STATUS_CONFIG: Record<ExpenseStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft: { label: 'Draft', variant: 'secondary', className: 'bg-muted text-muted-foreground' },
  submitted: { label: 'Submitted', variant: 'default', className: 'bg-info text-info-foreground' },
  manager_approved: { label: 'Manager Approved', variant: 'outline', className: 'bg-warning/20 text-warning' },
  approved: { label: 'Approved', variant: 'default', className: 'bg-success text-success-foreground' },
  rejected: { label: 'Rejected', variant: 'destructive', className: 'bg-destructive text-destructive-foreground' },
  reimbursed: { label: 'Reimbursed', variant: 'default', className: 'bg-primary text-primary-foreground' },
};
