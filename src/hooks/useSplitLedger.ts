import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { PaymentRow, SplitRow } from '@/lib/split-balances';

/** Both halves of the splits ledger for the signed-in person: shares handed out, and payments back. */
export function useSplitLedger() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['split-ledger', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [splits, payments] = await Promise.all([
        supabase.from('bill_splits').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
        supabase.from('split_payments').select('*').eq('user_id', user!.id).order('paid_at', { ascending: false }),
      ]);
      if (splits.error) throw splits.error;
      if (payments.error) throw payments.error;
      return { splits: (splits.data || []) as unknown as SplitRow[], payments: (payments.data || []) as unknown as PaymentRow[] };
    },
  });
}
