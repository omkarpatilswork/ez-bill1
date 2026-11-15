import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Wordmark } from './Logo';

/** Links inside legal text: the body colour, underlined, emerald on hover. */
export const LEGAL_LINK = 'font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand';

/**
 * The frame for Terms and Privacy: open to everyone, signed in or not, so it
 * sits outside the app shell. One readable column; sections are divided by a
 * hairline, not boxed, so the page reads as a document.
 */
export default function LegalPage({ label, title, lead, updated, children }: {
  label: string; title: string; lead: string; updated: string; children: ReactNode;
}) {
  const navigate = useNavigate();
  // Back where the person came from; straight to Home when the page was opened on its own.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <main className="ez-app min-h-screen px-5 pb-16 pt-6 sm:px-10 lg:pt-10">
      <div className="mx-auto max-w-[680px]">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="EZZ BILL"><Wordmark /></Link>
          <button type="button" onClick={back} className="inline-flex items-center gap-1 text-[14px] font-medium text-dim hover:text-fg">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        </div>

        <header className="ez-rise mt-12 lg:mt-16">
          <p className="ez-label">{label}</p>
          <h1 className="ez-display mt-4 text-[40px] leading-[1.05] text-fg lg:text-[54px]">{title}</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-dim">{lead}</p>
          <p className="ez-num mt-4 text-[12.5px] text-faint">Last updated {updated}</p>
        </header>

        <div className="mt-10">{children}</div>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line-soft py-8">
      <h2 className="ez-display text-[24px] leading-tight text-fg lg:text-[26px]">{title}</h2>
      <div className="mt-4 space-y-3 text-[15.5px] leading-relaxed text-dim [&_strong]:font-semibold [&_strong]:text-fg">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A quieter closing note under a section's bullets. */
export function Fine({ children }: { children: ReactNode }) {
  return <p className="text-[13.5px] text-faint">{children}</p>;
}
