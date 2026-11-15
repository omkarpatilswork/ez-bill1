import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Camera, FileUp, Mail } from 'lucide-react';
import SEO from '@/components/SEO';
import AuthLayout, { AUTH_INPUT, Field } from '@/components/next/AuthLayout';
import { SheetChoices } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { handOver } from '@/lib/capture-inbox';
import { COUNTRIES, getCurrencyForCountry, getCurrencySymbol } from '@/lib/countries';

/**
 * First run. One short form (name, country, agreement), then straight to the
 * first bill: the point of the app, reached in two screens instead of five.
 */
export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('IN');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setName((n) => n || profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  }, [profile, user]);

  if (profile?.onboarding_completed && !done) return <Navigate to="/" replace />;

  const currency = getCurrencyForCountry(country) || 'INR';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    if (!name.trim()) { toast({ title: 'Enter your name', variant: 'destructive' }); return; }
    if (!agreed) { toast({ title: 'Agree to the Terms and Privacy to continue', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: name.trim(), full_name: name.trim(), country, default_currency: currency,
      onboarding_completed: true, terms_accepted_at: new Date().toISOString(),
    } as never).eq('id', user.id);
    if (error) { setSaving(false); toast({ title: 'That was not saved', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    setDone(true);
    await refreshProfile();
    setSaving(false);
  };

  const picker = (mode: 'scan' | 'upload') => (
    <input type="file" className="sr-only" multiple={mode === 'upload'} accept={mode === 'scan' ? 'image/*' : 'image/*,.pdf,.heic,.heif'}
      {...(mode === 'scan' ? { capture: 'environment' as const } : {})}
      onChange={(e) => {
        const files = [...(e.target.files || [])];
        if (!files.length) return;
        handOver(files);
        navigate(`/expenses/new?mode=${mode}`, { state: { batch: Date.now() } });
      }} />
  );

  if (done) {
    return (
      <AuthLayout label="Step 2 of 2" title="Add your first bill." lead="Any bill will do: the coffee from this morning, last night's order, a parking slip."
        foot={<Link to="/" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">Skip for now</Link>}>
        <SEO title="Your first bill" description="Add your first bill to EZZ BILL." path="/onboarding" />
        <SheetChoices choices={[
          { label: 'Scan', hint: 'Point the camera at a paper bill.', icon: Camera, input: picker('scan') },
          { label: 'Upload', hint: 'A photo or PDF you already have.', icon: FileUp, input: picker('upload') },
          { label: 'Gmail', hint: 'Find the bills already in your inbox.', icon: Mail, onSelect: () => navigate('/email-bills') },
        ]} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout label="Step 1 of 2" title="Set up EZZ BILL." lead="Two details, then your first bill."
      foot={<>Signed in as {user?.email}.</>}>
      <SEO title="Set up" description="Set up your EZZ BILL account." path="/onboarding" />
      <form onSubmit={save} className="space-y-4">
        <Field id="ob-name" label="Your name"><input id="ob-name" className={AUTH_INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus /></Field>
        <Field id="ob-country" label="Country">
          <select id="ob-country" className={AUTH_INPUT} value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <p className="text-[13px] text-faint">Totals are shown in <span className="ez-num">{currency} {getCurrencySymbol(currency)}</span>. You can change this in Settings.</p>
        <label className="flex cursor-pointer items-start gap-3 pt-1 text-[14.5px] text-dim">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-[rgb(var(--ez-brand))]" />
          <span>I agree to the <Link to="/terms" target="_blank" className="font-medium text-fg underline decoration-line underline-offset-4">Terms</Link> and the <Link to="/privacy" target="_blank" className="font-medium text-fg underline decoration-line underline-offset-4">Privacy policy</Link>.</span>
        </label>
        <button type="submit" disabled={saving} className="ez-btn ez-btn--primary w-full disabled:opacity-50">{saving ? 'Saving' : 'Continue'}</button>
      </form>
    </AuthLayout>
  );
}
