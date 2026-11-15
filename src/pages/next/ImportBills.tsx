/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-empty, react-hooks/exhaustive-deps -- the Gmail and SMS import logic is carried over unchanged (it moves to the server in the backend work); only the layout below was redesigned */
import SEO from '@/components/SEO';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isNativeApp, isAndroid, scanUpiSmsFromDevice } from '@/lib/sms-reader';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from '@/lib/smart-category';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { ExpenseCategory } from '@/lib/types';
import { runBillImport, SyncLockedError, GmailDisconnectedError, type BillImportPhase } from '@/lib/auto-bill-import';
import { SyncProgressSteps } from '@/components/email-bills/SyncProgressSteps';
import { SyncHistoryPanel } from '@/components/email-bills/SyncHistoryPanel';
import { INPUT, ScreenHeader, Tag } from '@/components/next/Sheet';
import { cn } from '@/lib/utils';

interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface EmailBill {
  message_id: string;
  subject: string;
  from: string;
  date: string;
  attachments: EmailAttachment[];
  already_imported?: boolean;
}

interface UpiTransaction {
  merchant_name: string;
  amount: number;
  date: string;
  upi_id?: string;
  transaction_id?: string;
  bank_name?: string;
  payment_status: 'success' | 'failed' | 'pending';
  description: string;
}


const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 15 days', value: 15 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 180 days', value: 180 },
  { label: 'Last 1 year', value: 365 },
];

const CATEGORY_ALIASES: Record<string, string[]> = {
  'food & dining': ['food & dining', 'meals', 'food', 'dining'],
  'petrol & fuel': ['petrol & fuel', 'fuel', 'petrol'],
  'grocery': ['grocery'],
  'shopping': ['shopping'],
  'transportation': ['transportation', 'transport'],
  'travel': ['travel'],
  'accommodation': ['accommodation', 'hotel'],
  'utilities': ['utilities'],
  'software': ['software'],
  'medical': ['medical', 'health'],
  'toll': ['toll'],
  'parking': ['parking'],
  'entertainment': ['entertainment'],
  'education': ['education', 'training'],
  'subscription': ['subscription'],
  'office supplies': ['office supplies'],
  'other': ['other'],
};

const DEFAULT_BILL_CURRENCY = 'INR';

// Rough heuristics for estimating AI/cloud usage before a scan runs.
// Tuned to be slightly conservative so users aren't surprised by a higher bill.
// Per day we assume ~2 bill emails (each → 2 AI calls: attachment fetch + extract-receipt),
// plus one subscription-scan batch every ~30 days and ~0.3 warranty emails/day
// (each → 1 extract-warranty call).
function estimateScanCost(days: number) {
  const billEmails = Math.round(days * 2);
  const billAiCalls = billEmails; // extract-receipt per attachment
  const subAiCalls = Math.max(1, Math.ceil(days / 30)); // batched subscription scan
  const warrantyEmails = Math.max(1, Math.round(days * 0.3));
  const warrantyAiCalls = warrantyEmails;

  const totalAiCalls = billAiCalls + subAiCalls + warrantyAiCalls;
  // AI (Gemini Flash) ≈ $0.0003 per call avg (vision + text mix).
  const aiCreditsUsd = totalAiCalls * 0.0003;
  // Cloud (edge function + DB) ≈ $0.00005 per email processed.
  const cloudCreditsUsd = (billEmails + warrantyEmails + subAiCalls * 20) * 0.00005;
  const totalUsd = aiCreditsUsd + cloudCreditsUsd;

  return {
    emails: billEmails + warrantyEmails,
    aiCalls: totalAiCalls,
    aiCreditsUsd,
    cloudCreditsUsd,
    totalUsd,
    // Show a ±40% range so users get a band, not a false-precise number.
    rangeLowUsd: totalUsd * 0.6,
    rangeHighUsd: totalUsd * 1.4,
  };
}

function formatUsd(v: number): string {
  if (v < 0.01) return `<$0.01`;
  if (v < 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(2)}`;
}

function findCategoryByName(name: string, categories: ExpenseCategory[]): { id: string; label: string } | null {
  if (!name || name === 'Not Found') return null;
  const lower = name.toLowerCase();
  const direct = categories.find(c => c.name.toLowerCase() === lower);
  if (direct) return { id: direct.id, label: direct.name };
  const aliases = CATEGORY_ALIASES[lower] || [lower];
  for (const alias of aliases) {
    const match = categories.find(c => c.name.toLowerCase() === alias);
    if (match) return { id: match.id, label: match.name };
  }
  return null;
}

function smartCategoryMatch(merchantName: string, emailSubject: string, categories: ExpenseCategory[]): { id: string | null; label: string } {
  const catName = smartCategoryFromMerchant(merchantName, emailSubject);
  if (catName === 'Other') return { id: null, label: 'Other' };
  const found = findCategoryByName(catName, categories);
  return found ? { id: found.id, label: found.label } : { id: null, label: catName };
}

export default function EmailBills() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const initialTab = searchParams.get('tab') === 'upi' ? 'upi' : 'gmail';

  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [dateRange, setDateRange] = useState(30);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ezbill:scan:maxBudgetUsd') : null;
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 0.50;
  });
  useEffect(() => {
    try { localStorage.setItem('ezbill:scan:maxBudgetUsd', String(maxBudgetUsd)); } catch {}
  }, [maxBudgetUsd]);

  const [importProgress, setImportProgress] = useState({ phase: '', current: 0, total: 0 });
  const [importResult, setImportResult] = useState<{ saved: number; skipped: number; duplicates: number; total: number; subscriptions?: number; warranties?: number } | null>(null);

  const [smsText, setSmsText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [upiTransactions, setUpiTransactions] = useState<UpiTransaction[]>([]);
  const [savingUpiIdx, setSavingUpiIdx] = useState<number | null>(null);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [showNativeScan] = useState(() => isNativeApp() && isAndroid());
  const isNative = isNativeApp();

  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{
    phase: BillImportPhase | 'idle';
    current: number;
    total: number;
    message: string;
  }>({ phase: 'idle', current: 0, total: 0, message: '' });

  const runImportWithProgress = async (days: number) => {
    if (!user) return;
    setIsSyncingNow(true);
    setImportResult(null);
    setSyncProgress({ phase: 'fetching', current: 0, total: 0, message: `Starting scan (last ${days} day${days === 1 ? '' : 's'})…` });
    toast({
      title: 'Scanning Gmail…',
      description: `Fetching bills, subscriptions, and warranties from the last ${days} day${days === 1 ? '' : 's'}.`,
    });
    try {
      const result = await runBillImport({
        userId: user.id,
        days,
        categories,
        kind: 'sync_now',
        onProgress: (p) => setSyncProgress({ phase: p.phase, current: p.current, total: p.total, message: p.message || '' }),
      });

      // Also scan subscriptions and warranties in the same manual run.
      let subscriptions = 0;
      let warranties = 0;
      try {
        setSyncProgress({ phase: 'parsing', current: 0, total: 0, message: 'Scanning subscriptions…' });
        const { data: subData } = await supabase.functions.invoke('gmail-subscription-scan', {
          body: { days, max_results: 50 },
        });
        if (subData?.gmail_disconnected) throw new GmailDisconnectedError();
        subscriptions = subData?.saved_count ?? subData?.saved?.length ?? 0;
      } catch (e) {
        if (e instanceof GmailDisconnectedError) throw e;
        console.warn('subscription scan failed', e);
      }
      try {
        setSyncProgress({ phase: 'parsing', current: 0, total: 0, message: 'Scanning warranties…' });
        const { data: warData } = await supabase.functions.invoke('gmail-warranty-scan', {
          body: { days, max_results: 30 },
        });
        if (warData?.gmail_disconnected) throw new GmailDisconnectedError();
        warranties = warData?.saved_count ?? warData?.saved?.length ?? 0;
      } catch (e) {
        if (e instanceof GmailDisconnectedError) throw e;
        console.warn('warranty scan failed', e);
      }

      setImportResult({
        saved: result.saved,
        skipped: result.skipped,
        duplicates: result.duplicates,
        total: result.total,
        subscriptions,
        warranties,
      });
      setSyncProgress({ phase: 'done', current: 1, total: 1, message: 'Scan complete.' });
      toast({
        title: 'Scan complete',
        description: `${result.saved} bill${result.saved === 1 ? '' : 's'} · ${subscriptions} subscription${subscriptions === 1 ? '' : 's'} · ${warranties} warrant${warranties === 1 ? 'y' : 'ies'} imported.`,
      });
    } catch (err: any) {
      if (err instanceof SyncLockedError) {
        toast({
          title: 'Sync already running',
          description: 'A scan is currently in progress. Please wait for it to finish.',
        });
      } else if (err instanceof GmailDisconnectedError) {
        setIsConnected(false);
        setConnectedEmail('');
        toast({
          title: 'Gmail reconnection required',
          description: 'Your Gmail access has expired. Please reconnect to resume scanning.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
      }
      setSyncProgress({ phase: 'idle', current: 0, total: 0, message: '' });
    } finally {
      setIsSyncingNow(false);
      setHistoryRefreshKey(k => k + 1);
      setTimeout(() => setSyncProgress({ phase: 'idle', current: 0, total: 0, message: '' }), 2000);
    }
  };

  useEffect(() => {
    checkConnection();
    supabase.from('expense_categories').select('*').then(({ data }) => {
      setCategories((data as unknown as ExpenseCategory[]) || []);
    });
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'status' },
      });
      if (!error && data?.connected) {
        setIsConnected(true);
        setConnectedEmail(data.email);
      }
    } catch {
    } finally {
      setIsChecking(false);
    }
  };

  const connectGmail = async () => {
    try {
      const redirectUri = `${window.location.origin}/email-bills`;
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'get_auth_url', redirect_uri: redirectUri },
      });
      if (error || !data?.auth_url) {
        toast({ title: 'Error', description: data?.error || 'Failed to get auth URL', variant: 'destructive' });
        return;
      }
      window.location.href = data.auth_url;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !isConnected) {
      const exchangeCode = async () => {
        const redirectUri = `${window.location.origin}/email-bills`;
        const { data, error } = await supabase.functions.invoke('gmail-auth', {
          body: { action: 'exchange_code', code, redirect_uri: redirectUri },
        });
        if (error || !data?.success) {
          toast({ title: 'Connection failed', description: data?.error || 'Could not connect Gmail', variant: 'destructive' });
        } else {
          setIsConnected(true);
          setConnectedEmail(data.email);
          toast({ title: 'Gmail connected', description: `Connected as ${data.email}` });
        }
        window.history.replaceState({}, '', '/email-bills');
      };
      exchangeCode();
    }
  }, []);

  const disconnectGmail = async () => {
    const { error } = await supabase.functions.invoke('gmail-auth', {
      body: { action: 'disconnect' },
    });
    if (!error) {
      setIsConnected(false);
      setConnectedEmail('');
      setImportResult(null);
      toast({ title: 'Disconnected', description: 'Gmail has been disconnected.' });
    }
  };

  const autoImportBills = async () => {
    if (!user) return;
    setIsScanning(true);
    setImportResult(null);

    try {
      setImportProgress({ phase: 'Scanning inbox...', current: 0, total: 0 });
      const { data: scanData, error: scanError } = await supabase.functions.invoke('gmail-scan', {
        body: { max_results: 50, days: dateRange },
      });
      if (scanError) throw new Error('Failed to scan emails');
      if (scanData?.error) throw new Error(scanData.error);

      const emails: EmailBill[] = scanData?.emails || [];
      if (emails.length === 0) {
        toast({ title: 'No bills found', description: 'No bill emails found in the selected date range.' });
        setIsScanning(false);
        return;
      }

      let saved = 0;
      let skipped = 0;
      let duplicates = 0;
      let totalAttachments = 0;
      for (const e of emails) totalAttachments += e.attachments.length;

      setImportProgress({ phase: 'Extracting & importing bills...', current: 0, total: totalAttachments });
      let processed = 0;

      // Pre-load existing expenses for duplicate detection (last 180 days, lightweight)
      const sinceISO = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: existingExpenses } = await supabase
        .from('expenses')
        .select('merchant, amount, expense_date, content_hash')
        .eq('user_id', user.id)
        .gte('expense_date', sinceISO);

      const existingHashes = new Set((existingExpenses || []).map((e: any) => e.content_hash).filter(Boolean));
      const existingTriples = new Set(
        (existingExpenses || []).map((e: any) =>
          `${(e.merchant || '').toLowerCase().trim()}|${Number(e.amount).toFixed(2)}|${e.expense_date}`
        )
      );

      // Pre-load already-processed message ids to skip wholesale
      const { data: processedRows } = await supabase
        .from('processed_emails')
        .select('gmail_message_id')
        .eq('user_id', user.id)
        .in('gmail_message_id', emails.map(e => e.message_id));
      const processedMsgs = new Set((processedRows || []).map((r: any) => r.gmail_message_id));

      const sha256 = async (s: string) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      for (const email of emails) {
        if (processedMsgs.has(email.message_id)) {
          duplicates += email.attachments.length;
          processed += email.attachments.length;
          setImportProgress({ phase: 'Extracting & importing bills...', current: processed, total: totalAttachments });
          continue;
        }
        for (const att of email.attachments) {
          processed++;
          setImportProgress({ phase: 'Extracting & importing bills...', current: processed, total: totalAttachments });

          try {
            const { data: attData, error: attError } = await supabase.functions.invoke('gmail-attachment', {
              body: { message_id: email.message_id, attachment_id: att.id },
            });
            if (attError || attData?.error) { skipped++; continue; }

            const { data: ext, error: extError } = await supabase.functions.invoke('extract-receipt', {
              body: { file_base64: attData.data, file_type: att.mimeType },
            });
            if (extError || ext?.error) { skipped++; continue; }

            const amount = ext.amount;
            if (amount == null || amount === 0) { skipped++; continue; }

            const val = (v: any) => v && v !== 'Not Found' ? v : '';

            const matchAiCategory = (name?: string) => {
              if (!name || name === 'Not Found') return null;
              return findCategoryByName(name, categories);
            };
            const aiResult = matchAiCategory(ext.category);
            const smartResult = smartCategoryMatch(ext.merchant_name || '', email.subject, categories);
            const categoryId = aiResult?.id || smartResult.id || null;
            const categoryLabel = aiResult?.label || smartResult.label || 'Other';

            const merchantName = val(ext.merchant_name);
            const invoiceNumber = val(ext.bill_invoice_number);
            const paymentMethod = val(ext.payment_method);
            const lineItems: Array<{ name: string; quantity: number; unit_price: number; total_price: number }> = ext.line_items || [];

            const title = invoiceNumber
              ? `Invoice ${invoiceNumber}`
              : merchantName ? `Expense at ${merchantName}` : email.subject || 'Email Bill';

            const expenseDate = ext.date_time && ext.date_time !== 'Not Found'
              ? ext.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10);

            // Duplicate check: invoice# OR (merchant + amount + date)
            const triple = `${merchantName.toLowerCase().trim()}|${Number(amount).toFixed(2)}|${expenseDate}`;
            const hashSeed = `${merchantName.toLowerCase().trim()}|${Number(amount).toFixed(2)}|${expenseDate}|${invoiceNumber}`;
            const contentHash = await sha256(hashSeed);
            if (existingHashes.has(contentHash) || existingTriples.has(triple)) {
              duplicates++;
              continue;
            }
            existingHashes.add(contentHash);
            existingTriples.add(triple);

            const isSubscription = isSubscriptionMerchant(`${merchantName} ${email.subject}`);

            const LINE_ITEMS_MARKER = '::ITEMS::';
            const descParts: string[] = [];
            if (categoryLabel && categoryLabel !== 'Other') descParts.push(`Category: ${categoryLabel}`);
            if (invoiceNumber) descParts.push(`Invoice: ${invoiceNumber}`);
            if (paymentMethod) descParts.push(`Payment: ${paymentMethod}`);
            if (lineItems.length > 0) descParts.push(`${lineItems.length} item(s)`);
            if (ext.subtotal != null && ext.subtotal > 0) descParts.push(`Subtotal: ${ext.subtotal}`);
            if (ext.tax_amount != null && ext.tax_amount > 0) descParts.push(`Tax: ${ext.tax_amount}`);
            if (val(ext.tax_details)) descParts.push(`TaxDetails: ${ext.tax_details}`);
            if (ext.discount != null && ext.discount > 0) descParts.push(`Discount: ${ext.discount}`);
            descParts.push(`From email: ${email.subject}`);
            if (isSubscription) descParts.push('[Subscription]');
            let description = descParts.join(' | ');
            if (lineItems.length > 0) {
              description += `${LINE_ITEMS_MARKER}${JSON.stringify(lineItems)}::END_ITEMS::`;
            }

            const currency = DEFAULT_BILL_CURRENCY;

            const { data: expense, error } = await supabase.from('expenses').insert({
              user_id: user.id,
              title,
              merchant: merchantName,
              amount,
              currency,
              expense_date: expenseDate,
              category_id: categoryId,
              description,
              status: 'draft',
              cost_center: isSubscription ? 'Subscription' : paymentMethod,
              content_hash: contentHash,
            } as any).select().single();

            if (error) { skipped++; continue; }
            const expenseId = (expense as any)?.id;

            try {
              const binaryStr = atob(attData.data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const fileBlob = new Blob([bytes], { type: att.mimeType });
              const filePath = `${user.id}/${expenseId}/${att.filename}`;
              const { error: uploadErr } = await supabase.storage.from('receipts').upload(filePath, fileBlob);
              if (!uploadErr) {
                await supabase.from('expense_receipts').insert({
                  expense_id: expenseId,
                  file_path: filePath,
                  file_name: att.filename,
                } as any);
              }
            } catch (uploadErr) {
              console.error('Receipt upload failed:', uploadErr);
            }

            await supabase.from('processed_emails').insert({
              user_id: user.id,
              gmail_message_id: email.message_id,
              subject: title,
              sender: merchantName || email.from,
              expense_id: expenseId,
            } as any);

            saved++;
          } catch {
            skipped++;
          }
        }
      }

      setImportResult({ saved, skipped, duplicates, total: totalAttachments });
      toast({
        title: 'Import complete',
        description: `Imported ${saved} bill(s). ${duplicates > 0 ? `${duplicates} duplicate(s) blocked. ` : ''}${skipped > 0 ? `${skipped} skipped (no amount or extraction failed).` : ''}`,
      });

      if (saved > 0) {
        navigate('/expenses?checkDupes=1');
      }
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsScanning(false);
      setImportProgress({ phase: '', current: 0, total: 0 });
    }
  };

  const parseUpiSms = async () => {
    if (!smsText.trim()) {
      toast({ title: 'Empty input', description: 'Please paste your UPI SMS message(s).', variant: 'destructive' });
      return;
    }
    setIsParsing(true);
    setUpiTransactions([]);
    try {
      const { data, error } = await supabase.functions.invoke('parse-upi-sms', {
        body: { sms_text: smsText.trim() },
      });
      if (error) throw new Error('Failed to parse SMS');
      if (data?.error) throw new Error(data.error);

      const txns = data?.transactions || [];
      setUpiTransactions(txns);
      if (txns.length === 0) {
        toast({ title: 'No transactions found', description: 'Could not find any UPI transactions in the text.' });
      } else {
        toast({ title: 'Parsed successfully', description: `Found ${txns.length} transaction(s).` });
      }
    } catch (err: any) {
      toast({ title: 'Parsing failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsParsing(false);
    }
  };

  const saveUpiAsExpense = async (txn: UpiTransaction, idx: number) => {
    if (!user) return;
    setSavingUpiIdx(idx);
    try {
      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        title: `UPI Payment - ${txn.merchant_name}`,
        merchant: txn.merchant_name,
        amount: txn.amount,
        currency: DEFAULT_BILL_CURRENCY,
        expense_date: txn.date,
        description: `${txn.description}${txn.upi_id ? `\nUPI ID: ${txn.upi_id}` : ''}${txn.transaction_id ? `\nTxn ID: ${txn.transaction_id}` : ''}${txn.bank_name ? `\nBank: ${txn.bank_name}` : ''}`,
        status: 'draft',
      } as any);
      if (error) throw error;

      setUpiTransactions(prev => prev.filter((_, i) => i !== idx));
      toast({ title: 'Saved', description: `₹${txn.amount} payment to ${txn.merchant_name} saved as draft.` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSavingUpiIdx(null);
    }
  };

  if (isChecking) return <div className="mt-8 h-72 max-w-[760px] rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" />;

  const working = isSyncingNow || isScanning;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const readPhoneSms = async () => {
    setIsAutoScanning(true);
    setUpiTransactions([]);
    const result = await scanUpiSmsFromDevice();
    if (result.error) toast({ title: 'The messages were not read', description: result.error, variant: 'destructive' });
    else if (result.transactions.length === 0) toast({ title: 'No payments found', description: `${result.smsCount} payment messages were checked.` });
    else { setUpiTransactions(result.transactions); toast({ title: `${plural(result.transactions.length, 'payment', 'payments')} found`, description: `In ${result.smsCount} messages.` }); }
    setIsAutoScanning(false);
  };

  const gmail = (
    <section key="gmail" className="mt-9">
      <h2 className="flex items-center gap-2.5"><span className="ez-label !text-dim">Gmail</span><Tag>Invite-only beta</Tag></h2>
      <div className="ez-card mt-3 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {isConnected ? <p className="flex flex-wrap items-center gap-2.5 text-[15.5px] text-fg"><span className="min-w-0 break-all">{connectedEmail}</span><Tag>Connected</Tag></p>
              : <div className="max-w-[460px] space-y-2 text-[14.5px] text-dim">
                  <p>Connect Gmail and EZZ BILL finds the bills, subscriptions and warranties in it. It only reads your mail: it never sends, changes or deletes anything.</p>
                  <p className="text-[13.5px] text-faint">Until Google has reviewed EZZ BILL, only invited accounts can connect. Not invited? Scan or upload your bills instead.</p>
                </div>}
          </div>
          {isConnected ? <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm" onClick={disconnectGmail} disabled={working}>Disconnect</button>
            : <button type="button" className="ez-btn ez-btn--primary" onClick={connectGmail}>Connect Gmail</button>}
        </div>

        {isConnected && (
          <div className="mt-5 flex flex-wrap items-end gap-2.5 border-t border-line-soft pt-4">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="im-range" className="mb-1.5 block text-[13px] font-medium text-dim">Look back over</label>
              <select id="im-range" className={INPUT} value={dateRange} disabled={working} onChange={(e) => setDateRange(Number(e.target.value))}>
                {DATE_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button type="button" className="ez-btn ez-btn--primary disabled:opacity-50" disabled={working} onClick={() => runImportWithProgress(dateRange)}>{working ? 'Importing' : 'Find and import'}</button>
          </div>
        )}

        {(isSyncingNow || syncProgress.phase !== 'idle') && (
          <div className="mt-5"><SyncProgressSteps phase={syncProgress.phase} current={syncProgress.current} total={syncProgress.total} message={syncProgress.message} /></div>
        )}
        {isScanning && importProgress.total > 0 && (
          <div className="mt-5" role="status">
            <div className="flex justify-between text-[13px] text-dim"><span>{importProgress.phase}</span><span className="ez-num">{importProgress.current}/{importProgress.total}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} /></div>
          </div>
        )}
        {working && <p className="mt-4 text-[13px] text-faint">The import runs in this tab. Keep it open until it finishes.</p>}

        {importResult && !isScanning && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4" role="status">
            <p className="text-[15px] text-fg">
              Imported {plural(importResult.saved, 'bill', 'bills')}, {plural(importResult.subscriptions ?? 0, 'subscription', 'subscriptions')} and {plural(importResult.warranties ?? 0, 'warranty', 'warranties')}.
              {importResult.duplicates > 0 && <span className="text-dim"> {plural(importResult.duplicates, 'was', 'were')} already here and left alone.</span>}
            </p>
            <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm" onClick={() => navigate('/expenses')}>See your bills</button>
          </div>
        )}
      </div>
      {isConnected && <div className="mt-4"><SyncHistoryPanel refreshKey={historyRefreshKey} /></div>}
    </section>
  );

  const sms = (
    <section key="sms" className="mt-9">
      <h2 className="ez-label !text-dim">Payment SMS</h2>
      <div className="ez-card mt-3 p-4 lg:p-5">
        {showNativeScan && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
            <p className="max-w-[420px] text-[14.5px] text-dim">Read the UPI and card messages on this phone and turn each payment into a bill.</p>
            <button type="button" className="ez-btn ez-btn--primary disabled:opacity-50" disabled={isAutoScanning} onClick={readPhoneSms}>{isAutoScanning ? 'Reading' : 'Read from this phone'}</button>
          </div>
        )}
        <label htmlFor="im-sms" className="mb-1.5 block text-[13px] font-medium text-dim">{showNativeScan ? 'Or paste a message' : 'Paste a payment message from your bank or UPI app'}</label>
        <textarea id="im-sms" rows={4} className={cn(INPUT, 'h-auto py-3 leading-relaxed')} value={smsText} onChange={(e) => setSmsText(e.target.value)} placeholder="Rs.412.00 debited from A/c XX7730 to BLUE TOKAI on 19-10-26. UPI Ref 629312345678" />
        <div className="mt-3 flex justify-end"><button type="button" className="ez-btn ez-btn--ghost disabled:opacity-50" disabled={isParsing || !smsText.trim()} onClick={parseUpiSms}>{isParsing ? 'Reading' : 'Read the message'}</button></div>
      </div>

      {upiTransactions.length > 0 && (
        <ul className="ez-card mt-4 divide-y divide-line-soft overflow-hidden">
          {upiTransactions.map((txn, idx) => (
            <li key={idx} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 lg:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold leading-snug text-fg">{txn.merchant_name}</p>
                <p className="truncate text-[13.5px] text-dim">{[txn.date, txn.bank_name, txn.transaction_id && `Ref ${txn.transaction_id}`].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="ez-num shrink-0 text-[15px] text-fg">₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              {txn.payment_status === 'success'
                ? <button type="button" className="ez-btn ez-btn--primary ez-btn--sm disabled:opacity-50" disabled={savingUpiIdx === idx} onClick={() => saveUpiAsExpense(txn, idx)}>{savingUpiIdx === idx ? 'Saving' : 'Save as a bill'}</button>
                : <Tag>{txn.payment_status === 'failed' ? 'Payment failed' : 'Pending'}</Tag>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <SEO title="Import bills" description="Bring in the bills already sitting in your Gmail and your payment messages." path="/email-bills" />
      <div className="max-w-[760px] pb-10">
        <ScreenHeader title="Import" summary="Bring in the bills already sitting in your inbox and your payment messages." />
        {initialTab === 'upi' ? [sms, gmail] : [gmail, sms]}
      </div>
    </>
  );
}
