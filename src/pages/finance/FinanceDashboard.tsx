import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Building2, Clock, CheckCircle, DollarSign, BarChart3 } from 'lucide-react';
import type { Expense } from '@/lib/types';

export default function FinanceDashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    supabase.from('expenses').select('*').then(({ data }) => {
      setExpenses((data as unknown as Expense[]) || []);
    });
  }, []);

  const pending = expenses.filter(e => ['submitted', 'manager_approved'].includes(e.status));
  const approved = expenses.filter(e => e.status === 'approved');
  const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Finance Dashboard</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button asChild variant="outline" className="w-full sm:w-auto"><Link to="/finance/expenses">All Expenses</Link></Button>
          <Button asChild className="w-full sm:w-auto"><Link to="/finance/reports"><BarChart3 className="mr-2 h-4 w-4" /> Reports</Link></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard title="Total Expenses" value={expenses.length} icon={Building2} />
        <StatCard title="Pending Review" value={pending.length} icon={Clock} />
        <StatCard title="Approved (Unreimbursed)" value={approved.length} icon={CheckCircle} />
        <StatCard title="Total Volume" value={`$${totalAmount.toFixed(2)}`} icon={DollarSign} />
      </div>
    </div>
  );
}
