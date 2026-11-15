import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Slip from './Slip';
import { Wordmark } from './Logo';

/** The demo bill used everywhere the product shows a sample: not a real purchase. */
const DEMO_ITEMS = [
  { name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 },
  { name: 'Almond Croissant', quantity: 1, unit_price: 92, total_price: 92 },
];

/** Sign-in and sign-up share this frame: the form on ink, a sample bill on paper beside it. */
export default function AuthLayout({ label, title, lead, children, foot }: {
  label: string; title: string; lead: string; children: ReactNode; foot: ReactNode;
}) {
  return (
    <main className="ez-app grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-5 pb-10 pt-6 sm:px-10 lg:px-16 lg:pt-10">
        <Link to="/login" aria-label="EZZ BILL"><Wordmark /></Link>
        <div className="ez-rise mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <p className="ez-label">{label}</p>
          <h1 className="ez-display mt-4 text-[40px] text-fg sm:text-[46px]">{title}</h1>
          <p className="mt-3.5 text-[15.5px] text-dim">{lead}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-7 text-[14.5px] text-dim">{foot}</p>
        </div>
        <p className="text-[12.5px] text-faint">
          <Link to="/privacy" className="underline decoration-line underline-offset-4 hover:text-dim">Privacy</Link>
          <span className="px-2">·</span>
          <Link to="/terms" className="underline decoration-line underline-offset-4 hover:text-dim">Terms</Link>
        </p>
      </div>

      <aside className="relative hidden items-center justify-center overflow-hidden border-l border-line-soft bg-surface-2 lg:flex" aria-hidden="true">
        <div className="w-[320px]">
          <div className="ez-rise mb-5 flex items-center gap-3 rounded-[18px] border border-line bg-surface-3 px-3.5 py-3" style={{ animationDelay: '.5s' }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand">
              <svg viewBox="0 0 22 26" className="h-5 w-[18px]"><path d="M2 1.5h18v21l-3-2-3 2-3-2-3 2-3-2-3 2z" fill="#04130B" /><path d="M6 7h10M6 11h10M6 15h6" stroke="#3FAF7D" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13.5px] font-semibold text-fg">Bill received</span>
              <span className="block truncate text-[12.5px] text-dim">Blue Tokai Coffee · Table 3</span>
            </span>
            <span className="ez-num text-[13.5px] text-fg">₹412</span>
          </div>
          <Slip print merchant="Blue Tokai Coffee" sub="Koregaon Park · Table 3" items={DEMO_ITEMS} total={412} foot="Paid via UPI" />
          <p className="ez-label ez-label--quiet mt-7 text-center text-[11px]">Sample bill</p>
        </div>
      </aside>
    </main>
  );
}

export const AUTH_INPUT = 'h-12 w-full rounded-full border border-line bg-surface-2 px-5 text-[15.5px] text-fg outline-none placeholder:text-faint focus:border-brand focus:shadow-[0_0_0_4px_rgb(var(--ez-brand)/.12)]';

/** Text links on the sign-in screens: quiet, underlined, emerald on hover. */
export const AUTH_LINK = 'font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand';

/** A labelled input. `aside` sits at the right end of the label row, e.g. "Forgot password?". */
export function Field({ id, label, aside, children }: { id: string; label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-[13.5px] font-medium text-dim">{label}</label>
        {aside && <span className="text-[13.5px]">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

export function GoogleButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="ez-btn ez-btn--ghost h-12 w-full disabled:opacity-60">
      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {busy ? 'Opening Google' : 'Continue with Google'}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-4" role="separator">
      <span className="h-px flex-1 bg-line-soft" />
      <span className="ez-label ez-label--quiet text-[11px]">or with email</span>
      <span className="h-px flex-1 bg-line-soft" />
    </div>
  );
}
