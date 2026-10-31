import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, KeyRound, Mail, ShieldCheck, ShieldAlert, Trash2,
  CheckCircle2, Send, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Security() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ---------- Password ---------- */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  /* ---------- Email ---------- */
  const email = user?.email ?? '';
  const isVerified = !!(user?.email_confirmed_at ?? (user as any)?.confirmed_at);
  const isGoogleUser = user?.app_metadata?.provider === 'google' || !!(user?.identities ?? []).find((i: any) => i?.provider === 'google');
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [resending, setResending] = useState(false);

  /* ---------- Danger zone ---------- */
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!user) return;
    if (!currentPassword || !newPassword) {
      toast({ title: 'Fill in both password fields', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'New password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: 'destructive' });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    } as any);
    setSavingPassword(false);
    if (error) {
      toast({ title: 'Could not change password', description: error.message, variant: 'destructive' });
    } else {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast({ title: 'Password changed 🔒', description: 'Use your new password next time you sign in.' });
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email } as any);
    setResending(false);
    if (error) {
      toast({ title: 'Could not send email', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Verification email sent 📬', description: `Open the link we sent to ${email}.` });
    }
  };

  const handleChangeEmail = async () => {
    if (!user) return;
    const target = newEmail.trim().toLowerCase();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    if (target === email) {
      toast({ title: 'This is already your email' });
      return;
    }
    setChangingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: target });
    setChangingEmail(false);
    if (error) {
      toast({ title: 'Could not start email change', description: error.message, variant: 'destructive' });
    } else {
      setNewEmail('');
      toast({
        title: 'Check both inboxes ✉️',
        description: 'We sent a confirmation link to your new address. Click it to finish the change.',
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    const { error } = await supabase.functions.invoke('delete-account');
    setDeleting(false);
    if (error) {
      toast({ title: 'Could not delete account', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="max-w-lg mx-auto space-y-5 animate-fade-in pb-8">
      {/* Mobile header */}
      <div className="flex items-center gap-3 md:hidden">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-button flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Security</h1>
      </div>
      {/* Desktop header */}
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">Password, email verification & account deletion</p>
      </div>

      {/* ---------- Account overview ---------- */}
      <section className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{email}</p>
            <p className={`text-[11px] flex items-center gap-1 mt-0.5 ${isVerified ? 'text-accent' : 'text-destructive'}`}>
              {isVerified ? <><CheckCircle2 className="h-3 w-3" /> Email verified</> : <><ShieldAlert className="h-3 w-3" /> Email not verified</>}
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Password ---------- */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center ring-1 ring-primary/25 shrink-0">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Change password</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Confirm your current password, then set a new one</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Current password</Label>
          <Input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" className="glass-button border-0 h-10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">New password</Label>
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters" className="glass-button border-0 h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Confirm new</Label>
            <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat it" className="glass-button border-0 h-10" />
          </div>
        </div>
        <Button className="w-full active:scale-[0.98]" onClick={handleChangePassword} disabled={savingPassword}>
          <KeyRound className="h-4 w-4 mr-1.5" /> {savingPassword ? 'Updating…' : 'Update password'}
        </Button>
      </section>

      {/* ---------- Email verification ---------- */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-accent/15 flex items-center justify-center ring-1 ring-accent/25 shrink-0">
            <Mail className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Email verification</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Verify your address so password resets reach you</p>
          </div>
        </div>

        {isGoogleUser ? (
          <p className="text-[11px] text-muted-foreground rounded-xl bg-card/60 border border-border/50 px-4 py-3">
            You signed in with Google — your email is verified by Google automatically.
          </p>
        ) : isVerified ? (
          <p className="text-[11px] text-accent rounded-xl bg-card/60 border border-border/50 px-4 py-3 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {email} is verified. You're all set.
          </p>
        ) : (
          <Button variant="secondary" className="w-full active:scale-[0.98]" onClick={handleResendVerification} disabled={resending}>
            <Send className="h-4 w-4 mr-1.5" /> {resending ? 'Sending…' : 'Resend verification email'}
          </Button>
        )}

        {!isGoogleUser && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-muted-foreground">Change email address</Label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" className="glass-button border-0 h-9" />
              <Button size="sm" variant="secondary" className="h-9 active:scale-95" onClick={handleChangeEmail} disabled={changingEmail || !newEmail.trim()}>
                {changingEmail ? 'Sending…' : 'Change'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">A confirmation link is sent to your new address. Nothing changes until you click it.</p>
          </div>
        )}
      </section>

      {/* ---------- Danger zone ---------- */}
      <section className="rounded-2xl overflow-hidden border border-destructive/25 bg-gradient-to-br from-destructive/10 via-card to-card">
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-destructive/15 flex items-center justify-center ring-1 ring-destructive/25 shrink-0">
              <Trash2 className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Delete account</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Permanent — this cannot be undone</p>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Deleting your account removes your bills, warranties, splits, subscriptions, Gmail connection and all uploaded receipt photos. This action is irreversible.
              </p>
              <Button variant="destructive" className="w-full active:scale-[0.98]" onClick={() => setShowDeleteConfirm(true)}>
                <AlertTriangle className="h-4 w-4 mr-1.5" /> Delete my account
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Type <span className="font-semibold text-destructive">DELETE</span> below to confirm. Everything listed above will be erased.
              </p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="glass-button border-0 h-10"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="active:scale-[0.98]" onClick={() => { setShowDeleteConfirm(false); setConfirmText(''); }} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" className="active:scale-[0.98]" onClick={handleDeleteAccount} disabled={deleting || confirmText !== 'DELETE'}>
                  {deleting ? 'Deleting…' : 'Delete forever'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
