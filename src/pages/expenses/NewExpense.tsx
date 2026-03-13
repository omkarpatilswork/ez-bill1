import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, FileText, X } from 'lucide-react';
import type { ExpenseCategory } from '@/lib/types';

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

  useEffect(() => {
    supabase.from('expense_categories').select('*').then(({ data }) => {
      setCategories((data as unknown as ExpenseCategory[]) || []);
    });
  }, []);

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
        <p className="text-sm text-muted-foreground mt-1">Fill in the details below. Fields marked with * are required.</p>
      </div>

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

            {/* Receipt Upload */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Receipt</Label>
              {receiptFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{receiptFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(receiptFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setReceiptFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/30 p-6 cursor-pointer transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload a receipt (image or PDF)</span>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
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
    </div>
  );
}
