import SEO from '@/components/SEO';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Download, Loader2, TrendingDown, TrendingUp, Wallet, Receipt, Sparkles } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, isSameMonth } from 'date-fns';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import BillRow from '@/components/bills/BillRow';
import type { Expense } from '@/lib/types';
import { incomeMidpoint, type IncomeRange } from '@/lib/leak-engine';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from '@/lib/smart-category';

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

function getBroadCategory(e: Expense): string {
  const descMatch = (e.description || '').match(/Category:\s*([^|]+)/);
  if (descMatch) {
    const saved = descMatch[1].trim();
    if (saved && saved !== 'Other') return toBroadCategory(saved);
  }
  const combined = `${e.title} ${e.merchant ?? ''} ${e.description ?? ''} ${e.cost_center ?? ''}`;
  if (isSubscriptionMerchant(combined)) return 'Subscriptions';
  return toBroadCategory(smartCategoryFromMerchant(combined) || 'Other');
}

const fmt = (n: number) =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

const CAT_BAR_COLORS: Record<string, string> = {
  'Food & Dining': 'hsla(152, 60%, 45%, 0.85)',
  'Grocery': 'hsla(150, 50%, 55%, 0.85)',
  'Fuel': 'hsla(38, 85%, 55%, 0.85)',
  'Toll & Parking': 'hsla(28, 80%, 55%, 0.85)',
  'Shopping': 'hsla(43, 80%, 50%, 0.85)',
  'Subscriptions': 'hsla(270, 70%, 65%, 0.85)',
  'Travel': 'hsla(195, 75%, 55%, 0.85)',
  'Transport': 'hsla(205, 70%, 55%, 0.85)',
  'Hotel & Stay': 'hsla(260, 60%, 65%, 0.85)',
  'Medical': 'hsla(0, 70%, 60%, 0.85)',
  'Entertainment': 'hsla(320, 70%, 60%, 0.85)',
  'Education': 'hsla(180, 70%, 50%, 0.85)',
  'Utilities': 'hsla(90, 55%, 55%, 0.85)',
  'Office': 'hsla(210, 40%, 60%, 0.85)',
  'Other': 'hsla(160, 10%, 45%, 0.85)',
};

export default function MonthlySummary() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'draft')
      .gte('expense_date', monthStart)
      .lte('expense_date', monthEnd)
      .order('expense_date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, monthStart, monthEnd]);

  const summary = useMemo(() => {
    const spend = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCat: Record<string, number> = {};
    for (const e of expenses) {
      const cat = getBroadCategory(e);
      byCat[cat] = (byCat[cat] || 0) + Number(e.amount);
    }
    const categories = Object.entries(byCat)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    const incomeRange = profile?.income_range as IncomeRange | null | undefined;
    const hasIncome = !!incomeRange;
    const income = hasIncome ? incomeMidpoint(incomeRange) : null;
    return { spend, categories, income, hasIncome, net: income === null ? null : income - spend };
  }, [expenses, profile?.income_range]);

  const canGoNext = !isSameMonth(month, startOfMonth(new Date()));

  const exportPdf = async () => {
    const el = pdfRef.current;
    if (!el || exporting) return;
    setExporting(true);
    toast({ title: 'Creating your PDF…', description: 'This takes a few seconds.' });
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#0d120f',
        useCORS: true,
        logging: false,
      });
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = 210;
      const pageH = 297;
      const pxPerMm = canvas.width / pageW;
      const sliceHeightPx = Math.floor(pageH * pxPerMm);
      let rendered = 0;
      let first = true;
      while (rendered < canvas.height) {
        const sliceH = Math.min(sliceHeightPx, canvas.height - rendered);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext('2d')!;
        ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, sliceH / pxPerMm);
        first = false;
        rendered += sliceH;
      }
      pdf.save(`EZZ-BILLZ-Summary-${format(month, 'MMM-yyyy')}.pdf`);
      toast({ title: 'PDF downloaded', description: 'Your monthly summary has been saved.' });
    } catch (err) {
      console.error('PDF export failed', err);
      toast({ title: 'Could not create PDF', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const monthLabel = format(month, 'MMMM yyyy');
  const maxCat = summary.categories.length ? summary.categories[0].amount : 1;

  return (
    <div className="min-h-screen px-4 md:px-8 py-6 pb-24 md:pb-10 max-w-3xl mx-auto md:max-w-none animate-fade-in">
      <SEO title="Monthly Summary" description="All your bills, income, expenses and net savings for the month — export as PDF." path="/summary" />

      {/* Header + month switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gold-gradient">Monthly Summary</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Everything you spent, earned and saved this month.</p>
        </div>
        <Button
          onClick={exportPdf}
          disabled={exporting || loading || expenses.length === 0}
          className="gap-2 rounded-xl"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Creating PDF…' : 'Export PDF'}
        </Button>
      </div>

      <div ref={pdfRef} className="space-y-5 rounded-3xl p-4 md:p-6 -mx-1" style={{ background: '#0d120f' }}>
        {/* Capture-only brand header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Receipt className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-gold-gradient">EZZ BILLZ</span>
          </div>
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-[0.2em]">{monthLabel}</span>
        </div>

        {/* Month switcher */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="rounded-xl glass-button border-border/30" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-4 py-2 rounded-xl glass-card border-border/20 text-sm font-semibold text-foreground min-w-[150px] text-center">
            {monthLabel}
          </span>
          <Button variant="outline" size="icon" className="rounded-xl glass-button border-border/30" disabled={!canGoNext} onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl p-3.5 md:p-4 border border-border/30 bg-primary/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Income</p>
            </div>
            {summary.income === null ? (
              <button onClick={() => navigate('/profile')} className="text-[11px] text-left text-primary underline underline-offset-2">
                Set in Profile
              </button>
            ) : (
              <p className="text-base md:text-xl font-bold text-foreground tabular-nums">{fmt(summary.income)}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{summary.hasIncome ? 'Est. from profile' : 'Monthly income'}</p>
          </div>

          <div className="rounded-2xl p-3.5 md:p-4 border border-border/30 bg-red-500/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wallet className="h-3.5 w-3.5 text-red-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bills</p>
            </div>
            <p className="text-base md:text-xl font-bold text-foreground tabular-nums">{fmt(summary.spend)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{expenses.length} bill{expenses.length === 1 ? '' : 's'}</p>
          </div>

          <div className="rounded-2xl p-3.5 md:p-4 border border-border/30 bg-primary/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              {summary.net !== null && summary.net >= 0
                ? <TrendingUp className="h-3.5 w-3.5 text-primary" />
                : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net</p>
            </div>
            {summary.net === null ? (
              <p className="text-base md:text-xl font-bold text-muted-foreground">—</p>
            ) : (
              <p className={`text-base md:text-xl font-bold tabular-nums ${summary.net >= 0 ? 'text-primary' : 'text-red-400'}`}>
                {summary.net >= 0 ? '+' : '−'}{fmt(Math.abs(summary.net))}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{summary.net === null ? 'Needs income' : summary.net >= 0 ? 'Saved this month' : 'Spent over income'}</p>
          </div>
        </div>

        {/* Category breakdown */}
        {summary.categories.length > 0 && (
          <div className="rounded-2xl glass-card border-border/20 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-gold" />
              <h2 className="text-sm font-bold text-foreground">Where your money went</h2>
            </div>
            <div className="space-y-3">
              {summary.categories.map(cat => {
                const pct = Math.round((cat.amount / summary.spend) * 100);
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-foreground">{cat.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {fmt(cat.amount)} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max((cat.amount / maxCat) * 100, 3)}%`, background: CAT_BAR_COLORS[cat.name] || CAT_BAR_COLORS['Other'] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bills list */}
        <div className="rounded-2xl glass-card border-border/20 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-foreground">All bills this month</h2>
            {expenses.length > 0 && (
              <Badge variant="secondary" className="rounded-full text-[10px]">{expenses.length}</Badge>
            )}
          </div>
          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="h-6 w-6 mx-auto text-muted-foreground/50 animate-spin" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-10 text-center">
              <Receipt className="h-9 w-9 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No bills recorded for {monthLabel}.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map(e => (
                <BillRow
                  key={e.id}
                  expense={e}
                  onClick={() => navigate(`/expenses/${e.id}`)}
                />
              ))}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{fmt(summary.spend)}</span>
              </div>
            </div>
          )}
        </div>

        {/* PDF footer */}
        <p className="text-center text-[10px] text-muted-foreground/70 pt-1">
          Generated by EZZ BILLZ · {format(new Date(), 'd MMM yyyy, h:mm a')}
        </p>
      </div>

      {!summary.hasIncome && !loading && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Add your monthly income in <button onClick={() => navigate('/profile')} className="text-primary underline underline-offset-2">Profile</button> to see your net savings.
        </p>
      )}
    </div>
  );
}
