import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AutoSync, runBillImport, SyncLockedError } from '@/lib/auto-bill-import';
import { useAuth } from './useAuth';

/**
 * Auto-syncs bills from Gmail in the background once per day per user.
 * - Requires user consent (AutoSync.setEnabled).
 * - Caps sync window at 30 days from last successful sync.
 * - Shows toasts on start and completion.
 */
export function useAutoSyncBills() {
  const { user } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!user || ranRef.current) return;
    if (!AutoSync.isEnabled(user.id)) return;
    if (AutoSync.hasRunToday(user.id)) return;
    ranRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        // Verify Gmail is connected before starting
        const { data: status } = await supabase.functions.invoke('gmail-auth', {
          body: { action: 'status' },
        });
        if (cancelled || !status?.connected) return;

        const days = AutoSync.computeSyncDays(user.id);
        toast.info('Syncing bills…', {
          description: `Fetching new bills from the last ${days} day${days === 1 ? '' : 's'}.`,
        });

        const result = await runBillImport({ userId: user.id, days });
        if (cancelled) return;

        AutoSync.setLastRunToday(user.id);
        AutoSync.setLastSync(user.id, new Date().toISOString().slice(0, 10));

        if (result.saved > 0) {
          toast.success('Bills synced', {
            description: `Imported ${result.saved} new bill${result.saved === 1 ? '' : 's'}.${result.duplicates > 0 ? ` ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped.` : ''}`,
          });
        } else {
          toast.success('Bills synced', {
            description: result.scanned === 0 ? 'No new bills found.' : 'Everything is up to date.',
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err instanceof SyncLockedError) {
            // Another sync (e.g. manual "Sync now") is already running — silently skip.
            return;
          }
          toast.error('Auto-sync failed', { description: err?.message || 'Please try again later.' });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user]);
}