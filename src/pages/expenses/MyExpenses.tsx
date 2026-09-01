import SEO from '@/components/SEO';
import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Search, Receipt, Utensils, Fuel, Car, ParkingCircle, ShoppingBag, Zap,
  MoreHorizontal, Repeat, Trash2, X, CheckSquare, Loader2, AlertCircle,
  ArrowUpDown, Hotel, Plane, GraduationCap, Gamepad2, Briefcase, Pill, Nfc
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Expense } from '@/lib/types';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from '@/lib/smart-category';
import { getCurrencySymbol } from '@/lib/countries';
import NfcReceipt from '@/components/bills/NfcReceipt';

const NFC_FILTER = '__nfc';

function isNfcBill(e: Expense): boolean {
  const d = (e.description || '').toLowerCase();
  return d.includes('[nfc]') || d.includes('via nfc tag') || d.includes('tapped at');
}

interface DuplicateGroup {
  merchant: string;
  amount: number;
  expense_date: string;
  ids: string[];
}

const BROAD_CATEGORY_MAP: Record<string, string> = {
  'food & dining': 'Food & Dining', 'food': 'Food & Dining', 'dining': 'Food & Dining',
  'meals': 'Food & Dining', 'restaurant': 'Food & Dining', 'grocery': 'Grocery',
  'supermarket': 'Grocery', 'petrol & fuel': 'Fuel', 'petrol': 'Fuel', 'fuel': 'Fuel',
  'toll': 'Toll & Parking', 'parking': 'Toll & Parking', 'shopping': 'Shopping',
  'retail': 'Shopping', 'utilities': 'Utilities', 'software': 'Subscriptions',
  'subscription': 'Subscriptions', 'travel': 'Travel', 'flight': 'Travel', 'train': 'Travel',
  'transportation': 'Transport', 'transport': 'Transport', 'cab': 'Transport',
  'accommodation': 'Hotel & Stay', 'hotel': 'Hotel & Stay', 'resort': 'Hotel & Stay',
  'stay': 'Hotel & Stay', 'airbnb': 'Hotel & Stay', 'lodge': 'Hotel & Stay',
  'medical': 'Medical', 'health': 'Medical', 'pharmacy': 'Medical',
  'entertainment': 'Entertainment', 'education': 'Education', 'training': 'Education',
  'office supplies': 'Office', 'other': 'Other',
};

function toBroadCategory(cat: string): string {
  const lower = cat.toLowerCase().trim();
  if (BROAD_CATEGORY_MAP[lower]) return BROAD_CATEGORY_MAP[lower];
  for (const [key, broad] of Object.entries(BROAD_CATEGORY_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return broad;
  }
  return 'Other';
}

const BROAD_CATEGORY_ICONS: Record<string, any> = {
  'Food & Dining': Utensils, 'Grocery': ShoppingBag, 'Fuel': Fuel,
  'Toll & Parking': ParkingCircle, 'Shopping': ShoppingBag, 'Subscriptions': Repeat,
  'Travel': Plane, 'Transport': Car, 'Hotel & Stay': Hotel, 'Medical': Pill,
  'Entertainment': Gamepad2, 'Education': GraduationCap, 'Utilities': Zap,
  'Office': Briefcase, 'Other': MoreHorizontal,
};

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'merchant_asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_desc', label: 'Newest first' },
  { key: 'date_asc', label: 'Oldest first' },
  { key: 'amount_desc', label: 'Amount: High → Low' },
  { key: 'amount_asc', label: 'Amount: Low → High' },
  { key: 'merchant_asc', label: 'Merchant: A → Z' },
];

function getSmartCategory(expense: Expense): string {
  const descMatch = (expense.description || '').match(/Category:\s*([^|]+)/);
  if (descMatch) {
    const saved = descMatch[1].trim();
    if (saved && saved !== 'Other') return saved;
  }
  const combined = `${expense.title} ${expense.merchant} ${expense.description} ${expense.cost_center}`;
  if (isSubscriptionMerchant(combined)) return 'Subscription';
  return smartCategoryFromMerchant(expense.merchant || '', expense.title);
}

export default function MyExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const { toast } = useToast();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);

  const fetchExpenses = () => {
    if (!user) return;
    setLoading(true);
    supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
  };

  useEffect(() => { fetchExpenses(); }, [user]);

  useEffect(() => {
    if (searchParams.get('checkDupes') === '1' && user) {
      detectDuplicates();
    }
  }, [searchParams, user]);

  const detectDuplicates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('expenses')
      .select('id, merchant, amount, expense_date, description')
      .eq('user_id', user.id);
    if (!data) return;

    const groups = new Map<string, { merchant: string; amount: number; expense_date: string; ids: string[] }>();
    for (const row of data as any[]) {
      const invoiceMatch = (row.description || '').match(/Invoice:\s*([^|]+)/);
      const invoice = invoiceMatch ? invoiceMatch[1].trim().toLowerCase() : '';
      const key = invoice
        ? `inv:${invoice}|${row.expense_date}`
        : `mrch:${(row.merchant || '').toLowerCase().trim()}|${row.amount}|${row.expense_date}`;

      if (!groups.has(key)) {
        groups.set(key, { merchant: row.merchant || 'Unknown', amount: row.amount, expense_date: row.expense_date, ids: [] });
      }
      groups.get(key)!.ids.push(row.id);
    }
    const dupes = Array.from(groups.values()).filter(g => g.ids.length > 1);
    if (dupes.length > 0) {
      setDuplicates(dupes);
      setShowDuplicateDialog(true);
    }
  };

  const deleteDuplicates = async () => {
    setIsDeletingDuplicates(true);
    let deleted = 0;
    for (const group of duplicates) {
      const toDelete = group.ids.slice(1);
      for (const id of toDelete) {
        await supabase.from('processed_emails').delete().eq('expense_id', id);
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (!error) deleted++;
      }
    }
    setIsDeletingDuplicates(false);
    setShowDuplicateDialog(false);
    setDuplicates([]);
    toast({ title: 'Duplicates removed', description: `Deleted ${deleted} duplicate bill(s).` });
    fetchExpenses();
  };

  const availableCategories = useMemo(() => {
    const catSet = new Set<string>();
    expenses.forEach(e => {
      const raw = getSmartCategory(e);
      catSet.add(toBroadCategory(raw));
    });
    return catSet;
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    let result = expenses.filter(e => {
      if (categoryFilter === NFC_FILTER) {
        if (!isNfcBill(e)) return false;
      } else if (categoryFilter !== 'all') {
        const broad = toBroadCategory(getSmartCategory(e));
        if (broad !== categoryFilter) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return e.title.toLowerCase().includes(q) || (e.merchant || '').toLowerCase().includes(q) || String(e.amount).includes(q) || (e.description || '').toLowerCase().includes(q);
      }
      return true;
    });


    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'date_desc': return new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
        case 'date_asc': return new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
        case 'amount_desc': return Number(b.amount) - Number(a.amount);
        case 'amount_asc': return Number(a.amount) - Number(b.amount);
        case 'merchant_asc': return (a.merchant || a.title).localeCompare(b.merchant || b.title);
        default: return 0;
      }
    });

    return result;
  }, [expenses, categoryFilter, searchQuery, sortKey]);

  const totalFiltered = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    await supabase.from('processed_emails').delete().in('expense_id', ids);
    const { error } = await supabase.from('expenses').delete().in('id', ids);
    setDeleting(false);
    setShowDeleteConfirm(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Deleted ${ids.length} bill${ids.length > 1 ? 's' : ''}` });
      setExpenses(prev => prev.filter(e => !selectedIds.has(e.id)));
      exitSelectMode();
    }
  };

  const nfcCount = useMemo(() => expenses.filter(isNfcBill).length, [expenses]);

  const categoryPills = useMemo(() => {
    const pills: { label: string; value: string; icon: any }[] = [
      { label: 'All', value: 'all', icon: Receipt },
    ];
    pills.push({ label: nfcCount > 0 ? `NFC Bills (${nfcCount})` : 'NFC Bills', value: NFC_FILTER, icon: Nfc });
    const order = ['Food & Dining', 'Grocery', 'Fuel', 'Toll & Parking', 'Shopping', 'Subscriptions', 'Travel', 'Transport', 'Hotel & Stay', 'Medical', 'Entertainment', 'Education', 'Utilities', 'Office', 'Other'];
    for (const cat of order) {
      if (availableCategories.has(cat)) {
        pills.push({ label: cat, value: cat, icon: BROAD_CATEGORY_ICONS[cat] || Receipt });
      }
    }
    return pills;
  }, [availableCategories, nfcCount]);


  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      <SEO title="All Bills" description="Browse, filter, and search all your imported and manually added bills in EZ Bill." path="/expenses" />

      {/* ━━━ HERO SUMMARY (2026 glass) ━━━ */}
      <div
        className="rounded-[28px] p-5 relative overflow-hidden"
        style={{
          background:
            'linear-gradient(150deg, hsla(160, 14%, 13%, 0.7) 0%, hsla(160, 12%, 9%, 0.55) 60%, hsla(152, 30%, 12%, 0.55) 100%)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid hsla(0, 0%, 100%, 0.06)',
          boxShadow:
            'inset 0 1px 0 0 hsla(0,0%,100%,0.08), inset 0 -1px 0 0 hsla(0,0%,0%,0.2), 0 24px 60px -20px hsla(152, 45%, 20%, 0.5)',
        }}
      >
        <div aria-hidden className="absolute -top-16 -right-12 h-48 w-48 rounded-full blur-3xl opacity-60 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(152, 70%, 45%, 0.32), transparent 70%)' }} />
        <div aria-hidden className="absolute -bottom-20 -left-10 h-44 w-44 rounded-full blur-3xl opacity-50 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(43, 80%, 50%, 0.2), transparent 70%)' }} />
        <div aria-hidden className="absolute inset-x-6 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, hsla(0,0%,100%,0.25), transparent)' }} />

        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">All Bills</p>
            </div>
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 rounded-full flex items-center justify-center text-foreground/80 transition active:scale-95"
                    style={{ background: 'hsla(0,0%,100%,0.06)', border: '1px solid hsla(0,0%,100%,0.08)' }}
                    aria-label="Sort">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px] glass-card border-border/30">
                  {SORT_OPTIONS.map(opt => (
                    <DropdownMenuItem
                      key={opt.key}
                      onClick={() => setSortKey(opt.key)}
                      className={sortKey === opt.key ? 'bg-primary/10 text-primary font-medium' : ''}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {!selectMode ? (
                <button onClick={() => setSelectMode(true)} aria-label="Select"
                  className="h-7 w-7 rounded-full flex items-center justify-center text-foreground/80 transition active:scale-95"
                  style={{ background: 'hsla(0,0%,100%,0.06)', border: '1px solid hsla(0,0%,100%,0.08)' }}>
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button onClick={exitSelectMode} aria-label="Cancel"
                  className="h-7 w-7 rounded-full flex items-center justify-center text-foreground/80 transition active:scale-95"
                  style={{ background: 'hsla(0,0%,100%,0.06)', border: '1px solid hsla(0,0%,100%,0.08)' }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-[28px] leading-none font-light text-foreground/60 tabular-nums">₹</span>
            <span className="text-[44px] leading-none font-semibold text-foreground tabular-nums tracking-tight">
              {Math.round(totalFiltered).toLocaleString('en-IN')}
            </span>
            <span className="ml-1 inline-flex items-center text-[10px] font-semibold px-2 py-1 rounded-full text-foreground/80"
              style={{ background: 'hsla(0,0%,100%,0.05)', border: '1px solid hsla(0,0%,100%,0.08)' }}>
              {filteredExpenses.length} bill{filteredExpenses.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {categoryFilter === 'all' ? 'Total across all categories' : categoryFilter === NFC_FILTER ? 'Bills received by tapping an NFC tag' : `Filtered · ${categoryFilter}`}
          </p>
        </div>
      </div>

      {selectMode && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll} className="text-xs glass-button border-0 rounded-full">
            {selectedIds.size === filteredExpenses.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0}
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs rounded-full"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete ({selectedIds.size})
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search bills, merchants, amounts..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 min-h-[44px] glass-card border-0 rounded-2xl focus-visible:ring-primary/30"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {categoryPills.map(cat => {
          const active = categoryFilter === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 active:scale-95"
              style={
                active
                  ? {
                      background: 'linear-gradient(135deg, hsla(152, 45%, 35%, 0.95), hsla(152, 45%, 28%, 0.95))',
                      border: '1px solid hsla(152, 60%, 50%, 0.35)',
                      color: 'hsl(var(--primary-foreground))',
                      boxShadow: '0 6px 18px -6px hsla(152, 60%, 30%, 0.55), inset 0 1px 0 0 hsla(0,0%,100%,0.15)',
                    }
                  : {
                      background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.55), hsla(160, 12%, 9%, 0.35))',
                      border: '1px solid hsla(0,0%,100%,0.06)',
                      color: 'hsl(var(--muted-foreground))',
                      backdropFilter: 'blur(16px) saturate(1.4)',
                      WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
                    }
              }
            >
              <cat.icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground glass-card rounded-2xl">
          <Receipt className="mx-auto h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium mb-1">{searchQuery || categoryFilter !== 'all' ? 'No matching bills' : 'No bills yet'}</p>
          <p className="text-sm">{searchQuery ? 'Try adjusting your search or filters.' : 'Add your first bill to get started.'}</p>
        </div>
      ) : categoryFilter === NFC_FILTER && !selectMode ? (
        <div className="space-y-7 pt-1">
          <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <Nfc className="h-3.5 w-3.5 text-primary animate-pulse" />
            Delivered by tap
          </div>
          {filteredExpenses.map((exp, i) => (
            <NfcReceipt
              key={exp.id}
              index={i}
              id={exp.id}
              merchant={exp.merchant || exp.title}
              amount={Number(exp.amount)}
              currencySymbol={getCurrencySymbol(exp.currency || 'INR')}
              date={exp.expense_date}
              description={exp.description}
              paymentMethod={exp.cost_center}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">

          {filteredExpenses.map(exp => {
            const rawCat = getSmartCategory(exp);
            const broadCat = toBroadCategory(rawCat);
            const CategoryIcon = BROAD_CATEGORY_ICONS[broadCat] || Receipt;
            const isSub = broadCat === 'Subscriptions';
            const isSelected = selectedIds.has(exp.id);
            const currSym = getCurrencySymbol(exp.currency || 'INR');

            const cardContent = (
              <div className="flex items-center gap-3">
                {selectMode && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(exp.id)}
                    className="shrink-0"
                  />
                )}
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: isSub
                      ? 'linear-gradient(135deg, hsla(280, 50%, 55%, 0.22), transparent)'
                      : 'linear-gradient(135deg, hsla(152, 45%, 45%, 0.22), transparent)',
                    border: `1px solid ${isSub ? 'hsla(280, 50%, 55%, 0.25)' : 'hsla(152, 45%, 45%, 0.22)'}`,
                  }}>
                  <CategoryIcon className={`h-5 w-5 ${isSub ? 'text-purple-400' : 'text-primary'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {exp.merchant || exp.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <span>{broadCat}</span>
                    {isSub && <span className="text-purple-400"> · Recurring</span>}
                    {exp.description && /\d+\s*item/i.test(exp.description) && (
                      <> · {exp.description.match(/(\d+\s*item[s]?)/i)?.[1]}</>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {exp.cost_center || 'UPI'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm text-foreground tabular-nums">
                    {currSym}{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
            );

            return selectMode ? (
              <div
                key={exp.id}
                onClick={() => toggleSelect(exp.id)}
                className={`block rounded-2xl p-3.5 cursor-pointer transition-all active:scale-[0.985] ${
                  isSelected ? 'border-destructive/30 bg-destructive/5' : ''
                }`}
                style={
                  isSelected
                    ? undefined
                    : {
                        background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.55), hsla(160, 12%, 9%, 0.35))',
                        backdropFilter: 'blur(20px) saturate(1.4)',
                        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                        border: '1px solid hsla(0,0%,100%,0.05)',
                        boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.05)',
                      }
                }
              >
                {cardContent}
              </div>
            ) : (
              <Link
                key={exp.id}
                to={`/expenses/${exp.id}`}
                className="block rounded-2xl p-3.5 transition-all active:scale-[0.985]"
                style={{
                  background: 'linear-gradient(160deg, hsla(160, 12%, 14%, 0.55), hsla(160, 12%, 9%, 0.35))',
                  backdropFilter: 'blur(20px) saturate(1.4)',
                  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                  border: '1px solid hsla(0,0%,100%,0.05)',
                  boxShadow: 'inset 0 1px 0 0 hsla(0,0%,100%,0.05)',
                }}
              >
                {cardContent}
              </Link>
            );
          })}
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[340px] rounded-2xl glass-card border-border/30">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} bill{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected bills will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto glass-card border-border/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gold" />
              Duplicate Bills Found
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {duplicates.length} group(s) of duplicate bills were found. Would you like to remove the extras?
            </p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {duplicates.map((group, idx) => (
                <div key={idx} className="glass-card rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{group.merchant || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        ₹{group.amount} · {new Date(group.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {group.ids.length} copies
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={deleteDuplicates}
                disabled={isDeletingDuplicates}
                variant="destructive"
                className="flex-1 min-h-[44px]"
              >
                {isDeletingDuplicates ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" /> Remove Duplicates</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDuplicateDialog(false)}
                disabled={isDeletingDuplicates}
                className="min-h-[44px] glass-button border-0"
              >
                Keep All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
