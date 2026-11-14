import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AuthLayout, { AUTH_INPUT, Field, GoogleButton, OrDivider } from '@/components/next/AuthLayout';
import SEO from '@/components/SEO';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
    else navigate('/');
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) toast({ title: 'Google sign in failed', description: error.message, variant: 'destructive' });
    } catch {
      toast({ title: 'Google sign in failed', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <AuthLayout label="Sign in" title="Every bill, in one place." lead="Sign in to see where the money went."
      foot={<>New here? <Link to="/signup" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">Create an account</Link></>}>
      <SEO title="Sign in" description="Sign in to EZZ BILL to see every bill in one place and where the money went." path="/login" />
      <GoogleButton onClick={handleGoogle} busy={googleBusy} />
      <OrDivider />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="email" required placeholder="you@example.com" className={AUTH_INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" type="password" autoComplete="current-password" required className={AUTH_INPUT} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className="ez-btn ez-btn--primary !mt-6 h-12 w-full disabled:opacity-60">{busy ? 'Signing in' : 'Sign in'}</button>
      </form>
    </AuthLayout>
  );
}
