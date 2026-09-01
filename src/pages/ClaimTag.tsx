import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Receipt, CheckCircle2, Store, Wifi } from 'lucide-react';
import SEO from '@/components/SEO';

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
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState('image/jpeg');

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
      setStatus('ready');
    })();
  }, [tagId]);

  // 2. Once we have a photo, read it and extract structured details — this
  // runs regardless of sign-in state, so the preview appears instantly.
  useEffect(() => {
    if (status !== 'ready' || !signedUrl || extracted || extracting) return;
    (async () => {
      setExtracting(true);
      try {
        const res = await fetch(signedUrl);
        const blob = await res.blob();
        const type = blob.type || 'image/jpeg';
        const base64 = await blobToBase64(blob);
        setImageBase64(base64);
        setImageType(type);
        const { data, error } = await supabase.functions.invoke('extract-receipt', {
          body: { file_base64: base64, file_type: type },
        });
        if (!error && data && !data.error) setExtracted(data);
        else setExtracted({}); // fall back to whatever staff typed in
      } catch {
        setExtracted({});
      } finally {
        setExtracting(false);
      }
    })();
  }, [status, signedUrl, extracted, extracting]);

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
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.href });
      if (result.error) toast({ title: 'Google sign-in failed', description: String(result.error), variant: 'destructive' });
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
      const { error } = await signUp(email, password, fullName || 'EZ Bill user', 'General');
      if (error) toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      else setAwaitingEmailConfirm(true);
    }
    setAuthSubmitting(false);
  };

  // ─────────────────────────── RENDER ───────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <SEO title="Your bill" description="Tap-to-receive receipt from EZ Bill." path={`/t/${tagId}`} />
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Wifi className="h-4 w-4" /> EZ Bill NFC Airdrop
        </div>

        {status === 'loading' && (
          <Card className="border-0 glass-card rounded-2xl">
            <CardContent className="py-14 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Reading this table's tag…</p>
            </CardContent>
          </Card>
        )}

        {status === 'not_found' && (
          <Card className="border-0 glass-card rounded-2xl">
            <CardContent className="py-14 flex flex-col items-center gap-2 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium text-foreground">This tag isn't recognized</p>
              <p className="text-xs text-muted-foreground">Ask your server for help.</p>
            </CardContent>
          </Card>
        )}

        {status === 'idle' && (
          <Card className="border-0 glass-card rounded-2xl">
            <CardContent className="py-14 flex flex-col items-center gap-2 text-center">
              <Store className="h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium text-foreground">No bill open at {tableLabel || 'this table'} yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">Once your bill closes out, tap again — the receipt will be right here.</p>
            </CardContent>
          </Card>
        )}

        {status === 'ready' && !savedExpenseId && (
          <Card className="border-0 glass-card rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{merchantName || tableLabel}</CardTitle>
              <CardDescription>{tableLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {signedUrl && (
                <img src={signedUrl} alt="Your receipt" className="w-full max-h-56 object-contain rounded-lg bg-muted/30" />
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                {extracting && fallbackAmount == null ? (
                  // No staff-entered amount to show yet — this only happens for
                  // bills sent before the staff page required a total.
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading bill…
                  </span>
                ) : (
                  // Show the real number immediately (staff enters it up front now),
                  // with a small spinner alongside while OCR confirms/refines it —
                  // instead of making the customer wait behind a spinner for a total
                  // staff already knew.
                  <span className="text-lg font-bold text-gold flex items-center gap-1.5">
                    ₹{Number(extracted?.amount ?? fallbackAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {extracting && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </span>
                )}
              </div>

              {user ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving to your EZ Bill…
                </div>
              ) : awaitingEmailConfirm ? (
                <p className="text-xs text-center text-muted-foreground">
                  Check your email to confirm your account, then reopen this exact link — your receipt will be waiting.
                </p>
              ) : (
                <div className="space-y-3 pt-1 border-t border-border/30">
                  <p className="text-xs text-muted-foreground text-center pt-3">Sign in to save this to your EZ Bill</p>
                  <Button type="button" variant="outline" className="w-full min-h-[44px]" onClick={handleGoogle} disabled={authSubmitting}>
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </Button>
                  <form onSubmit={handleAuthSubmit} className="space-y-2">
                    {authMode === 'signup' && (
                      <Input placeholder="Full name" value={fullName} onChange={e => setFullName(e.target.value)}
                        className="min-h-[40px] bg-secondary/30 border-border/30 text-sm" required />
                    )}
                    <Input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)}
                      className="min-h-[40px] bg-secondary/30 border-border/30 text-sm" required />
                    <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                      className="min-h-[40px] bg-secondary/30 border-border/30 text-sm" minLength={6} required />
                    <Button type="submit" className="w-full min-h-[40px] text-sm" disabled={authSubmitting}>
                      {authSubmitting ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account & save'}
                    </Button>
                  </form>
                  <button type="button" className="text-xs text-gold hover:underline w-full text-center"
                    onClick={() => setAuthMode(m => m === 'signin' ? 'signup' : 'signin')}>
                    {authMode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {savedExpenseId && (
          <Card className="border-0 glass-card rounded-2xl">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-base font-semibold text-foreground">Saved to your EZ Bill</p>
              <p className="text-xs text-muted-foreground">{merchantName || tableLabel}</p>
              <Button asChild className="mt-2 min-h-[44px] w-full max-w-[220px]">
                <Link to={`/expenses/${savedExpenseId}`}>View your bill</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
