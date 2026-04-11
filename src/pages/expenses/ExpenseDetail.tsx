import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Store, Package, Hash, Calendar, CreditCard, IndianRupee,
  Receipt, Eye, Users, Pencil, FileText, Trash2, Headphones
} from 'lucide-react';
import type { Expense } from '@/lib/types';
import { getCurrencySymbol } from '@/lib/countries';
import { smartCategoryFromMerchant } from '@/lib/smart-category';

interface LineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

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
  clean = clean.replace(/Category:\s*[^|]+\|?\s*/g, '').replace(/Invoice:\s*[^|]+\|?\s*/g, '').replace(/Payment:\s*[^|]+\|?\s*/g, '')
    .replace(/\d+ item\(s\)\s*\|?\s*/g, '').replace(/Tax:\s*[^|]+\|?\s*/g, '')
    .replace(/TaxDetails:\s*[^|]+\|?\s*/g, '')
    .replace(/Discount:\s*[^|]+\|?\s*/g, '').replace(/Subtotal:\s*[^|]+\|?\s*/g, '')
    .replace(/From email:\s*[^|]+\|?\s*/g, '').replace(/\[Subscription\]\s*\|?\s*/g, '');
  return clean.replace(/\|\s*$/g, '').trim();
}

function parseField(description: string | null | undefined, key: string): string {
  if (!description) return '';
  const match = description.match(new RegExp(`${key}:\\s*([^|]+)`));
  return match ? match[1].trim() : '';
}

export default function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ebill');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('expenses').select('*').eq('id', id).single(),
      supabase.from('expense_receipts').select('*').eq('expense_id', id).limit(1),
    ]).then(async ([expRes, receiptRes]) => {
      setExpense(expRes.data as unknown as Expense);

      const receipts = receiptRes.data as any[];
      if (receipts && receipts.length > 0) {
        setReceiptName(receipts[0].file_name || '');
        const { data: signedData } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receipts[0].file_path, 3600);
        if (signedData?.signedUrl) {
          setReceiptUrl(signedData.signedUrl);
        }
      }
      setLoading(false);
    });
  }, [id]);

  const handleDelete = async () => {
    if (!expense || !confirm('Delete this bill permanently?')) return;
    await supabase.from('processed_emails').delete().eq('expense_id', expense.id);
    await supabase.from('expense_receipts').delete().eq('expense_id', expense.id);
    await supabase.from('expenses').delete().eq('id', expense.id);
    toast({ title: 'Bill deleted' });
    navigate('/expenses');
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
    </div>
  );
  if (!expense) return (
    <div className="text-center py-20">
      <p className="text-destructive font-medium">Bill not found.</p>
      <Button asChild variant="ghost" className="mt-4"><Link to="/expenses">Back to All Bills</Link></Button>
    </div>
  );

  const invoiceNum = parseField(expense.description, 'Invoice');
  const paymentMethod = expense.cost_center || parseField(expense.description, 'Payment') || '—';
  const lineItems = parseStoredLineItems(expense.description);
  const notes = cleanDescription(expense.description);
  const rawSubtotal = parseField(expense.description, 'Subtotal');
  const rawTax = parseField(expense.description, 'Tax');
  const rawTaxDetails = parseField(expense.description, 'TaxDetails');
  const rawDiscount = parseField(expense.description, 'Discount');
  // Safe number formatting — avoid NaN
  const safeNum = (v: string) => { const n = Number(v); return !isNaN(n) && n > 0 ? n : 0; };
  const subtotal = safeNum(rawSubtotal);
  const taxAmount = safeNum(rawTax);
  const discount = safeNum(rawDiscount);
  // Smart discount: if items total > amount and no stored discount
  const itemsSum = lineItems.reduce((s, i) => s + (Number(i.total_price) || 0), 0);
  const inferredDiscount = !discount && itemsSum > 0 && Number(expense.amount) > 0 && (itemsSum + taxAmount) > Number(expense.amount) + 0.5
    ? Math.round(((itemsSum + taxAmount) - Number(expense.amount)) * 100) / 100 : discount;
  const currencySymbol = getCurrencySymbol(expense.currency || 'INR');
  const savedCategory = parseField(expense.description, 'Category');
  const categoryLabel = savedCategory || smartCategoryFromMerchant(expense.merchant || '', expense.title);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate('/expenses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground truncate flex-1">{expense.merchant || expense.title}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-secondary/50">
          <TabsTrigger value="ebill" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Receipt className="h-4 w-4 mr-1.5" /> E-Bill
          </TabsTrigger>
          <TabsTrigger value="original" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Eye className="h-4 w-4 mr-1.5" /> Original Bill
          </TabsTrigger>
        </TabsList>

        {/* ─── E-BILL TAB ─── */}
        <TabsContent value="ebill" className="mt-3 space-y-3">
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="pt-4 pb-4 space-y-3">
              <EBillRow icon={Store} label="Merchant" value={expense.merchant || '—'} />
              <EBillRow icon={Package} label="Category" value={categoryLabel} />
              <EBillRow icon={Hash} label="Invoice Number" value={invoiceNum || '—'} />
              <EBillRow icon={Calendar} label="Date" value={new Date(expense.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
              <EBillRow icon={CreditCard} label="Payment Method" value={paymentMethod} />
              <EBillRow icon={IndianRupee} label="Currency" value={`${currencySymbol} ${expense.currency || 'INR'}`} />
            </CardContent>
          </Card>

          {lineItems.length > 0 && (
            <Card className="border-0 bg-card/80 backdrop-blur">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Items ({lineItems.length})</p>
                <div className="space-y-2">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {currencySymbol}{Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums ml-3">
                        {currencySymbol}{Number(item.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {notes && (
            <Card className="border-0 bg-card/80 backdrop-blur">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Notes</p>
                <p className="text-sm text-foreground leading-relaxed">{notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Amount Breakdown */}
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="pt-4 pb-4 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Bill Summary</p>
              {subtotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{currencySymbol}{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax {rawTaxDetails ? `(${rawTaxDetails})` : ''}</span>
                  <span className="text-foreground">{currencySymbol}{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {inferredDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-500">-{currencySymbol}{inferredDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className={`flex justify-between items-center ${(subtotal > 0 || taxAmount > 0 || inferredDiscount > 0) ? 'pt-2 border-t border-border/30' : ''}`}>
                <span className="font-semibold text-foreground">Total Amount</span>
                <span className="text-lg font-bold text-gold tabular-nums">
                  {currencySymbol}{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ORIGINAL BILL TAB ─── */}
        <TabsContent value="original" className="mt-3">
          <Card className="border-0 bg-card/80 backdrop-blur overflow-hidden">
            <CardContent className="p-2">
              <div className="rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center min-h-[300px]">
                {receiptUrl ? (
                  receiptName.toLowerCase().endsWith('.pdf') ? (
                    <iframe src={receiptUrl} className="w-full h-[60vh] rounded" title="Bill PDF" />
                  ) : (
                    <img src={receiptUrl} alt="Original Bill" className="max-w-full max-h-[60vh] object-contain" />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 opacity-40" />
                    <p className="text-sm">No original bill attached</p>
                  </div>
                )}
              </div>
              {receiptName && (
                <div className="flex items-center gap-2 mt-3 px-2 pb-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate flex-1">{receiptName}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2 pt-2">
        <Button variant="outline" className="min-h-[44px] text-xs"
          onClick={() => navigate(`/expenses/new?edit=${expense.id}`)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button variant="outline" className="min-h-[44px] text-xs"
          onClick={() => navigate(`/expenses/${expense.id}/split`)}>
          <Users className="h-3.5 w-3.5 mr-1" /> Split
        </Button>
        <Button variant="outline" className="min-h-[44px] text-xs"
          onClick={() => navigate(`/expenses/${expense.id}/support`)}>
          <Headphones className="h-3.5 w-3.5 mr-1" /> Support
        </Button>
      </div>

      <Button variant="destructive" className="w-full min-h-[48px] text-sm" onClick={handleDelete}>
        <Trash2 className="h-4 w-4 mr-2" /> Delete Bill
      </Button>
    </div>
  );
}

function EBillRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-sm font-medium truncate ${value && value !== '—' ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
