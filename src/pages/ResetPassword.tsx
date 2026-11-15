import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { clearResetPending, resetLinkAtLoad, resetPending } from '@/lib/reset-link';
import AuthLayout, { AUTH_INPUT, AUTH_LINK, Field } from '@/components/next/AuthLayout';
import SEO from '@/components/SEO';

/** Same rule as Security: the app asks for 8 characters even though the server accepts 6. */
const MIN_LENGTH = 8;

/**
 * Step two of a password reset, where the emailed link lands. The link signs
 * the person in for this one purpose; they choose a new password and go on to
 * Home. Without a working link (expired, used, or opened directly) it offers a
 * new one.
 */
export default function ResetPassword() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  const linkFailed = !!resetLinkAtLoad.error || (!loading && !user);
  const fromLink = resetPending();

  useEffect(() => {
    // A dead link should not leave a "may set a password" note behind in this tab.
    if (linkFailed) clearResetPending();
  }, [linkFailed]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_LENGTH) { toast({ title: `Use at least ${MIN_LENGTH} characters`, variant: 'destructive' }); return; }
    if (next !== again) { toast({ title: 'The two passwords are different', variant: 'destructive' }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) {
      const same = error.code === 'same_password' || /different from the old/i.test(error.message);
      const weak = error.code === 'weak_password';
      toast({
        title: 'The password was not changed',
        description: same ? 'That is your current password. Choose a new one.' : weak ? 'Choose a longer password.' : 'Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    clearResetPending();
    toast({ title: 'Password changed', description: 'You are signed in. Use the new password next time.' });
    navigate('/', { replace: true });
  };

  if (loading && !resetLinkAtLoad.error) {
    return (
      <div className="ez-app grid min-h-screen place-items-center" aria-busy="true" aria-label="Loading">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
      </div>
    );
  }

  if (linkFailed) {
    return (
      <AuthLayout label="Reset password" title="This link has expired." lead="A reset link works once, for one hour. Ask for a new one and use the latest email."
        foot={<Link to="/login" className={AUTH_LINK}>Back to sign in</Link>}>
        <SEO title="Link expired" description="Ask for a new link to set your EZZ BILL password." path="/reset-password" />
        <Link to="/forgot-password" className="ez-btn ez-btn--primary h-12 w-full">Send a new link</Link>
      </AuthLayout>
    );
  }

  // Signed in, but not through a reset link: the password is changed in Security, with the current one.
  if (!fromLink) return <Navigate to="/security" replace />;

  return (
    <AuthLayout label="Reset password" title="Choose a new password." lead={user?.email ? `For ${user.email}.` : 'For your EZZ BILL account.'}
      foot={<Link to="/login" className={AUTH_LINK}>Back to sign in</Link>}>
      <SEO title="Choose a new password" description="Set a new password for your EZZ BILL account." path="/reset-password" />
      <form onSubmit={save} className="space-y-4">
        {/* Lets a password manager file the new password under the right account. */}
        <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <Field id="new-password" label="New password">
          <input id="new-password" type="password" autoComplete="new-password" required minLength={MIN_LENGTH} placeholder={`${MIN_LENGTH} characters or more`} className={AUTH_INPUT} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field id="new-password-again" label="New password again">
          <input id="new-password-again" type="password" autoComplete="new-password" required className={AUTH_INPUT} value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className="ez-btn ez-btn--primary !mt-6 h-12 w-full disabled:opacity-60">{busy ? 'Saving' : 'Save and sign in'}</button>
      </form>
    </AuthLayout>
  );
}
