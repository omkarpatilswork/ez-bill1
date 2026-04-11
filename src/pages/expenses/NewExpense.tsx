import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Upload, FileText, X, Camera, Eye, Loader2, CheckCircle2,
  Pencil, Save, Send, Users, Package, CreditCard, Calendar,
  Store, Hash, Receipt, IndianRupee, FileImage, Trash2, PartyPopper
} from 'lucide-react';
import type { ExpenseCategory } from '@/lib/types';
import { CURRENCIES, getCurrencySymbol } from '@/lib/countries';
import { smartCategoryFromMerchant } from '@/lib/smart-category';

interface LineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ExtractedData {
  merchant_name?: string;
  merchant_address?: string;
  merchant_gstin?: string;
  amount?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  tax_details?: string;
  discount?: number | null;
  date_time?: string;
  bill_invoice_number?: string;
  payment_method?: string;
  category?: string;
  line_items?: LineItem[];
  total_items?: number;
  currency?: string;
}

const CATEGORIES = [
  'Food & Dining', 'Grocery', 'Petrol & Fuel', 'Toll', 'Parking',
  'Shopping', 'Utilities', 'Travel', 'Accommodation', 'Transportation',
  'Office Supplies', 'Software', 'Medical', 'Entertainment', 'Education', 'Other'
];

const LINE_ITEMS_MARKER = '::ITEMS::';

function parseStoredLineItems(desc: string | null | undefined): LineItem[] {
  if (!desc) return [];
  const idx = desc.indexOf(LINE_ITEMS_MARKER);
  if (idx < 0) return [];
  try {
    const jsonStr = desc.slice(idx + LINE_ITEMS_MARKER.length);
    const endIdx = jsonStr.indexOf('::END_ITEMS::');
    return JSON.parse(endIdx >= 0 ? jsonStr.slice(0, endIdx) : jsonStr);
  } catch { return []; }
}

function cleanDescription(desc: string | null | undefined): string {
  if (!desc) return '';
  const idx = desc.indexOf(LINE_ITEMS_MARKER);
  let clean = idx >= 0 ? desc.slice(0, idx) : desc;
  clean = clean.replace(/Category:\s*[^|]+\|?\s*/g, '').replace(/Invoice:\s*[^|]+\|?\s*/g, '').replace(/Payment:\s*[^|]+\|?\s*/g, '').replace(/\d+ item\(s\)\s*\|?\s*/g, '');
  clean = clean.replace(/Tax:\s*[^|]+\|?\s*/g, '').replace(/Discount:\s*[^|]+\|?\s*/g, '').replace(/Subtotal:\s*[^|]+\|?\s*/g, '');
  clean = clean.replace(/From email:\s*[^|]+\|?\s*/g, '').replace(/\[Subscription\]\s*\|?\s*/g, '');
  return clean.trim();
}

function parseFieldFromDesc(desc: string | null | undefined, key: string): string {
  if (!desc) return '';
  const match = desc.match(new RegExp(`${key}:\\s*([^|]+)`));
  return match ? match[1].trim() : '';
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

export default function NewExpense() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const editId = searchParams.get('edit');

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionData, setExtractionData] = useState<ExtractedData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ebill');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: '', merchant: '', amount: '', expense_date: new Date().toISOString().slice(0, 10),
    category_id: '', category_name: '', cost_center: '', description: '',
    payment_method: '', invoice_number: '', tax_amount: '', subtotal: '', discount: '',
    currency: profile?.default_currency || 'INR',
  });
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);

  useEffect(() => {
    supabase.from('expense_categories').select('*').then(({ data }) => {
      setCategories((data as unknown as ExpenseCategory[]) || []);
    });
  }, []);

  useEffect(() => {
    if (!editId || !user) return;
    (async () => {
      const { data: exp } = await supabase.from('expenses').select('*').eq('id', editId).single();
      if (!exp) return;
      const e = exp as any;
      const lineItems = parseStoredLineItems(e.description);
      const descClean = cleanDescription(e.description);
      setForm({
        title: e.title || '',
        merchant: e.merchant || '',
        amount: String(e.amount || ''),
        expense_date: e.expense_date || new Date().toISOString().slice(0, 10),
        category_id: e.category_id || '',
        category_name: e.cost_center || '',
        cost_center: e.cost_center || '',
        description: descClean,
        payment_method: e.cost_center || '',
        invoice_number: parseFieldFromDesc(e.description, 'Invoice'),
        tax_amount: parseFieldFromDesc(e.description, 'Tax') || '',
        subtotal: parseFieldFromDesc(e.description, 'Subtotal') || '',
        discount: parseFieldFromDesc(e.description, 'Discount') || '',
        currency: e.currency || profile?.default_currency || 'INR',
      });
      setEditLineItems(lineItems);
      setExtractionData({ line_items: lineItems });

      const { data: receipts } = await supabase.from('expense_receipts').select('*').eq('expense_id', editId).limit(1);
      if (receipts && receipts.length > 0) {
        const r = receipts[0] as any;
        const { data: signedData } = await supabase.storage.from('receipts').createSignedUrl(r.file_path, 3600);
        if (signedData?.signedUrl) {
          setReceiptPreviewUrl(signedData.signedUrl);
        }
      }
      setActiveTab('ebill');
      setIsEditing(true);
    })();
  }, [editId, user]);

  useEffect(() => {
    return () => { if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl); };
  }, [receiptPreviewUrl]);

  useEffect(() => {
    if (mode === 'scan') {
      setTimeout(() => scanInputRef.current?.click(), 300);
    }
  }, [mode]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileSelected = async (originalFile: File) => {
    // Convert HEIC to JPEG for preview
    const file = await convertHeicToJpeg(originalFile);
    setReceiptFile(file);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(URL.createObjectURL(file));
    setIsExtracting(true);
    setExtractionData(null);
    setIsEditing(false);

    try {
      // Use original file for extraction (AI handles HEIC fine)
      const base64 = await fileToBase64(originalFile);
      if (!base64) throw new Error('Could not read file');
      const fileType = originalFile.type || (originalFile.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf'
        : originalFile.name?.toLowerCase().match(/\.hei[cf]$/) ? 'image/heic' : 'image/jpeg');
      const { data, error } = await supabase.functions.invoke('extract-receipt', {
        body: { file_base64: base64, file_type: fileType },
      });

      if (error) {
        const errBody = typeof error === 'object' && (error as any).context?.body
          ? JSON.parse((error as any).context.body) : null;
        throw new Error(errBody?.error || errBody?.detail || (error as any).message || 'Extraction failed');
      }
      if (data?.error) throw new Error(data.error);

      setExtractionData(data);
      populateFormFromExtraction(data);
      setActiveTab('ebill');
      toast({ title: '✅ Bill scanned successfully', description: 'AI extracted all details. Review your E-Bill below.' });
    } catch (err: any) {
      console.error('Extraction error:', err);
      toast({ title: 'Scan failed', description: err.message || 'Could not extract details.', variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  };

  const populateFormFromExtraction = (data: ExtractedData) => {
    // Alias map: AI/smart names → possible DB names
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

    const findCategoryId = (name?: string): { id: string; label: string } => {
      if (!name || name === 'Not Found') return { id: '', label: '' };
      const lower = name.toLowerCase();
      // Direct match first
      const direct = categories.find(c => c.name.toLowerCase() === lower);
      if (direct) return { id: direct.id, label: direct.name };
      // Alias match
      const aliases = CATEGORY_ALIASES[lower] || [lower];
      for (const alias of aliases) {
        const match = categories.find(c => c.name.toLowerCase() === alias);
        if (match) return { id: match.id, label: match.name };
      }
      return { id: '', label: name };
    };

    // Smart category: AI first, then merchant-based fallback
    let aiCategory = data.category !== 'Not Found' ? (data.category || '') : '';
    let result = findCategoryId(aiCategory);
    if (!result.id && data.merchant_name && data.merchant_name !== 'Not Found') {
      const smartCat = smartCategoryFromMerchant(data.merchant_name, data.category);
      if (smartCat !== 'Other') {
        result = findCategoryId(smartCat);
        if (!result.id) result = { id: '', label: smartCat };
      }
    }
    const categoryId = result.id;
    const categoryName = result.label || aiCategory;

    setForm({
      title: data.bill_invoice_number && data.bill_invoice_number !== 'Not Found'
        ? `Invoice ${data.bill_invoice_number}`
        : data.merchant_name && data.merchant_name !== 'Not Found'
          ? `Bill - ${data.merchant_name}` : '',
      merchant: data.merchant_name !== 'Not Found' ? (data.merchant_name || '') : '',
      amount: data.amount != null ? String(data.amount) : '',
      expense_date: data.date_time && data.date_time !== 'Not Found'
        ? data.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10),
      category_id: categoryId,
      category_name: categoryName,
      cost_center: data.payment_method !== 'Not Found' ? (data.payment_method || '') : '',
      description: '',
      payment_method: data.payment_method !== 'Not Found' ? (data.payment_method || '') : '',
      invoice_number: data.bill_invoice_number !== 'Not Found' ? (data.bill_invoice_number || '') : '',
      tax_amount: data.tax_amount != null ? String(data.tax_amount) : '',
      subtotal: data.subtotal != null ? String(data.subtotal) : '',
      discount: data.discount != null ? String(data.discount) : '',
      currency: data.currency || profile?.default_currency || 'INR',
    });
    setEditLineItems(data.line_items || []);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);

    const payload = {
      title: form.title || `Bill - ${form.merchant}`,
      merchant: form.merchant,
      amount: parseFloat(form.amount),
      currency: form.currency,
      expense_date: form.expense_date,
      category_id: form.category_id || null,
      cost_center: form.payment_method || form.cost_center,
      description: buildDescription(),
      status: 'draft',
    } as any;

    let expenseId: string;

    if (editId) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editId);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
      expenseId = editId;
    } else {
      const { data: expense, error } = await supabase.from('expenses').insert({
        user_id: user.id, ...payload,
      } as any).select().single();
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
      expenseId = (expense as any).id;
    }

    if (receiptFile && expenseId) {
      const filePath = `${user.id}/${expenseId}/${receiptFile.name}`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, receiptFile);
      if (!uploadError) {
        await supabase.from('expense_receipts').insert({
          expense_id: expenseId, file_path: filePath, file_name: receiptFile.name,
        } as any);
      }
    }

    await supabase.from('audit_logs').insert({
      expense_id: expenseId, user_id: user.id,
      action: editId ? 'updated' : 'submitted',
      details: { amount: form.amount, title: form.title },
    } as any);

    setIsSubmitting(false);

    // Show success animation
    setSubmitSuccess(true);
    setTimeout(() => {
      navigate(editId ? `/expenses/${editId}` : '/expenses');
    }, 1800);
  };

  const handleDelete = async () => {
    if (!editId || !confirm('Delete this bill permanently?')) return;
    await supabase.from('processed_emails').delete().eq('expense_id', editId);
    await supabase.from('expense_receipts').delete().eq('expense_id', editId);
    await supabase.from('expenses').delete().eq('id', editId);
    toast({ title: 'Bill deleted' });
    navigate('/expenses');
  };

  const buildDescription = () => {
    const parts: string[] = [];
    if (form.category_name) parts.push(`Category: ${form.category_name}`);
    if (form.invoice_number) parts.push(`Invoice: ${form.invoice_number}`);
    if (form.payment_method) parts.push(`Payment: ${form.payment_method}`);
    if (editLineItems.length > 0) parts.push(`${editLineItems.length} item(s)`);
    if (form.subtotal) parts.push(`Subtotal: ${form.subtotal}`);
    if (form.tax_amount) parts.push(`Tax: ${form.tax_amount}`);
    if (form.discount) parts.push(`Discount: ${form.discount}`);
    if (form.description) parts.push(form.description);
    let desc = parts.join(' | ');
    if (editLineItems.length > 0) {
      desc += `${LINE_ITEMS_MARKER}${JSON.stringify(editLineItems)}::END_ITEMS::`;
    }
    return desc;
  };

  const val = (v: any) => v && v !== 'Not Found' ? v : null;
  const recalcTotal = (items: LineItem[]) => {
    const subtotal = items.reduce((s, i) => s + (i.total_price || 0), 0);
    const tax = Number(form.tax_amount) || 0;
    const discount = Number(form.discount) || 0;
    setForm(f => ({ ...f, subtotal: String(subtotal), amount: String(subtotal + tax - discount) }));
  };
  const isValid = (form.merchant.trim() || form.title.trim()) && form.amount && parseFloat(form.amount) > 0;
  const currencySymbol = getCurrencySymbol(form.currency);

  // ─── SUCCESS SCREEN ───
  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in zoom-in-95 duration-500">
        <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center mb-4 animate-bounce">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1">
          {editId ? 'Bill Updated!' : 'Bill Saved!'}
        </h2>
        <p className="text-sm text-muted-foreground">Redirecting to your bills...</p>
      </div>
    );
  }

  // ─── UPLOAD/SCAN/EDIT PAGE ───
  if (mode === 'upload' || mode === 'scan' || editId) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pb-24">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">
            {editId ? 'Edit Bill' : mode === 'scan' ? 'Scan Bill' : 'Upload Bill'}
          </h1>
        </div>

        {/* Upload Area */}
        {!editId && !receiptFile && !isExtracting && (
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  {mode === 'scan'
                    ? <Camera className="h-10 w-10 text-primary" />
                    : <FileImage className="h-10 w-10 text-primary" />
                  }
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground mb-1">
                    {mode === 'scan' ? 'Take a Photo' : 'Upload from Gallery'}
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    Supports <span className="text-foreground font-medium">PNG, JPEG, HEIC, PDF</span> up to 7MB.
                    AI will extract all bill details automatically.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-full">
                    <Store className="h-3 w-3" /> Smart Merchant Detection
                  </span>
                  <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-full">
                    <Package className="h-3 w-3" /> Auto Item Extraction
                  </span>
                  <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-full">
                    <IndianRupee className="h-3 w-3" /> Amount & Tax
                  </span>
                  <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-full">
                    <CreditCard className="h-3 w-3" /> Payment Method
                  </span>
                </div>
                <Button size="lg" className="w-full max-w-xs min-h-[48px] mt-2"
                  onClick={() => (mode === 'scan' ? scanInputRef : uploadInputRef).current?.click()}>
                  <Upload className="h-5 w-5 mr-2" />
                  {mode === 'scan' ? 'Open Camera' : 'Choose File'}
                </Button>
                <input ref={scanInputRef} type="file" accept="image/*" capture="environment"
                  className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ''; }} />
                <input ref={uploadInputRef} type="file" accept="image/*,.pdf,.heic,.heif"
                  className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ''; }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Extracting State */}
        {isExtracting && (
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Extracting Bill Details...</p>
                <p className="text-xs text-muted-foreground mt-1">AI is reading your bill. This takes a few seconds.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Extraction Complete or Edit Mode — Tabs */}
        {((receiptFile && !isExtracting) || editId) && (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-2 bg-secondary/50">
                <TabsTrigger value="ebill" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Receipt className="h-4 w-4 mr-1.5" /> E-Bill
                </TabsTrigger>
                <TabsTrigger value="original" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Eye className="h-4 w-4 mr-1.5" /> Original Bill
                </TabsTrigger>
              </TabsList>

              {/* ─── ORIGINAL BILL TAB ─── */}
              <TabsContent value="original" className="mt-3">
                <Card className="border-0 bg-card/80 backdrop-blur overflow-hidden">
                  <CardContent className="p-2">
                    <div className="rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center min-h-[300px]">
                      {receiptPreviewUrl && (receiptFile?.type === 'application/pdf' || receiptPreviewUrl.includes('.pdf')) ? (
                        <iframe src={receiptPreviewUrl} className="w-full h-[60vh] rounded" title="Bill PDF" />
                      ) : receiptPreviewUrl ? (
                        <img src={receiptPreviewUrl} alt="Bill" className="max-w-full max-h-[60vh] object-contain" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                          <FileText className="h-10 w-10 opacity-40" />
                          <p className="text-sm">No original bill attached</p>
                        </div>
                      )}
                    </div>
                    {receiptFile && (
                      <div className="flex items-center gap-2 mt-3 px-2 pb-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate flex-1">{receiptFile.name}</span>
                        <span className="text-xs text-muted-foreground">{(receiptFile.size / 1024).toFixed(0)} KB</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setReceiptFile(null);
                          if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
                          setReceiptPreviewUrl(null);
                          setExtractionData(null);
                          setEditLineItems([]);
                        }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── E-BILL TAB ─── */}
              <TabsContent value="ebill" className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-semibold text-foreground">Smart E-Bill</span>
                    {extractionData?.total_items ? (
                      <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                        {extractionData.total_items} items
                      </span>
                    ) : null}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setIsEditing(!isEditing)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {isEditing ? 'Done' : 'Edit'}
                  </Button>
                </div>

                {/* Merchant & Core Info */}
                <Card className="border-0 bg-card/80 backdrop-blur">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <EBillField icon={Store} label="Merchant" value={form.merchant}
                      editing={isEditing} onChange={v => setForm(f => ({ ...f, merchant: v }))} />
                    {/* Category */}
                    {isEditing ? (
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Category</label>
                        <Select value={form.category_name} onValueChange={v => {
                          const match = categories.find(c => c.name === v);
                          setForm(f => ({ ...f, category_name: v, category_id: match?.id || '' }));
                        }}>
                          <SelectTrigger className="min-h-[40px] bg-secondary/30 border-border/30">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <EBillField icon={Package} label="Category" value={form.category_name || 'Not detected'} editing={false} />
                    )}
                    <EBillField icon={Hash} label="Invoice Number" value={form.invoice_number}
                      editing={isEditing} onChange={v => setForm(f => ({ ...f, invoice_number: v }))} />
                    {/* Date */}
                    {isEditing ? (
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Date</label>
                        <Input type="date" value={form.expense_date}
                          onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                          className="min-h-[40px] bg-secondary/30 border-border/30" />
                      </div>
                    ) : (
                      <EBillField icon={Calendar} label="Date" value={form.expense_date} editing={false} />
                    )}
                    <EBillField icon={CreditCard} label="Payment Method" value={form.payment_method}
                      editing={isEditing} onChange={v => setForm(f => ({ ...f, payment_method: v }))} />
                    {/* Currency */}
                    {isEditing ? (
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Currency</label>
                        <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                          <SelectTrigger className="min-h-[40px] bg-secondary/30 border-border/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <EBillField icon={IndianRupee} label="Currency" value={`${currencySymbol} ${form.currency}`} editing={false} />
                    )}
                  </CardContent>
                </Card>

                {/* Line Items */}
                {editLineItems.length > 0 && (
                  <Card className="border-0 bg-card/80 backdrop-blur">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">
                        Items ({editLineItems.length})
                      </p>
                      <div className="space-y-2">
                        {editLineItems.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
                            <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <>
                                  <Input value={item.name} className="text-sm h-8 mb-1 bg-secondary/30 border-border/30"
                                    placeholder="Item name"
                                    onChange={e => {
                                      const updated = [...editLineItems];
                                      updated[i] = { ...updated[i], name: e.target.value };
                                      setEditLineItems(updated);
                                    }} />
                                  <div className="flex gap-2 mt-1">
                                    <div className="flex-1">
                                      <label className="text-[9px] text-muted-foreground">Qty</label>
                                      <Input type="number" min="1" value={item.quantity} className="text-xs h-7 bg-secondary/30 border-border/30"
                                        onChange={e => {
                                          const updated = [...editLineItems];
                                          const qty = Math.max(1, Number(e.target.value) || 1);
                                          updated[i] = { ...updated[i], quantity: qty, total_price: qty * updated[i].unit_price };
                                          setEditLineItems(updated);
                                          recalcTotal(updated);
                                        }} />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-[9px] text-muted-foreground">Unit {currencySymbol}</label>
                                      <Input type="number" step="0.01" value={item.unit_price} className="text-xs h-7 bg-secondary/30 border-border/30"
                                        onChange={e => {
                                          const updated = [...editLineItems];
                                          const price = Number(e.target.value) || 0;
                                          updated[i] = { ...updated[i], unit_price: price, total_price: updated[i].quantity * price };
                                          setEditLineItems(updated);
                                          recalcTotal(updated);
                                        }} />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              )}
                              {!isEditing && (
                                <p className="text-[11px] text-muted-foreground">
                                  Qty: {item.quantity} × {currencySymbol}{item.unit_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <p className="text-sm font-semibold text-foreground tabular-nums">
                                {currencySymbol}{item.total_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </p>
                              {isEditing && (
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                  const updated = editLineItems.filter((_, j) => j !== i);
                                  setEditLineItems(updated);
                                  recalcTotal(updated);
                                }}>
                                  <X className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {isEditing && (
                          <Button variant="outline" size="sm" className="w-full mt-2 text-xs min-h-[36px] border-dashed"
                            onClick={() => {
                              const updated = [...editLineItems, { name: '', quantity: 1, unit_price: 0, total_price: 0 }];
                              setEditLineItems(updated);
                            }}>
                            + Add Item
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Amount Summary */}
                <Card className="border-0 bg-card/80 backdrop-blur">
                  <CardContent className="pt-4 pb-4 space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Bill Summary</p>
                    {val(form.subtotal) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        {isEditing ? (
                          <Input value={form.subtotal} type="number" step="0.01"
                            className="w-28 text-right text-xs h-7 bg-secondary/30 border-border/30"
                            onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} />
                        ) : (
                          <span className="text-foreground">{currencySymbol}{Number(form.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        )}
                      </div>
                    )}
                    {(val(form.tax_amount) || isEditing) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax {extractionData?.tax_details && extractionData.tax_details !== 'Not Found' ? `(${extractionData.tax_details})` : ''}</span>
                        {isEditing ? (
                          <Input value={form.tax_amount} type="number" step="0.01"
                            className="w-28 text-right text-xs h-7 bg-secondary/30 border-border/30"
                            onChange={e => setForm(f => ({ ...f, tax_amount: e.target.value }))} />
                        ) : (
                          <span className="text-foreground">{currencySymbol}{Number(form.tax_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        )}
                      </div>
                    )}
                    {(val(form.discount) || isEditing) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount</span>
                        {isEditing ? (
                          <Input value={form.discount} type="number" step="0.01"
                            className="w-28 text-right text-xs h-7 bg-secondary/30 border-border/30"
                            onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} />
                        ) : (
                          <span className="text-green-500">-{currencySymbol}{Number(form.discount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-border/30">
                      <span className="font-semibold text-foreground">Total</span>
                      {isEditing ? (
                        <Input value={form.amount} type="number" step="0.01"
                          className="w-32 text-right font-bold bg-secondary/30 border-border/30 h-9"
                          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                      ) : (
                        <span className="text-lg font-bold text-gold">
                          {currencySymbol}{form.amount ? Number(form.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Description */}
                {isEditing && (
                  <Card className="border-0 bg-card/80 backdrop-blur">
                    <CardContent className="pt-4 pb-4">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Notes</label>
                      <Textarea value={form.description} placeholder="Add any notes..."
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className="mt-1 bg-secondary/30 border-border/30" rows={2} />
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <Button className="w-full min-h-[48px] text-sm font-semibold" disabled={isSubmitting || !isValid}
                    onClick={handleSubmit}>
                    {isSubmitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" /> {editId ? 'Update Bill' : 'Confirm & Save Bill'}</>
                    )}
                  </Button>
                  {editId && (
                    <Button variant="destructive" className="w-full min-h-[44px] text-xs" onClick={handleDelete}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Bill
                    </Button>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    );
  }

  // ─── MANUAL ENTRY PAGE ───
  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">{editId ? 'Edit Bill' : 'Add Bill Manually'}</h1>
      </div>

      <Card className="border-0 bg-card/80 backdrop-blur">
        <CardContent className="pt-5 space-y-4">
          <div className="grid gap-3 grid-cols-1">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Title <span className="text-destructive">*</span></Label>
              <Input className="min-h-[44px] bg-secondary/30 border-border/30" placeholder="e.g., Lunch at office"
                value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Merchant</Label>
              <Input className="min-h-[44px] bg-secondary/30 border-border/30" placeholder="e.g., Zomato, Shell"
                value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="min-h-[44px] bg-secondary/30 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Amount <span className="text-destructive">*</span></Label>
              <Input className="min-h-[44px] bg-secondary/30 border-border/30" type="number" step="0.01" min="0" placeholder="0.00"
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Date <span className="text-destructive">*</span></Label>
              <Input className="min-h-[44px] bg-secondary/30 border-border/30" type="date"
                value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} required />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Category</Label>
            <Select value={form.category_name} onValueChange={v => {
              const match = categories.find(c => c.name === v);
              setForm(f => ({ ...f, category_name: v, category_id: match?.id || '' }));
            }}>
              <SelectTrigger className="min-h-[44px] bg-secondary/30 border-border/30">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Payment Method</Label>
            <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
              <SelectTrigger className="min-h-[44px] bg-secondary/30 border-border/30">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet', 'Other'].map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea placeholder="Add any details..." value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="bg-secondary/30 border-border/30" rows={2} />
          </div>

          {!editId && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Attach Receipt (optional)</Label>
              {receiptFile ? (
                <div className="flex items-center gap-3 rounded-lg bg-secondary/30 p-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-xs truncate flex-1">{receiptFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                    setReceiptFile(null);
                    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
                    setReceiptPreviewUrl(null);
                  }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 bg-secondary/20 p-4 cursor-pointer hover:bg-secondary/30 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tap to attach receipt</span>
                  <input type="file" accept="image/*,.pdf,.heic,.heif" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setReceiptFile(f); setReceiptPreviewUrl(URL.createObjectURL(f)); }
                  }} />
                </label>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-border/30">
            <Button className="w-full min-h-[48px]" disabled={isSubmitting || !isValid} onClick={handleSubmit}>
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Save Bill</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EBillField({ icon: Icon, label, value, editing, onChange }: {
  icon: any; label: string; value: string; editing: boolean; onChange?: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {editing && onChange ? (
          <Input value={value} onChange={e => onChange(e.target.value)}
            className="h-8 text-sm mt-0.5 bg-secondary/30 border-border/30" />
        ) : (
          <p className={`text-sm font-medium truncate ${value && value !== 'Not detected' ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {value || 'Not detected'}
          </p>
        )}
      </div>
    </div>
  );
}
