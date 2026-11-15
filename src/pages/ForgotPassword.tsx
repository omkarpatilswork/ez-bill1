import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AuthLayout, { AUTH_INPUT, AUTH_LINK, Field } from '@/components/next/AuthLayout';
import SEO from '@/components/SEO';

/** How long the emailed link works: the project's email-link lifetime (Supabase, Authentication, 3600 s). */
const LINK_LIFETIME = 'one hour';

/** Step one of a password reset: ask for the email address and send the link. */
export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState<string>((location.state as { email?: string } | null)?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { toast } = useToast();

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const target = email.trim();
    if (!target) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) {
      const tooMany = error.status === 429 || /rate limit|security purposes/i.test(error.message);
      toast({
        title: 'The email was not sent',
        description: tooMany ? 'Too many emails were asked for just now. Wait a few minutes and try again.' : 'Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    setSentTo(target);
  };

  if (sentTo) {
    return (
      <AuthLayout label="Reset password" title="Check your email." lead={`If ${sentTo} has an EZZ BILL account, a link to set a new password is on its way. It works once, for ${LINK_LIFETIME}.`}
        foot={<Link to="/login" className={AUTH_LINK}>Back to sign in</Link>}>
        <SEO title="Check your email" description="Open the link in your email to set a new password." path="/forgot-password" />
        <p className="text-[14.5px] text-dim">
          Nothing after a few minutes? Look in spam, or{' '}
          <button type="button" className={AUTH_LINK} onClick={() => setSentTo(null)}>try another address</button>.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout label="Reset password" title="Forgot your password?" lead="Enter the email you sign in with. We will send a link to set a new one."
      foot={<>Remembered it? <Link to="/login" className={AUTH_LINK}>Sign in</Link></>}>
      <SEO title="Reset your password" description="Get a link to set a new EZZ BILL password." path="/forgot-password" />
      <form onSubmit={send} className="space-y-4">
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="email" required placeholder="you@example.com" className={AUTH_INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className="ez-btn ez-btn--primary !mt-6 h-12 w-full disabled:opacity-60">{busy ? 'Sending' : 'Send the link'}</button>
      </form>
      <p className="mt-6 text-[14px] text-dim">Signed up with Google? You have no password to reset. Use Continue with Google on the sign-in screen.</p>
    </AuthLayout>
  );
}
