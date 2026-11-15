/* eslint-disable @typescript-eslint/no-explicit-any -- the claim logic is carried over unchanged from the Phase 1 work; only the layout below was redesigned */
import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import SEO from '@/components/SEO';
import { AUTH_INPUT, GoogleButton, OrDivider } from '@/components/next/AuthLayout';
import { Wordmark } from '@/components/next/Logo';
import Slip from '@/components/next/Slip';

// Public landing page for an NFC tap / QR scan: https://ezbill.live/t/:tagId
// No ProtectedRoute wrapper on purpose — a tapper may not be signed in yet.
// See supabase/functions/resolve-tag for the read side and
// supabase/migrations/20260827122151_nfc_airdrop_tags.sql for the schema.

interface LineItem { name: string; quantity: number; unit_price: number; total_price: number }
interface ExtractedData {
  merchant_name?: string; amount?: number | null; date_time?: string;
  bill_invoice_number?: string; payment_method?: string; line_items?: LineItem[];
}
type ResolveStatus = 'loading' | 'not_found' | 'idle' | 'ready';

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function ClaimTag() {
  const { tagId } = useParams<{ tagId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<ResolveStatus>('loading');
  const [tableLabel, setTableLabel] = useState('');
  const [pendingBillId, setPendingBillId] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [fallbackAmount, setFallbackAmount] = useState<number | null>(null);
  const [merchantName, setMerchantName] = useState('');

  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [serverExtracted, setServerExtracted] = useState<ExtractedData | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState('image/jpeg');
  const [imageFailed, setImageFailed] = useState(false);
  const downloadStarted = useRef(false);

  const [saving, setSaving] = useState(false);
  const [savedExpenseId, setSavedExpenseId] = useState<string | null>(null);
  const claimStarted = useRef(false);

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);

  const { signIn, signUp } = useAuth();

  // 1. Resolve the tag to whatever bill is currently unclaimed for it.
  useEffect(() => {
    if (!tagId) return;
    (async () => {
      setStatus('loading');
      const { data, error } = await supabase.functions.invoke('resolve-tag', { body: { tag_id: tagId } });
      if (error || !data) { setStatus('not_found'); return; }
      if (!data.found) { setStatus('not_found'); return; }
      setTableLabel(data.table_label || '');
      if (data.status === 'idle') { setStatus('idle'); return; }
      setPendingBillId(data.bill.pending_bill_id);
      setSignedUrl(data.bill.signed_url);
      setFallbackAmount(data.bill.amount ?? null);
      setMerchantName(data.bill.merchant_name || '');
      const ex = data.bill.extracted;
      if (ex && typeof ex === 'object' && !Array.isArray(ex)) setServerExtracted(ex as ExtractedData);
      setStatus('ready');
    })();
  }, [tagId]);

  // 2a. Download the photo straight away: the signed URL only lives 5 minutes, and
  // the claim copies the photo into the guest's own receipts.
  useEffect(() => {
    if (status !== 'ready' || !signedUrl || downloadStarted.current) return;
    downloadStarted.current = true;
    (async () => {
      try {
        const res = await fetch(signedUrl);
        const blob = await res.blob();
        setImageType(blob.type || 'image/jpeg');
        setImageBase64(await blobToBase64(blob));
      } catch {
        setImageFailed(true);
      }
    })();
  }, [status, signedUrl]);

  // 2b. Bill details. Normally they were read when staff sent the bill, so they arrive
  // with the tag lookup and show at once. If not, the photo is read here, but only
  // after sign-in (extract-receipt serves signed-in users); until then the page shows
  // the total staff typed in.
  useEffect(() => {
    if (status !== 'ready' || extracted || extracting) return;
    if (serverExtracted) { setExtracted(serverExtracted); return; }
    if (!user) return;
    if (!imageBase64) {
      if (imageFailed) setExtracted({}); // fall back to whatever staff typed in
      return;
    }
    (async () => {
      setExtracting(true);
      try {
        const { data, error } = await supabase.functions.invoke('extract-receipt', {
          body: { file_base64: imageBase64, file_type: imageType },
        });
        if (!error && data && !data.error) setExtracted(data);
        else setExtracted({}); // fall back to whatever staff typed in
      } catch {
        setExtracted({});
      } finally {
        setExtracting(false);
      }
    })();
  }, [status, extracted, extracting, serverExtracted, user, imageBase64, imageType, imageFailed]);

  // 3. Once we're signed in AND extraction has settled, save automatically —
  // that's the whole point: tap, and it's just there.
  useEffect(() => {
    if (claimStarted.current) return;
    if (status !== 'ready' || !user || extracting || !extracted || !pendingBillId) return;
    claimStarted.current = true;
    void claimBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user, extracting, extracted, pendingBillId]);

  const claimBill = async () => {
    if (!user || !pendingBillId) return;
    setSaving(true);
    try {
      const amount = extracted?.amount ?? fallbackAmount ?? 0;
      const merchant = (extracted?.merchant_name && extracted.merchant_name !== 'Not Found')
        ? extracted.merchant_name : (merchantName || tableLabel);
      const lineItems = extracted?.line_items || [];
      const invoiceNumber = extracted?.bill_invoice_number && extracted.bill_invoice_number !== 'Not Found'
        ? extracted.bill_invoice_number : '';
      const paymentMethod = extracted?.payment_method && extracted.payment_method !== 'Not Found'
        ? extracted.payment_method : '';
      const expenseDate = extracted?.date_time && extracted.date_time !== 'Not Found'
        ? extracted.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10);

      const descParts = [`Tapped at ${tableLabel || 'a table'}`, 'Auto-delivered via NFC tag', '[nfc]'];
      if (invoiceNumber) descParts.push(`Invoice: ${invoiceNumber}`);
      if (paymentMethod) descParts.push(`Payment: ${paymentMethod}`);
      let description = descParts.join(' | ');
      if (lineItems.length > 0) description += `::ITEMS::${JSON.stringify(lineItems)}::END_ITEMS::`;

      const { data: expense, error: insErr } = await supabase.from('expenses').insert({
        user_id: user.id,
        title: merchant ? `Bill - ${merchant}` : `Bill - ${tableLabel}`,
        merchant,
        amount,
        currency: 'INR',
        expense_date: expenseDate,
        description,
        status: 'draft',
        cost_center: paymentMethod,
      } as any).select().single();
      if (insErr) throw insErr;
      const expenseId = (expense as any).id;

      if (imageBase64) {
        const binary = atob(imageBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: imageType });
        const ext = imageType.includes('pdf') ? 'pdf' : 'jpg';
        const filePath = `${user.id}/${expenseId}/receipt.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(filePath, blob);
        if (!upErr) {
          await supabase.from('expense_receipts').insert({
            expense_id: expenseId, file_path: filePath, file_name: `receipt.${ext}`,
          } as any);
        }
      }

      await supabase.from('tag_pending_bills' as any).update({
        claimed_by: user.id, claimed_at: new Date().toISOString(), expense_id: expenseId,
      } as any).eq('id', pendingBillId);

      setSavedExpenseId(expenseId);
    } catch (err: any) {
      toast({ title: "Couldn't save your bill", description: err.message || 'Please try again.', variant: 'destructive' });
      claimStarted.current = false;
    } finally {
      setSaving(false);
    }
  };

  const handleGoogle = async () => {
    setAuthSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      });
      if (error) toast({ title: 'Google sign-in failed', description: error.message, variant: 'destructive' });
    } catch {
      toast({ title: 'Google sign-in failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    if (authMode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
    } else {
      const { error } = await signUp(email, password, fullName || 'EZZ BILL user', 'General');
      if (error) toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      else setAwaitingEmailConfirm(true);
    }
    setAuthSubmitting(false);
  };

  // ─────────────────────────── RENDER ───────────────────────────
  // What the guest sees after a tap: their bill, on paper, before anything is asked of them.
  const total = Number(extracted?.amount ?? fallbackAmount ?? 0);
  const lines = (extracted?.line_items || []).filter((i) => i?.name).map((i) => ({
    name: i.name, quantity: Number(i.quantity) || 1, unit_price: Number(i.unit_price) || 0, total_price: Number(i.total_price) || 0,
  }));
  const note = (title: string, body: string) => (
    <div className="ez-rise mx-auto max-w-[340px] py-10 text-center">
      <h1 className="ez-display text-[32px] leading-tight text-fg">{title}</h1>
      <p className="mt-3 text-[15px] text-dim">{body}</p>
    </div>
  );

  return (
    <main className="ez-app flex min-h-screen flex-col items-center px-5 pb-12 pt-6">
      <SEO title="Your bill" description="Your bill, sent to your phone by NFC Airdrop." path={`/t/${tagId}`} />
      <Wordmark />
      <p className="ez-label mt-8">NFC Airdrop{tableLabel && status !== 'not_found' ? ` · ${tableLabel}` : ''}</p>

      <div className="flex w-full max-w-[380px] flex-1 flex-col justify-center">
        {status === 'loading' && <p className="ez-num py-16 text-center text-[13px] text-faint" aria-busy="true">Fetching your bill</p>}

        {status === 'not_found' && note('This tag is not set up.', 'Ask the staff for your bill.')}

        {status === 'idle' && note(`No bill at ${tableLabel || 'this table'} yet.`, 'When the bill is ready, tap again and it will be here.')}

        {status === 'ready' && !savedExpenseId && (
          <>
            <div className="mt-6">
              <Slip print detailed merchant={merchantName || tableLabel || 'Your bill'} sub={merchantName ? tableLabel : null} items={lines} total={total}
                foot={extracting ? 'Reading the lines' : signedUrl ? <a href={signedUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">See the printed bill</a> : null} />
            </div>

            <div className="mt-9">
              {user ? (
                <p className="ez-num text-center text-[13px] text-dim" aria-busy="true">Saving to your EZZ BILL</p>
              ) : awaitingEmailConfirm ? (
                <p className="text-center text-[14.5px] text-dim">Confirm your account from the email you were just sent, then open this link again. Your bill will be waiting.</p>
              ) : (
                <>
                  <p className="mb-4 text-center text-[15px] text-fg">Keep this bill. Sign in to save it.</p>
                  <GoogleButton onClick={handleGoogle} busy={authSubmitting} />
                  <OrDivider />
                  <form onSubmit={handleAuthSubmit} className="space-y-3">
                    {authMode === 'signup' && <input aria-label="Your name" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={AUTH_INPUT} autoComplete="name" required />}
                    <input aria-label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={AUTH_INPUT} autoComplete="email" required />
                    <input aria-label="Password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={AUTH_INPUT} minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} required />
                    <button type="submit" disabled={authSubmitting} className="ez-btn ez-btn--primary h-12 w-full disabled:opacity-50">
                      {authSubmitting ? 'One moment' : authMode === 'signin' ? 'Sign in and save' : 'Create account and save'}
                    </button>
                  </form>
                  <button type="button" className="mt-4 w-full text-center text-[14px] font-medium text-dim underline decoration-line underline-offset-4 hover:text-fg"
                    onClick={() => setAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))}>
                    {authMode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {savedExpenseId && (
          <div className="ez-rise py-10 text-center">
            <p className="ez-label">Bill received</p>
            <h1 className="ez-display mt-4 text-[36px] leading-tight text-fg">Saved to your EZZ BILL.</h1>
            <p className="mt-3 text-[15px] text-dim">{merchantName || tableLabel}{total > 0 && <> · <span className="ez-num text-fg">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></>}</p>
            <Link to={`/expenses/${savedExpenseId}`} className="ez-btn ez-btn--primary mt-8">Open your bill</Link>
          </div>
        )}
      </div>
    </main>
  );
}
