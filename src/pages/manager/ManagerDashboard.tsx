import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Users, Clock, CheckCircle, DollarSign } from 'lucide-react';
import type { Expense } from '@/lib/types';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [teamExpenses, setTeamExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('id').eq('manager_id', user.id).then(async ({ data: reports }) => {
      if (!reports?.length) return;
      const ids = reports.map(r => (r as any).id);
      const { data } = await supabase.from('expenses').select('*').in('user_id', ids);
      setTeamExpenses((data as unknown as Expense[]) || []);
    });
  }, [user]);

  const pending = teamExpenses.filter(e => e.status === 'submitted');
  const approved = teamExpenses.filter(e => ['manager_approved', 'approved', 'reimbursed'].includes(e.status));
  const totalAmount = teamExpenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Team Dashboard</h1>
        <Button asChild className="w-full sm:w-auto"><Link to="/manager/approvals">View Pending Approvals</Link></Button>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard title="Team Expenses" value={teamExpenses.length} icon={Users} />
        <StatCard title="Pending Approval" value={pending.length} icon={Clock} />
        <StatCard title="Approved" value={approved.length} icon={CheckCircle} />
        <StatCard title="Total Team Spend" value={`$${totalAmount.toFixed(2)}`} icon={DollarSign} />
      </div>
    </div>
  );
}
