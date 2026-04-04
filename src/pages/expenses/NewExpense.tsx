import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, FileText, X, ScanLine, Eye, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ExpenseCategory } from '@/lib/types';

interface ExtractedData {
  merchant_name?: string;
  amount?: number | null;
  date_time?: string;
  bill_invoice_number?: string;
  category?: string;
}

export default function NewExpense() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '', merchant: '', amount: '', expense_date: new Date().toISOString().slice(0, 10),
    category_id: '', cost_center: '', description: '',
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractedData | null>(null);
  const [extractionApplied, setExtractionApplied] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('expense_categories').select('*').then(({ data }) => {
      setCategories((data as unknown as ExpenseCategory[]) || []);
    });
  }, []);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // strip data:...;base64,
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleScanReceipt = async (file: File) => {
    setReceiptFile(file);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(URL.createObjectURL(file));
    setIsExtracting(true);
    setExtractionResult(null);
    setExtractionApplied(false);

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-receipt', {
        body: { file_base64: base64, file_type: file.type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setExtractionResult(data);
      toast({ title: 'Receipt scanned', description: 'Fields extracted successfully. Review and apply below.' });
    } catch (err: any) {
      console.error('Extraction error:', err);
      toast({ title: 'Scan failed', description: err.message || 'Could not extract details from receipt.', variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  };

  const applyExtraction = () => {
    if (!extractionResult) return;
    const matchCategory = (name?: string) => {
      if (!name || name === 'Not Found') return '';
      const match = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
      return match?.id || '';
    };

    setForm(prev => ({
      ...prev,
      title: extractionResult.bill_invoice_number && extractionResult.bill_invoice_number !== 'Not Found'
        ? `Invoice ${extractionResult.bill_invoice_number}`
        : extractionResult.merchant_name && extractionResult.merchant_name !== 'Not Found'
          ? `Expense at ${extractionResult.merchant_name}`
          : prev.title,
      merchant: extractionResult.merchant_name && extractionResult.merchant_name !== 'Not Found'
        ? extractionResult.merchant_name : prev.merchant,
      amount: extractionResult.amount != null ? String(extractionResult.amount) : prev.amount,
      expense_date: extractionResult.date_time && extractionResult.date_time !== 'Not Found'
        ? extractionResult.date_time.slice(0, 10) : prev.expense_date,
      category_id: matchCategory(extractionResult.category) || prev.category_id,
      description: extractionResult.bill_invoice_number && extractionResult.bill_invoice_number !== 'Not Found'
        ? `Invoice #${extractionResult.bill_invoice_number}` : prev.description,
    }));
    setExtractionApplied(true);
    toast({ title: 'Fields applied', description: 'Extracted data has been filled in. You can edit any field before submitting.' });
  };

  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    const { data: expense, error } = await supabase.from('expenses').insert({
      user_id: user.id, title: form.title, merchant: form.merchant,
      amount: parseFloat(form.amount), expense_date: form.expense_date,
      category_id: form.category_id || null, cost_center: form.cost_center,
      description: form.description, status: asDraft ? 'draft' : 'submitted',
    } as any).select().single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }

    if (receiptFile && expense) {
      const filePath = `${user.id}/${(expense as any).id}/${receiptFile.name}`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, receiptFile);
      if (!uploadError) {
        await supabase.from('expense_receipts').insert({
          expense_id: (expense as any).id, file_path: filePath, file_name: receiptFile.name,
        } as any);
      }
    }

    await supabase.from('audit_logs').insert({
      expense_id: (expense as any).id, user_id: user.id,
      action: asDraft ? 'created_draft' : 'submitted',
      details: { amount: form.amount, title: form.title },
    } as any);

    toast({ title: asDraft ? 'Draft saved' : 'Expense submitted', description: asDraft ? 'You can submit it later from My Expenses.' : 'Your expense is now pending approval.' });
    setIsSubmitting(false);
    navigate('/expenses');
  };

  const isValid = form.title.trim() && form.amount && parseFloat(form.amount) > 0 && form.expense_date;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild className="h-8 px-2">
          <Link to="/expenses"><ArrowLeft className="h-4 w-4 mr-1" /> Expenses</Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">New Expense</span>
      </div>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">New Expense</h1>
        <p className="text-sm text-muted-foreground mt-1">Fill in manually or scan a receipt to auto-fill. Fields marked with * are required.</p>
      </div>

      {/* Scan Receipt Card */}
      <Card className="shadow-md border-0 bg-primary/5">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ScanLine className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Scan Receipt</h3>
              </div>
              <p className="text-xs text-muted-foreground">Upload a receipt image or PDF to auto-extract expense details using AI.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="min-h-[44px] flex-1 sm:flex-initial"
                disabled={isExtracting}
                onClick={() => scanInputRef.current?.click()}
              >
                {isExtracting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Upload & Scan</>
                )}
              </Button>
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleScanReceipt(f);
                  e.target.value = '';
                }}
              />
              {receiptPreviewUrl && (
                <Button type="button" variant="outline" size="sm" className="min-h-[44px]" onClick={() => setShowPreview(true)}>
                  <Eye className="h-4 w-4 mr-1" /> Preview
                </Button>
              )}
            </div>
          </div>

          {/* Extraction Results */}
          {extractionResult && (
            <div className="mt-4 rounded-lg border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-foreground">Extracted Fields</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={extractionApplied ? 'outline' : 'default'}
                  className="min-h-[36px]"
                  onClick={applyExtraction}
                  disabled={extractionApplied}
                >
                  {extractionApplied ? 'Applied ✓' : 'Apply to Form'}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {([
                  ['Merchant', extractionResult.merchant_name],
                  ['Amount', extractionResult.amount != null ? `$${extractionResult.amount}` : null],
                  ['Date', extractionResult.date_time],
                  ['Invoice #', extractionResult.bill_invoice_number],
                  ['Category', extractionResult.category],
                ] as [string, any][]).map(([label, value]) => (
                  <div key={label} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                    <span className="text-muted-foreground text-xs font-medium min-w-[70px]">{label}</span>
                    <span className={`text-foreground text-xs font-medium truncate ${(!value || value === 'Not Found') ? 'text-muted-foreground italic' : ''}`}>
                      {(!value || value === 'Not Found') ? 'Not found' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Form Card */}
      <Card className="shadow-md border-0">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Expense Details</CardTitle>
          <CardDescription className="text-xs">Provide the basic information about this expense</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => handleSubmit(e, false)} className="space-y-5">
            {/* Title & Merchant */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-sm font-medium">Title <span className="text-destructive">*</span></Label>
                <Input id="title" className="min-h-[44px]" placeholder="e.g., Flight to NYC" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="merchant" className="text-sm font-medium">Merchant</Label>
                <Input id="merchant" className="min-h-[44px]" placeholder="e.g., Delta Airlines" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} />
              </div>
            </div>

            {/* Amount, Date, Category */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-sm font-medium">Amount ($) <span className="text-destructive">*</span></Label>
                <Input id="amount" className="min-h-[44px]" type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-sm font-medium">Date <span className="text-destructive">*</span></Label>
                <Input id="date" className="min-h-[44px]" type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cost Center */}
            <div className="space-y-1.5">
              <Label htmlFor="cost_center" className="text-sm font-medium">Cost Center</Label>
              <Input id="cost_center" className="min-h-[44px]" placeholder="e.g., Engineering, Sales" value={form.cost_center} onChange={e => setForm({ ...form, cost_center: e.target.value })} />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-sm font-medium">Description</Label>
              <Textarea id="description" placeholder="Add any relevant details about this expense..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>

            {/* Receipt Upload (manual, without scan) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Receipt</Label>
              {receiptFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{receiptFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(receiptFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <div className="flex gap-1">
                    {receiptPreviewUrl && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowPreview(true)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                      setReceiptFile(null);
                      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
                      setReceiptPreviewUrl(null);
                      setExtractionResult(null);
                      setExtractionApplied(false);
                    }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/30 p-6 cursor-pointer transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload a receipt (image or PDF)</span>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setReceiptFile(f);
                      setReceiptPreviewUrl(URL.createObjectURL(f));
                    }
                  }} />
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-border">
              <Button type="submit" className="w-full sm:w-auto min-h-[44px]" disabled={isSubmitting || !isValid}>
                {isSubmitting ? 'Submitting...' : 'Submit Expense'}
              </Button>
              <Button type="button" variant="outline" className="w-full sm:w-auto min-h-[44px]" disabled={isSubmitting || !isValid} onClick={e => handleSubmit(e as any, true)}>
                Save as Draft
              </Button>
              <Button type="button" variant="ghost" className="w-full sm:w-auto min-h-[44px]" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Receipt Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Receipt Preview
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] rounded-lg border border-border bg-muted/20 flex items-center justify-center p-2">
            {receiptPreviewUrl && receiptFile && (
              receiptFile.type === 'application/pdf' ? (
                <iframe src={receiptPreviewUrl} className="w-full h-[65vh] rounded" title="Receipt PDF" />
              ) : (
                <img src={receiptPreviewUrl} alt="Receipt" className="max-w-full max-h-[65vh] object-contain rounded" />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
