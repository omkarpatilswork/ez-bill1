import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isNativeApp, isAndroid, scanUpiSmsFromDevice } from '@/lib/sms-reader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Mail, Link2, Unlink, Loader2, Download,
  CheckCircle2, AlertCircle, ScanLine,
  Smartphone, Send, IndianRupee, Clock, CreditCard, Filter,
  Trash2,
} from 'lucide-react';
import type { ExpenseCategory } from '@/lib/types';

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


const MERCHANT_CATEGORY_MAP: Record<string, string> = {
  swiggy: 'Meals', zomato: 'Meals', dominos: 'Meals', "domino's": 'Meals', "mcdonald's": 'Meals',
  mcdonalds: 'Meals', kfc: 'Meals', 'burger king': 'Meals', 'pizza hut': 'Meals',
  starbucks: 'Meals', 'cafe coffee day': 'Meals', dunkin: 'Meals', subway: 'Meals',
  amazon: 'Shopping', flipkart: 'Shopping', myntra: 'Shopping', ajio: 'Shopping',
  meesho: 'Shopping', nykaa: 'Shopping', tatacliq: 'Shopping',
  uber: 'Transportation', ola: 'Transportation', rapido: 'Transportation',
  netflix: 'Software', hotstar: 'Software', spotify: 'Software', 'prime video': 'Software',
  'youtube premium': 'Software', 'apple music': 'Software', zee5: 'Software',
  'sony liv': 'Software', 'amazon prime': 'Software', 'disney+': 'Software',
  chatgpt: 'Software', notion: 'Software', figma: 'Software', canva: 'Software',
  jio: 'Utilities', airtel: 'Utilities', vi: 'Utilities', bsnl: 'Utilities',
  'tata play': 'Utilities', 'dish tv': 'Utilities', 'act fibernet': 'Utilities',
  bigbasket: 'Grocery', blinkit: 'Grocery', zepto: 'Grocery', jiomart: 'Grocery',
  dmart: 'Grocery', 'nature basket': 'Grocery', dunzo: 'Grocery', swiggy_instamart: 'Grocery',
  hpcl: 'Fuel', bpcl: 'Fuel', iocl: 'Fuel', 'indian oil': 'Fuel',
  'hp petrol': 'Fuel', 'bharat petroleum': 'Fuel',
  makemytrip: 'Travel', cleartrip: 'Travel', yatra: 'Travel', ixigo: 'Travel',
  irctc: 'Travel', goibibo: 'Travel',
  oyo: 'Accommodation', airbnb: 'Accommodation', treebo: 'Accommodation',
};

const SUBSCRIPTION_MERCHANTS = [
  'netflix', 'hotstar', 'spotify', 'prime video', 'youtube premium', 'apple music',
  'zee5', 'sony liv', 'disney+', 'amazon prime', 'chatgpt', 'notion', 'figma', 'canva',
  'jio', 'airtel', 'vi', 'bsnl', 'tata play', 'dish tv', 'act fibernet',
  'credit card', 'hdfc card', 'icici card', 'sbi card', 'axis card', 'kotak card',
  'amex', 'citi card', 'insurance', 'lic', 'term plan',
];

const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 15 days', value: 15 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
  { label: 'Last 90 days', value: 90 },
];

function smartCategoryMatch(merchantName: string, emailSubject: string, categories: ExpenseCategory[]): string | null {
  const text = `${merchantName} ${emailSubject}`.toLowerCase();
  for (const [keyword, catName] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (text.includes(keyword)) {
      const match = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (match) return match.id;
    }
  }
  return null;
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
  const [importResult, setImportResult] = useState<{ saved: number; skipped: number; total: number } | null>(null);

  // Duplicate detection removed — handled in All Bills page

  const [smsText, setSmsText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [upiTransactions, setUpiTransactions] = useState<UpiTransaction[]>([]);
  const [savingUpiIdx, setSavingUpiIdx] = useState<number | null>(null);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [showNativeScan] = useState(() => isNativeApp() && isAndroid());
  const isNative = isNativeApp();

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
    // duplicates handled in All Bills page

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
      let totalAttachments = 0;
      for (const e of emails) totalAttachments += e.attachments.length;

      setImportProgress({ phase: 'Extracting & importing bills...', current: 0, total: totalAttachments });
      let processed = 0;

      for (const email of emails) {
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
              return categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.id || null;
            };
            const categoryId = matchAiCategory(ext.category)
              || smartCategoryMatch(ext.merchant_name || '', email.subject, categories);

            const merchantName = val(ext.merchant_name);
            const invoiceNumber = val(ext.bill_invoice_number);
            const paymentMethod = val(ext.payment_method);
            const lineItems: Array<{ name: string; quantity: number; unit_price: number; total_price: number }> = ext.line_items || [];

            const title = invoiceNumber
              ? `Invoice ${invoiceNumber}`
              : merchantName ? `Expense at ${merchantName}` : email.subject || 'Email Bill';

            const expenseDate = ext.date_time && ext.date_time !== 'Not Found'
              ? ext.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10);

            const isSubscription = SUBSCRIPTION_MERCHANTS.some(s =>
              `${merchantName} ${email.subject}`.toLowerCase().includes(s)
            );

            // Build description with structured data (same format as NewExpense)
            const LINE_ITEMS_MARKER = '::ITEMS::';
            const descParts: string[] = [];
            if (invoiceNumber) descParts.push(`Invoice: ${invoiceNumber}`);
            if (paymentMethod) descParts.push(`Payment: ${paymentMethod}`);
            if (lineItems.length > 0) descParts.push(`${lineItems.length} item(s)`);
            if (val(ext.tax_details)) descParts.push(`Tax: ${ext.tax_details}`);
            descParts.push(`From email: ${email.subject}`);
            if (isSubscription) descParts.push('[Subscription]');
            let description = descParts.join(' | ');
            if (lineItems.length > 0) {
              description += `${LINE_ITEMS_MARKER}${JSON.stringify(lineItems)}::END_ITEMS::`;
            }

            const { data: expense, error } = await supabase.from('expenses').insert({
              user_id: user.id,
              title,
              merchant: merchantName,
              amount,
              expense_date: expenseDate,
              category_id: categoryId,
              description,
              status: 'draft',
              cost_center: isSubscription ? 'Subscription' : paymentMethod,
            } as any).select().single();

            if (error) { skipped++; continue; }
            const expenseId = (expense as any)?.id;

            // Upload attachment to storage and create receipt record
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

      setImportResult({ saved, skipped, total: totalAttachments });
      toast({
        title: 'Import complete',
        description: `Imported ${saved} bill(s). ${skipped > 0 ? `${skipped} skipped (no amount or extraction failed).` : ''}`,
      });

      if (saved > 0) {
        // Navigate to All Bills with duplicate check
        navigate('/expenses?checkDupes=1');
      }
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsScanning(false);
      setImportProgress({ phase: '', current: 0, total: 0 });
    }
  };

  // Duplicate detection and deletion moved to MyExpenses (All Bills page)

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Import Bills</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import bills from Gmail{isNative ? ' or UPI payment SMS messages' : ''}.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className={`grid w-full ${isNative ? 'grid-cols-2' : 'grid-cols-1'} mb-4`}>
          <TabsTrigger value="gmail" className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Gmail
          </TabsTrigger>
          {isNative && (
            <TabsTrigger value="upi" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" /> UPI SMS
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="gmail" className="space-y-6">
          <Card className="shadow-md border-0">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isConnected ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
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
                    <Button variant="outline" onClick={disconnectGmail} className="min-h-[44px]">
                      <Unlink className="h-4 w-4 mr-1" /> Disconnect
                    </Button>
                  ) : (
                    <Button onClick={connectGmail} className="min-h-[44px] w-full sm:w-auto">
                      <Link2 className="h-4 w-4 mr-2" /> Connect Gmail
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isConnected && (
            <Card className="shadow-md border-0">
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={String(dateRange)} onValueChange={v => setDateRange(Number(v))}>
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_RANGE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={autoImportBills} disabled={isScanning} className="min-h-[44px]">
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
              </CardContent>
            </Card>
          )}

          {importResult && !isScanning && (
            <Card className="shadow-md border-0 bg-green-500/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
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
                      className="mt-2"
                      onClick={() => navigate('/expenses')}
                    >
                      View All Bills →
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!isConnected && (
            <Card className="shadow-md border-0 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
              </CardContent>
            </Card>
          )}

          {isConnected && !isScanning && !importResult && (
            <Card className="shadow-md border-0">
              <CardContent className="py-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Ready to import</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select a date range and click "Scan & Import All" to auto-import bills from your Gmail.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isNative && <TabsContent value="upi" className="space-y-6">
          {showNativeScan && (
            <Card className="shadow-md border-0 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanLine className="h-5 w-5 text-primary" />
                  Auto Scan UPI SMS
                </CardTitle>
                <CardDescription>
                  Automatically read UPI payment messages from your phone and extract bill details.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                  className="w-full min-h-[44px]"
                >
                  {isAutoScanning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning SMS...</>
                  ) : (
                    <><ScanLine className="h-4 w-4 mr-2" /> Scan UPI SMS from Phone</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-md border-0">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                {showNativeScan ? 'Or Paste Manually' : 'Paste UPI SMS'}
              </CardTitle>
              <CardDescription>
                Copy UPI payment confirmation SMS from your phone and paste below. You can paste multiple messages at once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={`Example:\nRs.500.00 debited from A/c XX1234 to SWIGGY on 01-04-25. UPI Ref: 510123456789.\n\nYou can paste multiple SMS messages here...`}
                value={smsText}
                onChange={e => setSmsText(e.target.value)}
                rows={6}
                className="resize-none text-sm"
              />
              <Button
                onClick={parseUpiSms}
                disabled={isParsing || !smsText.trim()}
                className="w-full min-h-[44px]"
              >
                {isParsing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing SMS...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Parse UPI SMS</>
                )}
              </Button>
            </CardContent>
          </Card>

          {upiTransactions.length === 0 && !isParsing && (
            <Card className="shadow-md border-0 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
              </CardContent>
            </Card>
          )}

          {upiTransactions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Parsed Transactions ({upiTransactions.length})
              </h2>
              {upiTransactions.map((txn, idx) => (
                <Card key={idx} className="shadow-sm border-0">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            txn.payment_status === 'success' ? 'bg-green-500/10 text-green-500' :
                            txn.payment_status === 'failed' ? 'bg-red-500/10 text-red-500' :
                            'bg-yellow-500/10 text-yellow-500'
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
                            className="min-h-[40px]"
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>}
      </Tabs>

    </div>
  );
}
