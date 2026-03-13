import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
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
      user_id: user.id,
      title: form.title,
      merchant: form.merchant,
      amount: parseFloat(form.amount),
      expense_date: form.expense_date,
      category_id: form.category_id || null,
      cost_center: form.cost_center,
      description: form.description,
      status: asDraft ? 'draft' : 'submitted',
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
          expense_id: (expense as any).id,
          file_path: filePath,
          file_name: receiptFile.name,
        } as any);
      }
    }

    await supabase.from('audit_logs').insert({
      expense_id: (expense as any).id,
      user_id: user.id,
      action: asDraft ? 'created_draft' : 'submitted',
      details: { amount: form.amount, title: form.title },
    } as any);

    toast({ title: asDraft ? 'Draft saved' : 'Expense submitted' });
    setIsSubmitting(false);
    navigate('/expenses');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">New Expense</h1>
      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => handleSubmit(e, false)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" className="min-h-[44px]" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="merchant">Merchant</Label>
                <Input id="merchant" className="min-h-[44px]" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($) *</Label>
                <Input id="amount" className="min-h-[44px]" type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" className="min-h-[44px]" type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost_center">Cost Center</Label>
              <Input id="cost_center" className="min-h-[44px]" value={form.cost_center} onChange={e => setForm({ ...form, cost_center: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt">Receipt (optional)</Label>
              <Input id="receipt" className="min-h-[44px]" type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button type="submit" className="w-full sm:w-auto min-h-[44px]" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Expense'}
              </Button>
              <Button type="button" variant="outline" className="w-full sm:w-auto min-h-[44px]" disabled={isSubmitting} onClick={e => handleSubmit(e as any, true)}>
                Save as Draft
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
