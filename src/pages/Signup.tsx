import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AuthLayout, { AUTH_INPUT, Field, GoogleButton, OrDivider } from '@/components/next/AuthLayout';
import SEO from '@/components/SEO';

const LINK = 'font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { signUp } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // "Department" is a leftover from the app's B2B past; the account still needs a value for it.
    const { error } = await signUp(email, password, fullName, 'General');
    setBusy(false);
    if (error) toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
    else setSent(true);
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) toast({ title: 'Google sign up failed', description: error.message, variant: 'destructive' });
    } catch {
      toast({ title: 'Google sign up failed', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setGoogleBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout label="One more step" title="Check your email." lead={`We sent a link to ${email}. Open it to confirm your address, then sign in.`}
        foot={<Link to="/login" className={LINK}>Back to sign in</Link>}>
        <SEO title="Check your email" description="Confirm your email address to finish creating your EZZ BILL account." path="/signup" />
        <p className="text-[14.5px] text-dim">Nothing there after a few minutes? Look in spam, or sign up again with the same address.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout label="Create account" title="Start with your next bill." lead="An account keeps every bill you add, on every device."
      foot={<>Have an account? <Link to="/login" className={LINK}>Sign in</Link></>}>
      <SEO title="Create your account" description="Create an EZZ BILL account to keep every bill in one place and see where the money goes." path="/signup" />
      <GoogleButton onClick={handleGoogle} busy={googleBusy} />
      <OrDivider />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="fullName" label="Your name">
          <input id="fullName" autoComplete="name" required className={AUTH_INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="email" required placeholder="you@example.com" className={AUTH_INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" type="password" autoComplete="new-password" required minLength={6} placeholder="6 characters or more" className={AUTH_INPUT} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className="ez-btn ez-btn--primary !mt-6 h-12 w-full disabled:opacity-60">{busy ? 'Creating your account' : 'Create account'}</button>
      </form>
    </AuthLayout>
  );
}
