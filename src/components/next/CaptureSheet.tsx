import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Mail, MessageSquareText, Nfc, ScanLine, Upload, X, type LucideIcon } from 'lucide-react';

interface Source {
  label: string;
  hint: string;
  icon: LucideIcon;
  to: string;
}

/**
 * One way in for every kind of bill. Each source ends on the same review
 * screen; until that screen is built they open the existing pages.
 */
const SOURCES: Source[] = [
  { label: 'Scan', hint: 'Point the camera at a paper bill.', icon: ScanLine, to: '/expenses/new?mode=scan' },
  { label: 'Upload', hint: 'Photos or PDFs. One or many.', icon: Upload, to: '/bulk-upload' },
  { label: 'Gmail', hint: 'Order emails and invoices.', icon: Mail, to: '/email-bills' },
  { label: 'SMS', hint: 'UPI and card messages.', icon: MessageSquareText, to: '/email-bills' },
  { label: 'Tap', hint: 'NFC tag or QR code at the table.', icon: Nfc, to: '/nfc-airdrop' },
];

export default function CaptureSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const go = (to: string) => { onOpenChange(false); navigate(to); };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="ez-app fixed inset-x-0 bottom-0 z-50 rounded-t-[26px] border border-b-0 border-line bg-surface-2 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_60px_-20px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[440px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[26px] lg:border-b lg:px-5 lg:pb-5 lg:pt-5 lg:data-[state=open]:slide-in-from-bottom-2"
        >
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line lg:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="ez-label">Add a bill</p>
              <Dialog.Title className="ez-display mt-2.5 text-[26px] text-fg">Where is it?</Dialog.Title>
            </div>
            <Dialog.Close className="grid h-10 w-10 place-items-center rounded-full border border-line text-dim hover:bg-surface-3 hover:text-fg" aria-label="Close">
              <X className="h-[18px] w-[18px]" />
            </Dialog.Close>
          </div>

          <ul className="mt-4 divide-y divide-line-soft overflow-hidden rounded-[18px] border border-line-soft bg-surface">
            {SOURCES.map((s) => (
              <li key={s.label}>
                <button type="button" onClick={() => go(s.to)} className="flex w-full items-center gap-3.5 px-3.5 py-3 text-left hover:bg-surface-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-brand-text">
                    <s.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-semibold leading-tight text-fg">{s.label}</span>
                    <span className="block text-[13px] text-dim">{s.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>

          <button type="button" onClick={() => go('/expenses/new')} className="mt-3 w-full rounded-full py-2.5 text-[14px] font-medium text-dim hover:text-fg">
            No bill to show? Type it in
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
