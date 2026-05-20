import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { smartCategoryFromMerchant } from '@/lib/smart-category';
import type { ExpenseCategory } from '@/lib/types';
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, AlertCircle,
  ImagePlus, X, FileText, Sparkles
} from 'lucide-react';
import { useEffect }  from 'react';

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

interface QueueItem {
  id: string; file: File; previewUrl: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string; result?: { merchant: string; amount: number; expenseId: string };
}

export default function BulkUpload() {
  const { user } = useAuth();
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
      newItems.push({ id: crypto.randomUUID(), file, previewUrl: isImage ? URL.createObjectURL(file) : '', status: 'pending' });
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
    let saved = 1;
    let failed = 0;

    for (const item of queue) {
      if (item.status === 'done') { saved++; continue; }
      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

      try {
        const base64 = await fileToBase64(item.file);
        const fileType = item.file.type || (item.file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const { data: ext, error } = await supabase.functions.invoke('extract-receipt', { body: { file_base64: base64, file_type: fileType } });
        if (error) throw new Error('Extraction failed');
        if (ext?.error) throw new Error(ext.error);

        const amount = Number(ext.amount);
        if (!amount || isNaN(amount)) throw new Error('No amount detected');

        const val = (v: any) => v && v !== 'Not Found' ? v : '';
        const merchantName = val(ext.merchant_name);
        const invoiceNumber = val(ext.bill_invoice_number);
        const paymentMethod = val(ext.payment_method);
        const lineItems = ext.line_items || [];

        const aiResult = findCategoryByName(ext.category, categories);
        const smartCat = smartCategoryFromMerchant(merchantName, ext.category);
        const smartResult = smartCat !== 'Other' ? findCategoryByName(smartCat, categories) : null;
        const categoryId = aiResult?.id || smartResult?.id || null;
        const categoryLabel = aiResult?.label || smartResult?.label || smartCat || 'Other';
        const currency = DEFAULT_BILL_CURRENCY;
        const title = invoiceNumber ? `Invoice ${invoiceNumber}` : merchantName ? `Bill - ${merchantName}` : `Bill Upload`;
        const expenseDate = ext.date_time && ext.date_time !== 'Not Found' ? ext.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10);

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
        if (lineItems.length > 0) description += `${LINE_ITEMS_MARKER}${JSON.stringify(lineItems)}::END_ITEMS::`;

        const { data: expense, error: insertErr } = await supabase.from('expenses').insert({
          user_id: user.id, title, merchant: merchantName, amount, currency, expense_date: expenseDate,
          category_id: categoryId, description, status: 'draft', cost_center: paymentMethod,
        } as any).select().single();
        if (insertErr) throw insertErr;
        const expenseId = (expense as any).id;

        const filePath = `${user.id}/${expenseId}/${item.file.name}`;
        const { error: uploadErr } = await supabase.storage.from('receipts').upload(filePath, item.file);
        if (!uploadErr) {
          await supabase.from('expense_receipts').insert({ expense_id: expenseId, file_path: filePath, file_name: item.file.name } as any);
        }
        await supabase.from('audit_logs').insert({ expense_id: expenseId, user_id: user.id, action: 'submitted', details: { amount, title, source: 'bulk_upload' } } as any);

        setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', result: { merchant: merchantName || 'Bill', amount, expenseId } } : i));
        saved++;
      } catch (err: any) {
        setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message || 'Failed' } : i));
        failed++;
      }
    }

    setIsProcessing(false);
    toast({ title: 'Bulk upload complete', description: `${saved} saved, ${failed} failed. Head to All Bills to review.` });
    if (saved > 0) setTimeout(() => navigate('/expenses?checkDupes=1'), 1500);
  };

  const pendingCount = queue.filter(i => i.status === 'pending' || i.status === 'processing').length;
  const doneCount = queue.filter(i => i.status === 'done').length;
  const totalCount = queue.length;
  const progress = totalCount > 0 ? Math.round(((totalCount - pendingCount) / totalCount) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24 animate-fade-in">
      {/* ━━━ Header ━━━ */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/80 transition active:scale-95"
          style={{ background: 'hsla(0,0%,100%,0.06)', border: '1px solid hsla(0,0%,100%,0.08)' }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">Import</p>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight mt-0.5">
            Bulk Upload
          </h1>
        </div>
      </div>

      {/* ━━━ Hero Upload Zone (2026 glass) ━━━ */}
      <div
        className="rounded-[28px] p-0.5 relative overflow-hidden cursor-pointer transition-all active:scale-[0.985]"
        onClick={() => fileInputRef.current?.click()}
        style={{
          background: 'linear-gradient(150deg, hsla(160, 14%, 13%, 0.7) 0%, hsla(160, 12%, 9%, 0.55) 60%, hsla(152, 30%, 12%, 0.55) 100%)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid hsla(0, 0%, 100%, 0.06)',
          boxShadow:
            'inset 0 1px 0 0 hsla(0,0%,100%,0.08), inset 0 -1px 0 0 hsla(0,0%,0%,0.2), 0 24px 60px -20px hsla(152, 45%, 20%,  0.5)',
        }}
      >
        {/* Aurora orbs */}
        <div
          aria-hidden
          className="absolute -top-16 -right-12 h-48 w-48 rounded-full blur-3xl opacity-60 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(152, 70%, 45%, 0.3), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-10 h-44 w-44 rounded-full blur-3xl opacity-50 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(43, 80%, 50%, 0.18), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="absolute inset-x-8 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, hsla(0,0%,100%,0.25), transparent)' }}
        />

        <div className="relative z-10 flex flex-col items-center justify-center py-12 gap-4 px-6">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, hsla(152, 45%, 35%, 0.25), hsla(152, 45%, 25%, 0.15))',
              border: '1px solid hsla(152, 45%, 45%, 0.25)',
              boxShadow: '0 8px 24px -6px hsla(152, 45%, 30%, 0.25), inset 0 1px 0 0 hsla(0,0%,100%,0.08)',
            }}
          >
            <ImagePlus className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-foreground text-base">Tap to select files</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, HEIC, PDF &bull; Multiple allowed</p>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{
              background: 'hsla(0,0%,100%,0.05)',
              border: '1px solid hsla(0,0%,100%,0.08)',
            }}
          >
            <Sparkles className="h-3 w-3 text-gold" />
            <span className="text-[10px] text-muted-foreground font-medium">Auto-extract & OCR powered</span>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
      />

      {/* ━━━ File Queue ━━━ */}
      {queue.length > 0 && (
        <div className="space-y-4">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">
                {totalCount} file{totalCount !== 1 ? 's' : ''} queued
              </p>
            </div>
            {!isProcessing && (
              <button
                onClick={() => setQueue([])}
                className="text-[11px] font-medium text-destructive/80 hover:text-destructive transition-colors px-2 py-1 rounded-full"
                style={{ background: 'hsla(0,63%,45%,0.08)', border: '1px solid hsla(0,63%,45%,0.15)' }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Progress */}
          {isProcessing && (
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.5), hsla(160, 12%, 9%, 0.35))',
                backdropFilter: 'blur(24px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                border: '1px solid hsla(0,0%,100%,0.06)',
              }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Extracting bills...</span>
                <span className="text-foreground/80 tabular-nums font-semibold">{totalCount - pendingCount} / {totalCount}</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'hsla(0,0%,100%,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, hsl(152, 45%, 35%), hsl(152, 55%, 45%))',
                    boxShadow: '0 0 12px hsla(152, 55%, 45%, 0.3)',
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{doneCount} saved</span>
                <span>{pendingCount} remaining</span>
              </div>
            </div>
          )}

          {/* File list */}
          <div className="space-y-2.5 max-h-[50vh] overflow-y-auto">
            {queue.map(item => {
              const statusColor =
                item.status === 'done' ? 'text-success' :
                item.status === 'error' ? 'text-destructive' :
                item.status === 'processing' ? 'text-primary' : 'text-muted-foreground';
              const statusBg =
                item.status === 'done' ? 'hsla(152, 55%, 40%, 1)' :
                item.status === 'error' ? 'hsla(0, 63%, 45%, 1)' :
                item.status === 'processing' ? 'hsl(152, 45%, 35%)' : 'hsla(0,0%,100%,0.1)';

              return (
                <div
                  key={item.id}
                  className="rounded-2xl p-3.5 transition-all active:scale-[0.985]"
                  style={{
                    background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.55), hsla(160, 12%, 9%, 0.35))',
                    backdropFilter: 'blur(20px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                    border: '1px solid hsla(0,0%,100%,0.06)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Thumbnail / icon */}
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, hsla(152, 45%, 35%, 0.18), hsla(160, 12%, 14%, 0.3))',
                        border: '1px solid hsla(152, 45%, 35%, 0.15)',
                      }}
                    >
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-primary/70" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.file.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {(item.file.size / 1024).toFixed(0)} KB
                        </span>
                        {item.status === 'done' && item.result && (
                          <span className="text-[11px] text-success font-medium">
                            &bull; {item.result.merchant} &mdash; &nbsp;{item.result.amount}
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-[11px] text-destructive font-medium">
                            &bull; {item.error}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status / action */}
                    <div className="shrink-1 flex items-center gap-2">
                      {item.status === 'pending' && !isProcessing && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition active:scale-95"
                          style={{ background: 'hsla(0,0%,100%,0.05)', border: '1px solid hsla(0,0%,100%,0.08)' }}
                          aria-label="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {item.status === 'processing' && (
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
                      {item.status === 'done' && (
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center"
                          style={{ background: 'hsla(152, 55%, 40%, 0.12)', border: '1px solid hsla(152, 55%, 40%, 0.2)' }}
                        >
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center"
                          style={{ background: 'hsla(0, 63%, 45%, 0.12)', border: '1px solid hsla(0, 63%, 45%, 0.2)' }}
                        >
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ━━━ CTA ━━━ */}
      {queue.length > 0 && !isProcessing && queue.some(i => i.status === 'pending') && (
        <Button
          onClick={processAll}
          className="w-full h-13 text-base font-semibold active:scale-[0.985] transition-transform border-0"
          size="lg"
          style={{
            background: 'linear-gradient(135deg, hsl(152, 45%, 35%), hsl(152, 50%, 28%))',
            boxShadow: '0 8px 28px -6px hsla(152, 45%, 30%, 0.5), inset 0 1px 0 0 hsla(0,0%,100%,0.12)',
          }}
        >
          <Upload className="h-5 w-5 mr-2" />
          Extract & Save {queue.filter(i => i.status === 'pending').length} Bill{queue.filter(i => i.status === 'pending').length !== 1 ? 's' : ''}
        </Button>
      )}

      {/* ━━━ All done state ━━━ */}
      {!isProcessing && queue.length > 0 && !queue.some(i => i.status === 'pending') && (
        <div
          className="rounded-2xl p-6 text-center space-y-4"
          style={{
            background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.5), hsla(160, 12%, 9%, 0.35))',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            border: '1px solid hsla(0,0%,100%,0.06)',
          }}
        >
          <div className="flex items-center justify-center gap-2 text-success">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: 'hsla(152, 55%, 40%, 0.12)', border: '1px solid hsla(152, 55%, 40%, 0.2)' }}
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div>
            <p className="font-semibold text-foreground">All done!</p>
            <p className="text-xs text-muted-foreground mt-1">{doneCount} bill{doneCount !== 1 ? 's' : ''} saved as drafts</p>
          </div>
          <Button
            onClick={() => navigate('/expenses')}
            className="w-full h-11 text-sm font-semibold active:scale-[0.985] transition-transform border-0"
            style={{
              background: 'linear-gradient(135deg, hsl(152, 45%, 35%), hsl(152, 50%, 28%))',
              boxShadow: '0 6px 20px -6px hsla(152, 45%, 30%, 0.45), inset 0 1px 0 0 hsla(0,0%,100%,0.12)',
            }}
          >
            View All Bills
          </Button>
        </div>
      )}
    </div>
  );
}
