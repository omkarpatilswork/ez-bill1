import { supabase } from '@/integrations/supabase/client';

/**
 * Deletes bills and the rows that hang off them. Returns an error message, or null.
 * The same three steps the app has always taken; the stored original file is left in place.
 */
export async function deleteBills(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  await supabase.from('processed_emails').delete().in('expense_id', ids);
  await supabase.from('expense_receipts').delete().in('expense_id', ids);
  const { error } = await supabase.from('expenses').delete().in('id', ids);
  return error ? error.message : null;
}
