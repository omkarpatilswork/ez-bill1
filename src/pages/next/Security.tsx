import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import SEO from '@/components/SEO';
import { Field, INPUT, Tag } from '@/components/next/Sheet';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const DELETE_WORD = 'DELETE';

/** Security: the password, the email address, and deleting the account for good. */
export default function Security() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const email = user?.email || '';
  const verified = !!user?.email_confirmed_at;
  const google = user?.app_metadata?.provider === 'google' || !!user?.identities?.some((i) => i.provider === 'google');
  const hasPassword = !!user?.identities?.some((i) => i.provider === 'email');

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const failed = (title: string) => toast({ title, description: 'Try again in a moment.', variant: 'destructive' });

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { toast({ title: 'Use at least 8 characters', variant: 'destructive' }); return; }
    if (next !== again) { toast({ title: 'The two new passwords are different', variant: 'destructive' }); return; }
    setBusy('password');
    const { error } = await supabase.auth.updateUser({ password: next, ...(hasPassword ? { current_password: current } : {}) } as never);
    setBusy(null);
    if (error) { toast({ title: 'The password was not changed', description: /current|invalid|incorrect/i.test(error.message) ? 'The current password is not right.' : 'Try again in a moment.', variant: 'destructive' }); return; }
    setCurrent(''); setNext(''); setAgain('');
    toast({ title: 'Password changed', description: 'Use the new one next time you sign in.' });
  };

  const changeEmail = async (e: FormEvent) => {
    e.preventDefault();
    const target = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) { toast({ title: 'Enter a full email address', variant: 'destructive' }); return; }
    if (target === email) { toast({ title: 'That is already your email' }); return; }
    setBusy('email');
    const { error } = await supabase.auth.updateUser({ email: target });
    setBusy(null);
    if (error) { failed('The email was not changed'); return; }
    setNewEmail('');
    toast({ title: 'Check your new inbox', description: `Open the link sent to ${target} to finish the change.` });
  };

  const resend = async () => {
    setBusy('resend');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setBusy(null);
    if (error) failed('The email was not sent'); else toast({ title: 'Confirmation email sent', description: `Open the link sent to ${email}.` });
  };

  const deleteAccount = async () => {
    setBusy('delete');
    const { error } = await supabase.functions.invoke('delete-account');
    setBusy(null);
    if (error) { failed('The account was not deleted'); return; }
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <>
      <SEO title="Security" description="Change your password or email, or delete your account." path="/security" />
      <div className="max-w-[640px] pb-10">
        <Link to="/settings" className="mt-5 inline-flex items-center gap-1 text-[14px] font-medium text-dim hover:text-fg lg:mt-8"><ChevronLeft className="h-4 w-4" /> Settings</Link>
        <h1 className="ez-display mt-4 text-[38px] text-fg lg:text-[54px]">Security</h1>

        <section className="mt-9">
          <h2 className="ez-label !text-dim">Email</h2>
          <div className="ez-card mt-3 p-4 lg:p-5">
            <p className="flex flex-wrap items-center gap-2.5 text-[15.5px] text-fg"><span className="min-w-0 break-all">{email}</span><Tag>{google ? 'Google sign-in' : verified ? 'Confirmed' : 'Not confirmed'}</Tag></p>
            {!google && !verified && (
              <p className="mt-3 text-[14px] text-dim">Confirm it from the email you were sent. <button type="button" disabled={busy === 'resend'} onClick={resend} className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">{busy === 'resend' ? 'Sending' : 'Send it again'}</button></p>
            )}
            {google ? <p className="mt-3 text-[14px] text-dim">You sign in with Google, so the address is changed in your Google account.</p> : (
              <form onSubmit={changeEmail} className="mt-5 flex flex-wrap items-end gap-2.5 border-t border-line-soft pt-4">
                <Field id="sec-email" label="New email" className="min-w-[220px] flex-1"><input id="sec-email" type="email" className={INPUT} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" /></Field>
                <button type="submit" disabled={busy === 'email' || !newEmail.trim()} className="ez-btn ez-btn--ghost disabled:opacity-50">{busy === 'email' ? 'Sending' : 'Change email'}</button>
              </form>
            )}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="ez-label !text-dim">Password</h2>
          <form onSubmit={changePassword} className="ez-card mt-3 space-y-4 p-4 lg:p-5">
            {google && !hasPassword && <p className="text-[14px] text-dim">You sign in with Google and have no password here. Set one to also sign in with your email.</p>}
            {hasPassword && <Field id="sec-current" label="Current password"><input id="sec-current" type="password" className={INPUT} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>}
            <Field id="sec-new" label="New password" hint="At least 8 characters."><input id="sec-new" type="password" className={INPUT} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
            <Field id="sec-again" label="New password again"><input id="sec-again" type="password" className={INPUT} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
            <div className="flex justify-end"><button type="submit" disabled={busy === 'password' || !next || (hasPassword && !current)} className="ez-btn ez-btn--primary disabled:opacity-50">{busy === 'password' ? 'Saving' : hasPassword ? 'Change password' : 'Set password'}</button></div>
          </form>
        </section>

        <section className="mt-9">
          <h2 className="ez-label !text-dim">Delete your account</h2>
          <div className="ez-card mt-3 p-4 lg:p-5">
            <p className="text-[14.5px] text-dim">This removes every bill, photo, warranty, subscription and split, and your sign-in. It cannot be undone and nothing can be recovered afterwards.</p>
            <div className="mt-4 flex justify-end"><button type="button" className="ez-btn ez-btn--ghost" onClick={() => { setTyped(''); setDeleting(true); }}>Delete my account</button></div>
          </div>
        </section>
      </div>

      <AlertDialog.Root open={deleting} onOpenChange={setDeleting}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <AlertDialog.Content className="ez-app fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-line bg-surface-2 p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <AlertDialog.Title className="ez-display text-[26px] text-fg">Delete everything?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-[14.5px] text-dim">Your bills, photos and account are removed for good. To go ahead, type {DELETE_WORD} below.</AlertDialog.Description>
            <input aria-label={`Type ${DELETE_WORD} to confirm`} className={`${INPUT} ez-num mt-4`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <div className="mt-6 flex justify-end gap-2.5">
              <AlertDialog.Cancel className="ez-btn ez-btn--ghost">Keep my account</AlertDialog.Cancel>
              <button type="button" disabled={typed.trim() !== DELETE_WORD || busy === 'delete'} onClick={deleteAccount} className="ez-btn border-line bg-surface-3 text-fg hover:border-fg/40 disabled:opacity-40">{busy === 'delete' ? 'Deleting' : 'Delete account'}</button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
