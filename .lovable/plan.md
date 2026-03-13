

# ExpenseDesk MVP — Implementation Plan

## Summary

Build the full ExpenseDesk MVP with Supabase Auth, database, and all three role views (Employee, Manager, Finance). Manual expense entry only (no OCR). This is a large build that we'll execute incrementally across multiple messages.

## Phase 1: Foundation (This implementation round)

### 1. Supabase Backend Setup
- **Auth**: Enable email/password authentication via Lovable Cloud
- **Database tables**:
  - `profiles` — user display name, department, manager_id (references another profile)
  - `user_roles` — separate roles table (app_role enum: employee, manager, finance)
  - `expense_categories` — id, name, description (seeded with: Travel, Meals, Office Supplies, Software, Equipment, Other)
  - `expenses` — id, user_id, title, description, amount, currency, merchant, expense_date, category_id, cost_center, status (enum: draft, submitted, manager_approved, approved, rejected, reimbursed), created_at, updated_at
  - `expense_receipts` — id, expense_id, file_path, file_name, uploaded_at
  - `approval_actions` — id, expense_id, approver_id, action (approved/rejected), comments, level (manager/finance), created_at
  - `audit_logs` — id, expense_id, user_id, action, details (jsonb), created_at
- **RLS policies**: Role-based access using `has_role()` security definer function
- **Storage bucket**: `receipts` for uploaded receipt files

### 2. Auth Pages
- `/login` — email/password sign-in
- `/signup` — registration with name, department selection
- Protected route wrapper redirecting unauthenticated users

### 3. App Layout
- Sidebar navigation with role-aware menu items
- Top bar with user info and logout
- Responsive: collapsible sidebar on mobile

### 4. Employee Views
- **Dashboard** (`/`) — summary cards (total expenses, pending, approved, reimbursed amounts), recent expenses list
- **New Expense** (`/expenses/new`) — form with: title, merchant, amount, date, category select, cost center, description, receipt file upload
- **My Expenses** (`/expenses`) — table with status badges, filters by status/date, click to view detail
- **Expense Detail** (`/expenses/:id`) — full details, receipt preview, approval timeline, status history

### 5. Manager Views
- **Team Dashboard** (`/manager`) — pending approval count, team spending summary
- **Pending Approvals** (`/manager/approvals`) — list of direct reports' submitted expenses
- **Review & Approve** — modal/page to view expense detail, add comments, approve or reject

### 6. Finance Views
- **Finance Dashboard** (`/finance`) — org-wide metrics (total pending, approved this month, top categories)
- **All Expenses** (`/finance/expenses`) — filterable table of all org expenses
- **Batch Actions** — select multiple, approve/reject in batch
- **Reports** (`/finance/reports`) — spending by category chart, monthly trend chart, department breakdown

### 7. Shared Features
- Toast notifications for actions (submit, approve, reject)
- Status badge component with color coding
- Audit trail display on expense detail
- Form validation with Zod

## Technical Architecture

```text
src/
├── components/
│   ├── layout/          # AppSidebar, TopBar, ProtectedRoute
│   ├── expenses/        # ExpenseForm, ExpenseTable, ExpenseDetail, StatusBadge
│   ├── approvals/       # ApprovalCard, ApprovalActions
│   ├── dashboard/       # StatCard, SpendingChart, CategoryBreakdown
│   └── ui/              # (existing shadcn components)
├── hooks/
│   ├── useAuth.ts       # Auth state & helpers
│   ├── useExpenses.ts   # CRUD queries
│   ├── useApprovals.ts  # Approval workflow queries
│   └── useUserRole.ts   # Role checking
├── lib/
│   ├── supabase.ts      # Client initialization
│   └── types.ts         # TypeScript interfaces
├── pages/
│   ├── Login.tsx
│   ├── Signup.tsx
│   ├── Dashboard.tsx     # Role-aware routing
│   ├── expenses/
│   ├── manager/
│   └── finance/
└── integrations/
    └── supabase/         # Auto-generated types
```

## Execution Order

Due to the size, we'll build this across multiple rounds:

1. **Round 1**: Supabase setup (tables, auth, RLS) + auth pages + app layout shell
2. **Round 2**: Employee expense submission flow + expense listing
3. **Round 3**: Manager approval workflow
4. **Round 4**: Finance dashboard + reports + batch operations
5. **Round 5**: Polish, audit trail, notifications, mobile responsiveness

