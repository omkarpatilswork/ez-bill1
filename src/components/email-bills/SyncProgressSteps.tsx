import { Check, Loader2, Mail, Sparkles, ShieldCheck, Save } from 'lucide-react';
import type { BillImportPhase } from '@/lib/auto-bill-import';
import { cn } from '@/lib/utils';

const STEPS: { key: BillImportPhase; label: string; icon: typeof Mail }[] = [
  { key: 'fetching', label: 'Fetching emails', icon: Mail },
  { key: 'dedupe', label: 'Checking duplicates', icon: ShieldCheck },
  { key: 'parsing', label: 'Parsing & OCR', icon: Sparkles },
  { key: 'saving', label: 'Saving bills', icon: Save },
];

const ORDER: Record<BillImportPhase | 'idle', number> = {
  idle: -1, fetching: 0, dedupe: 1, parsing: 2, saving: 3, done: 4,
};

interface Props {
  phase: BillImportPhase | 'idle';
  current: number;
  total: number;
  message?: string;
}

export function SyncProgressSteps({ phase, current, total, message }: Props) {
  const activeIdx = ORDER[phase] ?? -1;
  const showProgressBar = (phase === 'parsing' || phase === 'saving') && total > 0;
  const pct = showProgressBar ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3 animate-fade-in">
      <div className="space-y-2">
        {STEPS.map((s, idx) => {
          const isDone = phase === 'done' || idx < activeIdx;
          const isActive = idx === activeIdx && phase !== 'done';
          const isPending = idx > activeIdx && phase !== 'done';
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                  isDone && 'bg-success/20 text-success',
                  isActive && 'bg-primary/20 text-primary',
                  isPending && 'bg-muted text-muted-foreground/60',
                )}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm transition-colors',
                    isActive && 'text-foreground font-medium',
                    isDone && 'text-foreground/80',
                    isPending && 'text-muted-foreground/70',
                  )}
                >
                  {s.label}
                </p>
                {isActive && message && (
                  <p className="text-xs text-muted-foreground truncate">{message}</p>
                )}
              </div>
              {isActive && showProgressBar && (
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {current}/{total}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {showProgressBar && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}