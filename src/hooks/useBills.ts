import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Expense } from '@/lib/types';

export type Bill = Expense & { expense_categories?: { name: string } | null };

const NO_BILLS: Bill[] = [];

/** Every bill the signed-in person has, newest bill date first. Shared by Home and Bills. */
export function useBills() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['bills', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*, expense_categories(name)')
        .eq('user_id', user!.id)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Bill[];
    },
  });
  return { ...query, bills: query.data ?? NO_BILLS, ready: !!user && !query.isLoading };
}
