import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isNativeApp, isAndroid, scanUpiSmsFromDevice } from '@/lib/sms-reader';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from '@/lib/smart-category';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Mail, Link2, Unlink, Loader2, Download,
  CheckCircle2, AlertCircle, ScanLine,
  Smartphone, Send, IndianRupee, Clock, CreditCard, Filter,
  Trash2, RefreshCw,
} from 'lucide-react';
import type { ExpenseCategory } from '@/lib/types';
import { AutoSync } from '@/lib/auto-bill-import';
import { runBillImport, SyncLockedError, type BillImportPhase } from '@/lib/auto-bill-import';
import { SyncProgressSteps } from '@/components/email-bills/SyncProgressSteps';
import { SyncHistoryPanel } from '@/components/email-bills/SyncHistoryPanel';

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

  const [importProgress, setImportProgress] = useState({ phase: '', current: 0, total: 0 });
  const [importResult, setImportResult] = useState<{ saved: number; skipped: number; duplicates: number; total: number } | null>(null);

  const [smsText, setSmsText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [upiTransactions, setUpiTransactions] = useState<UpiTransaction[]>([]);
  const [savingUpiIdx, setSavingUpiIdx] = useState<number | null>(null);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [showNativeScan] = useState(() => isNativeApp() && isAndroid());
  const isNative = isNativeApp();

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncLastSync, setAutoSyncLastSync] = useState<string | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{
    phase: BillImportPhase | 'idle';
    current: number;
    total: number;
    message: string;
  }>({ phase: 'idle', current: 0, total: 0, message: '' });

  useEffect(() => {
    if (!user) return;
    setAutoSyncEnabled(AutoSync.isEnabled(user.id));
    setAutoSyncLastSync(AutoSync.getLastSync(user.id));
  }, [user]);

  const handleToggleAutoSync = (checked: boolean) => {
    if (!user) return;
    AutoSync.setEnabled(user.id, checked);
    setAutoSyncEnabled(checked);
    setAutoSyncLastSync(AutoSync.getLastSync(user.id));
    toast({
      title: checked ? 'Auto-sync enabled' : 'Auto-sync disabled',
      description: checked
        ? 'Bills will sync automatically once a day when you open the app.'
        : 'You can still import bills manually anytime.',
    });
  };

  const syncNow = async () => {
    if (!user) return;
    await runImportWithProgress(AutoSync.computeSyncDays(user.id), { updateLastSync: true });
  };

  const importLast30 = async () => {
    if (!user) return;
    await runImportWithProgress(30, { updateLastSync: false });
  };

  const runImportWithProgress = async (days: number, opts: { updateLastSync: boolean }) => {
    if (!user) return;
    setIsSyncingNow(true);
    setSyncProgress({ phase: 'fetching', current: 0, total: 0, message: `Starting import (last ${days} day${days === 1 ? '' : 's'})…` });
    toast({
      title: opts.updateLastSync ? 'Syncing bills…' : 'Importing bills…',
      description: `Fetching from the last ${days} day${days === 1 ? '' : 's'}.`,
    });
    try {
      const result = await runBillImport({
        userId: user.id,
        days,
        categories,
        onProgress: (p) => setSyncProgress({ phase: p.phase, current: p.current, total: p.total, message: p.message || '' }),
      });
      if (opts.updateLastSync) {
        AutoSync.setLastRunToday(user.id);
        AutoSync.setLastSync(user.id, new Date().toISOString().slice(0, 10));
        setAutoSyncLastSync(AutoSync.getLastSync(user.id));
      }
      setImportResult({ saved: result.saved, skipped: result.skipped, duplicates: result.duplicates, total: result.total });
      toast({
        title: 'Import complete',
        description: result.saved > 0
          ? `Imported ${result.saved} new bill(s).${result.duplicates ? ` ${result.duplicates} duplicate(s) skipped.` : ''}`
          : (result.scanned === 0 ? 'No new bills found.' : 'Everything is up to date.'),
      });
    } catch (err: any) {
      if (err instanceof SyncLockedError) {
        toast({
          title: 'Sync already running',
          description: 'A bill sync is currently in progress. Please wait for it to finish.',
        });
      } else {
        toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
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

  if (isChecking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-24">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Import Bills</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import bills from Gmail{isNative ? ' or UPI payment SMS messages' : ''}.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className={`grid w-full ${isNative ? 'grid-cols-2' : 'grid-cols-1'} mb-4 glass-card rounded-xl p-1 h-auto`}>
          <TabsTrigger value="gmail" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg py-2.5 transition-all">
            <Mail className="h-4 w-4" /> Gmail
          </TabsTrigger>
          {isNative && (
            <TabsTrigger value="upi" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg py-2.5 transition-all">
              <Smartphone className="h-4 w-4" /> UPI SMS
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="gmail" className="space-y-4">
          {/* Gmail Connection Card */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isConnected ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {isConnected ? 'Gmail Connected' : 'Connect Gmail'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isConnected ? connectedEmail : 'Link your Gmail to scan for bills and receipts'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {isConnected ? (
                  <Button variant="outline" onClick={disconnectGmail} className="min-h-[44px] glass-button border-0 active:scale-[0.97]">
                    <Unlink className="h-4 w-4 mr-1" /> Disconnect
                  </Button>
                ) : (
                  <Button onClick={connectGmail} className="min-h-[44px] w-full sm:w-auto active:scale-[0.97]">
                    <Link2 className="h-4 w-4 mr-2" /> Connect Gmail
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Scan Controls */}
          {isConnected && (
            <div className="glass-card rounded-2xl p-5 space-y-4">
              {/* Auto-Sync consent */}
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-border/30">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <RefreshCw className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground">Auto-Sync Bills</p>
                    <p className="text-xs text-muted-foreground">
                      Fetch new bills automatically once a day (up to 30 days back).
                      {autoSyncEnabled && autoSyncLastSync && (
                        <> Last synced: <span className="text-foreground">{autoSyncLastSync}</span>.</>
                      )}
                    </p>
                  </div>
                </div>
                <Switch checked={autoSyncEnabled} onCheckedChange={handleToggleAutoSync} />
              </div>

              <Button
                onClick={syncNow}
                disabled={isSyncingNow || isScanning}
                variant="outline"
                className="w-full min-h-[44px] glass-button border-0 active:scale-[0.97]"
              >
                {isSyncingNow ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing now…</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Sync now (last {AutoSync.computeSyncDays(user?.id || '')} day{AutoSync.computeSyncDays(user?.id || '') === 1 ? '' : 's'})</>
                )}
              </Button>

              <Button
                onClick={importLast30}
                disabled={isSyncingNow || isScanning}
                className="w-full min-h-[44px] active:scale-[0.97]"
              >
                {isSyncingNow ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> Import bills (last 30 days)</>
                )}
              </Button>

              {(isSyncingNow || syncProgress.phase !== 'idle') && (
                <SyncProgressSteps
                  phase={syncProgress.phase}
                  current={syncProgress.current}
                  total={syncProgress.total}
                  message={syncProgress.message}
                />
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={String(dateRange)} onValueChange={v => setDateRange(Number(v))}>
                    <SelectTrigger className="min-h-[44px] bg-secondary/30 border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_RANGE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={autoImportBills} disabled={isScanning} className="min-h-[44px] active:scale-[0.97]">
                  {isScanning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {importProgress.phase || 'Working...'} {importProgress.total > 0 ? `(${importProgress.current}/${importProgress.total})` : ''}</>
                  ) : (
                    <><ScanLine className="h-4 w-4 mr-2" /> Scan & Import All</>
                  )}
                </Button>
              </div>

              {isScanning && importProgress.total > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{importProgress.phase}</span>
                    <span>{importProgress.current}/{importProgress.total}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Result */}
          {importResult && !isScanning && (
            <div className="glass-card rounded-2xl p-5 border border-success/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">Import Complete</h3>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{importResult.saved}</span> bill(s) imported successfully.
                    {importResult.skipped > 0 && (
                      <> <span className="font-medium text-muted-foreground">{importResult.skipped}</span> skipped (no amount or extraction failed).</>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 glass-button border-0 active:scale-[0.97]"
                    onClick={() => navigate('/expenses')}
                  >
                    View All Bills →
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* How It Works (not connected) */}
          {!isConnected && (
            <div className="glass-card rounded-2xl p-5 border border-primary/10">
              <p className="text-sm font-semibold text-foreground mb-4">How It Works</p>
              <div className="space-y-3">
                {[
                  { step: '1', title: 'Connect', desc: 'Securely link your Gmail account with read-only access' },
                  { step: '2', title: 'Scan & Import', desc: 'AI scans your inbox, extracts bill details, and auto-imports everything' },
                  { step: '3', title: 'Review', desc: 'View all imported bills in your All Bills section, edit as needed' },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {item.step}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ready to import state */}
          {isConnected && !isScanning && !importResult && (
            <div className="glass-card rounded-2xl p-5">
              <div className="py-8 text-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Ready to import</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Select a date range and click "Scan & Import All" to auto-import bills from your Gmail.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {isNative && <TabsContent value="upi" className="space-y-4">
          {/* Auto Scan */}
          {showNativeScan && (
            <div className="glass-card rounded-2xl p-5 border border-primary/10">
              <div className="flex items-center gap-2 mb-3">
                <ScanLine className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Auto Scan UPI SMS</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Automatically read UPI payment messages from your phone and extract bill details.
              </p>
              <Button
                onClick={async () => {
                  setIsAutoScanning(true);
                  setUpiTransactions([]);
                  const result = await scanUpiSmsFromDevice();
                  if (result.error) {
                    toast({ title: 'Scan failed', description: result.error, variant: 'destructive' });
                  } else if (result.transactions.length === 0) {
                    toast({ title: 'No UPI transactions', description: `Scanned ${result.smsCount} UPI messages but found no transactions.` });
                  } else {
                    setUpiTransactions(result.transactions);
                    toast({ title: 'Scan complete', description: `Found ${result.transactions.length} transaction(s) from ${result.smsCount} SMS.` });
                  }
                  setIsAutoScanning(false);
                }}
                disabled={isAutoScanning}
                className="w-full min-h-[44px] active:scale-[0.97]"
              >
                {isAutoScanning ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning SMS...</>
                ) : (
                  <><ScanLine className="h-4 w-4 mr-2" /> Scan UPI SMS from Phone</>
                )}
              </Button>
            </div>
          )}

          {/* Paste UPI SMS */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                {showNativeScan ? 'Or Paste Manually' : 'Paste UPI SMS'}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy UPI payment confirmation SMS from your phone and paste below. You can paste multiple messages at once.
            </p>
            <Textarea
              placeholder={`Example:\nRs.500.00 debited from A/c XX1234 to SWIGGY on 01-04-25. UPI Ref: 510123456789.\n\nYou can paste multiple SMS messages here...`}
              value={smsText}
              onChange={e => setSmsText(e.target.value)}
              rows={6}
              className="resize-none text-sm bg-secondary/30 border-border/30"
            />
            <Button
              onClick={parseUpiSms}
              disabled={isParsing || !smsText.trim()}
              className="w-full min-h-[44px] active:scale-[0.97]"
            >
              {isParsing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing SMS...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Parse UPI SMS</>
              )}
            </Button>
          </div>

          {/* UPI How It Works */}
          {upiTransactions.length === 0 && !isParsing && (
            <div className="glass-card rounded-2xl p-5 border border-primary/10">
              <p className="text-sm font-semibold text-foreground mb-4">How It Works</p>
              <div className="space-y-3">
                {[
                  { step: '1', title: 'Copy SMS', desc: 'Open your SMS app and copy UPI payment confirmation messages' },
                  { step: '2', title: 'Paste Here', desc: 'Paste one or more SMS messages in the text box above' },
                  { step: '3', title: 'AI Parses', desc: 'AI extracts merchant, amount, date, UPI ID and more' },
                  { step: '4', title: 'Save as Bill', desc: 'Review and save each transaction as an expense' },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {item.step}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parsed UPI Transactions */}
          {upiTransactions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                Parsed Transactions ({upiTransactions.length})
              </h2>
              {upiTransactions.map((txn, idx) => (
                <div key={idx} className="glass-card rounded-2xl p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          txn.payment_status === 'success' ? 'bg-success/15 text-success' :
                          txn.payment_status === 'failed' ? 'bg-destructive/15 text-destructive' :
                          'bg-warning/15 text-warning'
                        }`}>
                          <IndianRupee className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{txn.merchant_name}</p>
                          <p className="text-xs text-muted-foreground">{txn.description}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-base tabular-nums text-foreground">
                          ₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <Badge variant={txn.payment_status === 'success' ? 'default' : 'destructive'} className="text-[10px] mt-1">
                          {txn.payment_status}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pl-[52px]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {txn.date}
                      </span>
                      {txn.upi_id && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" /> {txn.upi_id}
                        </span>
                      )}
                      {txn.bank_name && <span>{txn.bank_name}</span>}
                      {txn.transaction_id && <span>Ref: {txn.transaction_id}</span>}
                    </div>

                    {txn.payment_status === 'success' && (
                      <div className="pl-[52px]">
                        <Button
                          size="sm"
                          className="min-h-[40px] active:scale-[0.97]"
                          disabled={savingUpiIdx === idx}
                          onClick={() => saveUpiAsExpense(txn, idx)}
                        >
                          {savingUpiIdx === idx ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...</>
                          ) : (
                            <><Download className="h-3.5 w-3.5 mr-1.5" /> Save as Expense</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>}
      </Tabs>
    </div>
  );
}
