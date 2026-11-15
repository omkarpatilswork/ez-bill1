import { Link } from 'react-router-dom';
import { Wordmark } from '@/components/next/Logo';
import SEO from '@/components/SEO';

/** Any address the app does not know. Open to everyone, so it sits outside the app shell. */
export default function NotFound() {
  return (
    <main className="ez-app flex min-h-screen flex-col px-5 pb-10 pt-6 sm:px-10 lg:pt-10">
      <SEO title="Page not found" description="This page is not part of EZZ BILL." />
      <Link to="/" aria-label="EZZ BILL" className="self-start"><Wordmark /></Link>
      <div className="ez-rise mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
        <p className="ez-label">Not found</p>
        <h1 className="ez-display mt-4 text-[40px] leading-[1.05] text-fg sm:text-[46px]">Nothing on this page.</h1>
        <p className="mt-3.5 text-[15.5px] text-dim">The link may be old, or the address may have a typo. Your bills are where you left them.</p>
        <Link to="/" className="ez-btn ez-btn--primary mt-8 h-12 w-full sm:w-auto sm:self-start sm:px-8">Go to Home</Link>
      </div>
    </main>
  );
}
