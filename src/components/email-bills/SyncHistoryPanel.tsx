import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  History, RefreshCw, CheckCircle2, XCircle, MinusCircle, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncRun {
  id: string;
  kind: 'auto' | 'sync_now' | 'manual_30' | string;
  days: number;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | 'locked' | string;
  saved: number;
  skipped: number;
  duplicates: number;
  total: number;
  error_message: string | null;
}

const KIND_LABEL: Record<string, string> = {
  auto: 'Manual sync',
  sync_now: 'Manual sync',
  manual_30: 'Manual sync',
  manual_all: 'Manual sync',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function rangeLabel(run: SyncRun) {
  const end = run.started_at;
  const start = new Date(new Date(end).getTime() - run.days * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} → ${fmt(new Date(end))}`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === 'locked') return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
}

function statusLabel(status: string) {
  if (status === 'locked') return 'skipped';
  return status;
}

export function SyncHistoryPanel({ refreshKey }: { refreshKey?: number }) {
  const { user } = useAuth();
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SyncRun | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('sync_runs' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(20);
    setRuns(((data as unknown) as SyncRun[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Sync History</h3>
          {runs.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{runs.length}</Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-8 px-2">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} className="h-8 px-2">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {open && (
        <>
          {loading && runs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No sync runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelected(run)}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-secondary/20 border border-border/30 hover:bg-secondary/40 hover:border-primary/40 transition-colors"
                >
                  <div className="mt-0.5"><StatusIcon status={run.status} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">
                        {KIND_LABEL[run.kind] || run.kind}
                      </span>
                      <Badge
                        variant={run.status === 'success' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-[10px] capitalize"
                      >
                        {statusLabel(run.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{rangeLabel(run)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(run.started_at)}
                      {run.finished_at && run.status !== 'running' && (
                        <> · {Math.max(1, Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000))}s</>
                      )}
                    </p>
                    {run.status === 'success' && (
                      <p className="text-xs text-foreground/80 mt-1">
                        <span className="font-medium">{run.saved}</span> imported
                        {run.duplicates > 0 && <> · {run.duplicates} duplicate{run.duplicates === 1 ? '' : 's'}</>}
                        {run.skipped > 0 && <> · {run.skipped} skipped</>}
                        {run.total === 0 && <> · no bills found</>}
                      </p>
                    )}
                    {run.status === 'failed' && run.error_message && (
                      <p className="text-xs text-destructive mt-1 line-clamp-2">{run.error_message}</p>
                    )}
                    {run.status === 'locked' && (
                      <p className="text-xs text-muted-foreground mt-1">Skipped — another sync was already in progress.</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <StatusIcon status={selected.status} />
                  {KIND_LABEL[selected.kind] || selected.kind}
                  <Badge
                    variant={selected.status === 'success' ? 'default' : selected.status === 'failed' ? 'destructive' : 'secondary'}
                    className="text-[10px] capitalize ml-1"
                  >
                    {statusLabel(selected.status)}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Fetch window: {rangeLabel(selected)} ({selected.days} day{selected.days === 1 ? '' : 's'})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/30 border border-border/30 p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Started</p>
                    <p className="text-foreground mt-1">{new Date(selected.started_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 border border-border/30 p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Finished</p>
                    <p className="text-foreground mt-1">
                      {selected.finished_at ? new Date(selected.finished_at).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>

                {selected.finished_at && (
                  <p className="text-xs text-muted-foreground">
                    Duration: {Math.max(1, Math.round((new Date(selected.finished_at).getTime() - new Date(selected.started_at).getTime()) / 1000))}s
                  </p>
                )}

                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Counts</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-secondary/30 border border-border/30 p-3">
                      <p className="text-[11px] text-muted-foreground">Bills found</p>
                      <p className="text-lg font-semibold text-foreground">{selected.total}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/30 border border-border/30 p-3">
                      <p className="text-[11px] text-muted-foreground">Imported</p>
                      <p className="text-lg font-semibold text-success">{selected.saved}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/30 border border-border/30 p-3">
                      <p className="text-[11px] text-muted-foreground">Duplicates</p>
                      <p className="text-lg font-semibold text-foreground">{selected.duplicates}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/30 border border-border/30 p-3">
                      <p className="text-[11px] text-muted-foreground">Skipped</p>
                      <p className="text-lg font-semibold text-foreground">{selected.skipped}</p>
                    </div>
                  </div>
                  {selected.status === 'success' && selected.total > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Of {selected.total} bill{selected.total === 1 ? '' : 's'} found, {selected.saved} {selected.saved === 1 ? 'was' : 'were'} imported and {selected.duplicates} {selected.duplicates === 1 ? 'was a' : 'were'} duplicate{selected.duplicates === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>

                {selected.error_message && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Error</p>
                    <pre className="text-xs text-destructive whitespace-pre-wrap break-words rounded-lg bg-destructive/10 border border-destructive/30 p-3 max-h-48 overflow-auto">
{selected.error_message}
                    </pre>
                  </div>
                )}

                {selected.status === 'locked' && (
                  <p className="text-xs text-muted-foreground">
                    This run was skipped because another sync was already in progress.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}