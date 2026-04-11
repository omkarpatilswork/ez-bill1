import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Search, Receipt, Utensils, Fuel, Car, ParkingCircle, ShoppingBag, Zap, MoreHorizontal, Repeat, Trash2, X, CheckSquare, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Expense } from '@/lib/types';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from '@/lib/smart-category';
import { getCurrencySymbol } from '@/lib/countries';

interface DuplicateGroup {
  merchant: string;
  amount: number;
  expense_date: string;
  ids: string[];
}

const CATEGORIES = [
  { label: 'All', value: 'all', icon: Receipt },
  { label: 'Subscriptions', value: 'subscriptions', icon: Repeat },
  { label: 'Food & Dining', value: 'food_dining', icon: Utensils },
  { label: 'Petrol', value: 'petrol', icon: Fuel },
  { label: 'Toll', value: 'toll', icon: Car },
  { label: 'Parking', value: 'parking', icon: ParkingCircle },
  { label: 'Shopping', value: 'shopping', icon: ShoppingBag },
  { label: 'Utilities', value: 'utilities', icon: Zap },
  { label: 'Other', value: 'other', icon: MoreHorizontal },
];

function getSmartCategory(expense: Expense): string {
  const combined = `${expense.title} ${expense.merchant} ${expense.description} ${expense.cost_center}`;
  if (isSubscriptionMerchant(combined)) return 'Subscription';
  return smartCategoryFromMerchant(expense.merchant || '', expense.title);
}

function getCategoryIcon(category: string) {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('subscription')) return Repeat;
  if (cat.includes('food') || cat.includes('dining') || cat.includes('meal')) return Utensils;
  if (cat.includes('petrol') || cat.includes('fuel') || cat.includes('gas')) return Fuel;
  if (cat.includes('toll')) return Car;
  if (cat.includes('parking')) return ParkingCircle;
  if (cat.includes('shopping') || cat.includes('retail')) return ShoppingBag;
  if (cat.includes('utilities') || cat.includes('electric') || cat.includes('water')) return Zap;
  return Receipt;
}

function matchesCategory(expense: Expense, filter: string): boolean {
  if (filter === 'all') return true;
  const cat = getSmartCategory(expense).toLowerCase();
  switch (filter) {
    case 'subscriptions': return cat === 'subscription';
    case 'food_dining': return cat.includes('food') || cat.includes('dining') || cat.includes('meal') || cat.includes('grocery');
    case 'petrol': return cat.includes('petrol') || cat.includes('fuel');
    case 'toll': return cat.includes('toll');
    case 'parking': return cat.includes('parking');
    case 'shopping': return cat.includes('shopping');
    case 'utilities': return cat.includes('utilities') || cat.includes('software');
    case 'other': return cat === 'other';
    default: return true;
  }
}

export default function MyExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
      .select('id, merchant, amount, expense_date')
      .eq('user_id', user.id);
    if (!data) return;
    const groups = new Map<string, { merchant: string; amount: number; expense_date: string; ids: string[] }>();
    for (const row of data as any[]) {
      const key = `${(row.merchant || '').toLowerCase().trim()}|${row.amount}|${row.expense_date}`;
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

  const filteredExpenses = expenses.filter(e => {
    if (!matchesCategory(e, categoryFilter)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.title.toLowerCase().includes(q) || (e.merchant || '').toLowerCase().includes(q) || String(e.amount).includes(q) || (e.description || '').toLowerCase().includes(q);
  });

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

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All Bills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredExpenses.length} bill{filteredExpenses.length !== 1 ? 's' : ''} · ₹{totalFiltered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
          </p>
        </div>
        {!selectMode ? (
          <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} className="text-muted-foreground">
            <CheckSquare className="h-4 w-4 mr-1.5" /> Select
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={exitSelectMode} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
        )}
      </div>

      {selectMode && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll} className="text-xs">
            {selectedIds.size === filteredExpenses.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0}
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs"
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
          className="pl-9 min-h-[44px] bg-card border-border/40 rounded-xl"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {CATEGORIES.map(cat => {
          const active = categoryFilter === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                active
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-card border border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
              }`}
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
        <div className="text-center py-10 text-muted-foreground">
          <Receipt className="mx-auto h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium mb-1">{searchQuery || categoryFilter !== 'all' ? 'No matching bills' : 'No bills yet'}</p>
          <p className="text-sm">{searchQuery ? 'Try adjusting your search or category.' : 'Add your first bill to get started.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredExpenses.map(exp => {
            const catLabel = getSmartCategory(exp);
            const CategoryIcon = getCategoryIcon(catLabel);
            const isSub = catLabel === 'Subscription';
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
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${isSub ? 'bg-purple-500/10' : 'bg-primary/10'}`}>
                  <CategoryIcon className={`h-5 w-5 ${isSub ? 'text-purple-500' : 'text-primary'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {exp.merchant || exp.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {catLabel}
                    {isSub && <span className="ml-1 text-purple-400">· Recurring</span>}
                    {exp.description && /\d+\s*item/i.test(exp.description) && (
                      <> · {exp.description.match(/(\d+\s*item[s]?)/i)?.[1]}</>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {exp.cost_center ? exp.cost_center : 'UPI'}
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
                className={`block rounded-xl border p-3.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-destructive/5 border-destructive/30'
                    : 'bg-card border-border/30 hover:bg-muted/20 active:bg-muted/40'
                }`}
              >
                {cardContent}
              </div>
            ) : (
              <Link
                key={exp.id}
                to={`/expenses/${exp.id}`}
                className="block rounded-xl bg-card border border-border/30 p-3.5 hover:bg-muted/20 active:bg-muted/40 transition-colors"
              >
                {cardContent}
              </Link>
            );
          })}
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[340px] rounded-2xl">
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
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Duplicate Bills Found
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {duplicates.length} group(s) of duplicate bills were found. Would you like to remove the extras?
            </p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {duplicates.map((group, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-muted/30 p-3">
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
                className="min-h-[44px]"
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
