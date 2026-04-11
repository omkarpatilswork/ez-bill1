import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from '@/lib/smart-category';
import type { ExpenseCategory } from '@/lib/types';
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, AlertCircle,
  FileImage, Trash2, ImagePlus, X, FileText
} from 'lucide-react';
import { useEffect } from 'react';

const LINE_ITEMS_MARKER = '::ITEMS::';

const CATEGORY_ALIASES: Record<string, string[]> = {
  'food & dining': ['food & dining', 'meals', 'food', 'dining'],
  'petrol & fuel': ['petrol & fuel', 'fuel', 'petrol'],
  'grocery': ['grocery'], 'shopping': ['shopping'],
  'transportation': ['transportation', 'transport'], 'travel': ['travel'],
  'accommodation': ['accommodation', 'hotel'], 'utilities': ['utilities'],
  'software': ['software'], 'medical': ['medical', 'health'],
  'toll': ['toll'], 'parking': ['parking'],
  'entertainment': ['entertainment'], 'education': ['education', 'training'],
  'subscription': ['subscription'], 'office supplies': ['office supplies'],
  'other': ['other'],
};

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

async function convertHeicToJpeg(file: File): Promise<File> {
  const ext = file.name.toLowerCase();
  if (!ext.endsWith('.heic') && !ext.endsWith('.heif')) return file;
  try {
    const heic2any = (await import('heic2any')).default;
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }) as Blob;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
  } catch (e) {
    console.error('HEIC conversion failed:', e);
    return file;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeCurrency(raw?: string, fallback = 'INR'): string {
  if (!raw) return fallback;
  const u = raw.toUpperCase().trim();
  if (['RS', 'RS.', 'INR', '₹', 'RUPEES', 'RUPEE'].includes(u)) return 'INR';
  if (['DHS', 'AED', 'DHIRAM', 'DIRHAM', 'DIRHAMS', 'د.إ'].includes(u)) return 'AED';
  if (['$', 'USD', 'DOLLARS', 'DOLLAR'].includes(u)) return 'USD';
  if (['£', 'GBP', 'POUNDS', 'POUND'].includes(u)) return 'GBP';
  if (['€', 'EUR', 'EURO', 'EUROS'].includes(u)) return 'EUR';
  if (/^[A-Z]{3}$/.test(u)) return u;
  return fallback;
}

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  result?: { merchant: string; amount: number; expenseId: string };
}

export default function BulkUpload() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  useEffect(() => {
    supabase.from('expense_categories').select('*').then(({ data }) => {
      setCategories((data as unknown as ExpenseCategory[]) || []);
    });
  }, []);

  const addFiles = async (files: FileList | File[]) => {
    const newItems: QueueItem[] = [];
    for (const rawFile of Array.from(files)) {
      const file = await convertHeicToJpeg(rawFile);
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isImage && !isPdf) continue;
      newItems.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : '',
        status: 'pending',
      });
    }
    if (newItems.length === 0) {
      toast({ title: 'No valid files', description: 'Only images and PDFs are supported.', variant: 'destructive' });
      return;
    }
    setQueue(prev => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const processAll = async () => {
    if (!user) return;
    setIsProcessing(true);
    const defaultCurrency = profile?.default_currency || 'INR';
    let saved = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.status === 'done') { saved++; continue; }

      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

      try {
        const base64 = await fileToBase64(item.file);
        const fileType = item.file.type || (item.file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

        const { data: ext, error } = await supabase.functions.invoke('extract-receipt', {
          body: { file_base64: base64, file_type: fileType },
        });
        if (error) throw new Error('Extraction failed');
        if (ext?.error) throw new Error(ext.error);

        const amount = Number(ext.amount);
        if (!amount || isNaN(amount)) throw new Error('No amount detected');

        const val = (v: any) => v && v !== 'Not Found' ? v : '';
        const merchantName = val(ext.merchant_name);
        const invoiceNumber = val(ext.bill_invoice_number);
        const paymentMethod = val(ext.payment_method);
        const lineItems = ext.line_items || [];

        // Category
        const aiResult = findCategoryByName(ext.category, categories);
        const smartCat = smartCategoryFromMerchant(merchantName, ext.category);
        const smartResult = smartCat !== 'Other' ? findCategoryByName(smartCat, categories) : null;
        const categoryId = aiResult?.id || smartResult?.id || null;
        const categoryLabel = aiResult?.label || smartResult?.label || smartCat || 'Other';

        // Currency
        const merchantLower = merchantName.toLowerCase();
        const isIndian = ['swiggy', 'zomato', 'flipkart', 'amazon.in', 'bigbasket', 'blinkit', 'zepto'].some(m => merchantLower.includes(m));
        const currency = isIndian ? 'INR' : normalizeCurrency(ext.currency, defaultCurrency);

        // Title
        const title = invoiceNumber
          ? `Invoice ${invoiceNumber}`
          : merchantName ? `Bill - ${merchantName}` : `Bill Upload`;

        const expenseDate = ext.date_time && ext.date_time !== 'Not Found'
          ? ext.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10);

        // Description (same format as NewExpense)
        const descParts: string[] = [];
        if (categoryLabel && categoryLabel !== 'Other') descParts.push(`Category: ${categoryLabel}`);
        if (invoiceNumber) descParts.push(`Invoice: ${invoiceNumber}`);
        if (paymentMethod) descParts.push(`Payment: ${paymentMethod}`);
        if (lineItems.length > 0) descParts.push(`${lineItems.length} item(s)`);
        const numSafe = (v: any) => { const n = Number(v); return !isNaN(n) && n > 0 ? String(n) : ''; };
        const st = numSafe(ext.subtotal); if (st) descParts.push(`Subtotal: ${st}`);
        if (ext.tax_amount != null && Number(ext.tax_amount) > 0) {
          descParts.push(`Tax: ${ext.tax_amount}${val(ext.tax_details) ? ` (${ext.tax_details})` : ''}`);
          if (val(ext.tax_details)) descParts.push(`TaxDetails: ${ext.tax_details}`);
        }
        if (ext.discount != null && Number(ext.discount) > 0) descParts.push(`Discount: ${ext.discount}`);
        descParts.push('[upload]');
        let description = descParts.join(' | ');
        if (lineItems.length > 0) {
          description += `${LINE_ITEMS_MARKER}${JSON.stringify(lineItems)}::END_ITEMS::`;
        }

        const { data: expense, error: insertErr } = await supabase.from('expenses').insert({
          user_id: user.id,
          title,
          merchant: merchantName,
          amount,
          currency,
          expense_date: expenseDate,
          category_id: categoryId,
          description,
          status: 'draft',
          cost_center: paymentMethod,
        } as any).select().single();

        if (insertErr) throw insertErr;
        const expenseId = (expense as any).id;

        // Upload receipt file
        const filePath = `${user.id}/${expenseId}/${item.file.name}`;
        const { error: uploadErr } = await supabase.storage.from('receipts').upload(filePath, item.file);
        if (!uploadErr) {
          await supabase.from('expense_receipts').insert({
            expense_id: expenseId,
            file_path: filePath,
            file_name: item.file.name,
          } as any);
        }

        // Audit log
        await supabase.from('audit_logs').insert({
          expense_id: expenseId, user_id: user.id,
          action: 'submitted', details: { amount, title, source: 'bulk_upload' },
        } as any);

        setQueue(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'done', result: { merchant: merchantName || 'Bill', amount, expenseId } } : i
        ));
        saved++;
      } catch (err: any) {
        setQueue(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'error', error: err.message || 'Failed' } : i
        ));
        failed++;
      }
    }

    setIsProcessing(false);
    toast({
      title: 'Bulk upload complete',
      description: `${saved} saved, ${failed} failed. Head to All Bills to review.`,
    });

    if (saved > 0) {
      setTimeout(() => navigate('/expenses?checkDupes=1'), 1500);
    }
  };

  const pendingCount = queue.filter(i => i.status === 'pending' || i.status === 'processing').length;
  const doneCount = queue.filter(i => i.status === 'done').length;
  const totalCount = queue.length;
  const progress = totalCount > 0 ? Math.round(((totalCount - pendingCount) / totalCount) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Bulk Upload Bills</h1>
          <p className="text-xs text-muted-foreground">Upload multiple receipts — they'll be auto-extracted & saved as drafts</p>
        </div>
      </div>

      {/* Drop zone */}
      <Card
        className="border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
            <ImagePlus className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">Tap to select files</p>
            <p className="text-xs text-muted-foreground mt-1">Images (JPG, PNG, HEIC) or PDFs • Multiple allowed</p>
          </div>
        </CardContent>
      </Card>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{totalCount} file(s) selected</p>
            {!isProcessing && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setQueue([])}>
                Clear all
              </Button>
            )}
          </div>

          {isProcessing && (
            <div className="space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Processing {totalCount - pendingCount} / {totalCount} • {doneCount} saved
              </p>
            </div>
          )}

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {queue.map(item => (
              <Card key={item.id} className="border-border/30">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  {/* Thumbnail */}
                  <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt="" className="h-full w-full object-cover rounded-lg" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.file.size / 1024).toFixed(0)} KB
                      {item.status === 'done' && item.result && (
                        <span className="text-green-500 ml-2">
                          ✓ {item.result.merchant} — ₹{item.result.amount}
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-destructive ml-2">✗ {item.error}</span>
                      )}
                    </p>
                  </div>

                  {/* Status / actions */}
                  <div className="shrink-0">
                    {item.status === 'pending' && !isProcessing && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(item.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {item.status === 'processing' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    {item.status === 'done' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    {item.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Action button */}
      {queue.length > 0 && !isProcessing && queue.some(i => i.status === 'pending') && (
        <Button onClick={processAll} className="w-full h-12 text-base font-semibold" size="lg">
          <Upload className="h-5 w-5 mr-2" />
          Extract & Save {queue.filter(i => i.status === 'pending').length} Bill(s)
        </Button>
      )}

      {/* Done summary */}
      {!isProcessing && queue.length > 0 && !queue.some(i => i.status === 'pending') && (
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-green-500">
            <CheckCircle2 className="h-6 w-6" />
            <span className="font-semibold">All done!</span>
          </div>
          <Button onClick={() => navigate('/expenses')} className="w-full">
            View All Bills
          </Button>
        </div>
      )}
    </div>
  );
}
