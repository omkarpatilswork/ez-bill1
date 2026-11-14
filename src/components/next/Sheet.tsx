import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ChevronRight, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const OVERLAY = 'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

/**
 * One panel for every "do something" moment: a sheet from the foot of the
 * screen on a phone, a centred dialog on a desktop. Long content scrolls
 * inside it, so the title and the close button stay in reach.
 */
export function Sheet({ open, onOpenChange, label, title, children, wide = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'ez-app fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[26px] border border-b-0 border-line bg-surface-2 pt-3 shadow-[0_-24px_60px_-20px_rgba(0,0,0,.6)] outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:max-h-[88dvh] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[26px] lg:border-b lg:pt-5 lg:data-[state=open]:slide-in-from-bottom-2',
            wide ? 'lg:w-[560px]' : 'lg:w-[440px]',
          )}
        >
          <div className="mx-auto mb-4 h-1 w-9 shrink-0 rounded-full bg-line lg:hidden" aria-hidden="true" />
          <div className="flex shrink-0 items-start justify-between gap-3 px-5">
            <div className="min-w-0">
              {label && <p className="ez-label">{label}</p>}
              <Dialog.Title className={cn('ez-display text-[26px] leading-[1.1] text-fg', label && 'mt-2.5')}>{title}</Dialog.Title>
            </div>
            <Dialog.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-dim hover:bg-surface-3 hover:text-fg" aria-label="Close">
              <X className="h-[18px] w-[18px]" />
            </Dialog.Close>
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))] lg:pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A list of ways to do something, as in "Add a bill": icon, name, one line of help. */
export function SheetChoices({ choices }: {
  choices: { label: string; hint: string; icon: LucideIcon; onSelect?: () => void; busy?: boolean; input?: ReactNode }[];
}) {
  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-[18px] border border-line-soft bg-surface">
      {choices.map((c) => {
        const body = (
          <>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-brand-text"><c.icon className="h-5 w-5" strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-semibold leading-tight text-fg">{c.label}</span>
              <span className="block text-[13px] text-dim">{c.busy ? 'Working on it' : c.hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
          </>
        );
        const cls = cn('flex w-full cursor-pointer items-center gap-3.5 px-3.5 py-3 text-left hover:bg-surface-3', c.busy && 'pointer-events-none opacity-60');
        return (
          <li key={c.label}>
            {c.input ? <label className={cls}>{c.input}{body}</label> : <button type="button" onClick={c.onSelect} disabled={c.busy} className={cls}>{body}</button>}
          </li>
        );
      })}
    </ul>
  );
}

/** "Are you sure?" for anything that cannot be undone. The destructive button is neutral: red is for numbers. */
export function Confirm({ open, onOpenChange, title, body, action, onConfirm, busy = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  action: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content className="ez-app fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-line bg-surface-2 p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <AlertDialog.Title className="ez-display text-[26px] text-fg">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2.5 text-[14.5px] text-dim">{body}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2.5">
            <AlertDialog.Cancel className="ez-btn ez-btn--ghost">Keep it</AlertDialog.Cancel>
            <button type="button" disabled={busy} onClick={onConfirm} className="ez-btn border-line bg-surface-3 text-fg hover:border-fg/40 disabled:opacity-50">{busy ? 'Working' : action}</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Form pieces for sheets and settings screens. */
export const INPUT = 'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-brand focus:shadow-[0_0_0_4px_rgb(var(--ez-brand)/.12)] disabled:opacity-60';

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-dim">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] text-faint">{hint}</p>}
    </div>
  );
}

/** A small mono tag, e.g. "Unverified" or "From Gmail". Neutral on purpose. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('ez-num inline-flex items-center rounded-full border border-line px-2 py-[3px] text-[10.5px] uppercase tracking-[.1em] text-dim', className)}>{children}</span>;
}

/** The heading block every list screen starts with. */
export function ScreenHeader({ title, summary, children }: { title: string; summary?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-6 lg:pt-9">
      <div className="min-w-0">
        <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">{title}</h1>
        {summary && <p className="mt-2 text-[15px] text-dim">{summary}</p>}
      </div>
      {children && <div className="mb-1 flex flex-wrap items-center gap-2 lg:mb-2.5">{children}</div>}
    </header>
  );
}

/** What a screen shows when there is nothing to list yet. */
export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-14 text-center">
      <h2 className="ez-display text-[30px] leading-tight text-fg">{title}</h2>
      <p className="mt-3 text-[15px] text-dim">{body}</p>
      {children && <div className="mt-7 flex flex-wrap justify-center gap-2.5">{children}</div>}
    </div>
  );
}
