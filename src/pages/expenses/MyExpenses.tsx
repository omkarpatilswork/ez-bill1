import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/expenses/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlusCircle, Receipt, Download, Upload, FileWarning, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Expense, ExpenseStatus } from '@/lib/types';

const STATUSES: ExpenseStatus[] = ['draft', 'submitted', 'manager_approved', 'approved', 'rejected', 'reimbursed'];

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportExpensesToCsv(expenses: Expense[]) {
  const headers = ['Title', 'Merchant', 'Amount', 'Currency', 'Date', 'Status', 'Description', 'Cost Center'];
  const rows = expenses.map(e => [
    escapeCsv(e.title),
    escapeCsv(e.merchant || ''),
    String(e.amount),
    e.currency,
    e.expense_date,
    e.status,
    escapeCsv(e.description || ''),
    escapeCsv(e.cost_center || ''),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ImportRow {
  title: string;
  merchant: string;
  amount: number;
  currency: string;
  expense_date: string;
  description: string;
  cost_center: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvImport(text: string): { rows: ImportRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['File must have a header row and at least one data row.'] };

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const titleIdx = headers.indexOf('title');
  const amountIdx = headers.indexOf('amount');
  const dateIdx = headers.findIndex(h => h.includes('date'));

  if (titleIdx === -1 || amountIdx === -1) {
    return { rows: [], errors: ['CSV must contain "Title" and "Amount" columns.'] };
  }

  const merchantIdx = headers.findIndex(h => h.includes('merchant'));
  const currencyIdx = headers.indexOf('currency');
  const descIdx = headers.findIndex(h => h.includes('description'));
  const costIdx = headers.findIndex(h => h.includes('cost_center') || h.includes('cost center'));

  const rows: ImportRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const title = cols[titleIdx]?.trim();
    const amountStr = cols[amountIdx]?.trim().replace(/[$,]/g, '');
    const amount = parseFloat(amountStr);

    if (!title) { errors.push(`Row ${i + 1}: Missing title.`); continue; }
    if (isNaN(amount) || amount <= 0) { errors.push(`Row ${i + 1}: Invalid amount "${cols[amountIdx]}".`); continue; }

    rows.push({
      title,
      merchant: merchantIdx >= 0 ? (cols[merchantIdx]?.trim() || '') : '',
      amount,
      currency: currencyIdx >= 0 ? (cols[currencyIdx]?.trim() || 'USD') : 'USD',
      expense_date: dateIdx >= 0 && cols[dateIdx]?.trim() ? cols[dateIdx].trim() : new Date().toISOString().slice(0, 10),
      description: descIdx >= 0 ? (cols[descIdx]?.trim() || '') : '',
      cost_center: costIdx >= 0 ? (cols[costIdx]?.trim() || '') : '',
    });
  }

  return { rows, errors };
}

export default function MyExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportRow[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchExpenses = () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter as ExpenseStatus);
    query.then(({ data }) => {
      setExpenses((data as unknown as Expense[]) || []);
      setLoading(false);
    });
  };

  useEffect(() => { fetchExpenses(); }, [user, statusFilter]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast({ title: 'Invalid file', description: 'Please select a CSV file.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors } = parseCsvImport(text);
      setImportPreview(rows);
      setImportErrors(errors);
      setImportDialogOpen(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportConfirm = async () => {
    if (!user || !importPreview?.length) return;
    setImporting(true);
    const inserts = importPreview.map(r => ({
      user_id: user.id,
      title: r.title,
      merchant: r.merchant,
      amount: r.amount,
      currency: r.currency,
      expense_date: r.expense_date,
      description: r.description,
      cost_center: r.cost_center,
      status: 'draft' as const,
    }));

    const { error } = await supabase.from('expenses').insert(inserts);
    setImporting(false);
    setImportDialogOpen(false);
    setImportPreview(null);
    setImportErrors([]);

    if (error) {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Import successful', description: `${inserts.length} expense(s) imported as drafts.` });
      fetchExpenses();
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">My Expenses</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={() => exportExpensesToCsv(expenses)} disabled={expenses.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
          <Button asChild className="w-full sm:w-auto min-h-[44px]">
            <Link to="/expenses/new"><PlusCircle className="mr-2 h-4 w-4" /> New Expense</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No expenses found.</p>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="block sm:hidden space-y-3">
                {expenses.map(exp => (
                  <Link key={exp.id} to={`/expenses/${exp.id}`} className="block rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate mr-2">{exp.title}</span>
                      <StatusBadge status={exp.status as ExpenseStatus} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{exp.merchant || '—'}</span>
                      <span className="font-semibold text-foreground">${Number(exp.amount).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(exp.expense_date).toLocaleDateString()}</p>
                  </Link>
                ))}
              </div>
              {/* Desktop table */}
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell>
                        <Link to={`/expenses/${exp.id}`} className="text-primary hover:underline font-medium">{exp.title}</Link>
                      </TableCell>
                      <TableCell>{exp.merchant || '—'}</TableCell>
                      <TableCell>${Number(exp.amount).toFixed(2)}</TableCell>
                      <TableCell>{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                      <TableCell><StatusBadge status={exp.status as ExpenseStatus} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import Preview Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Expenses</DialogTitle>
            <DialogDescription>Review the expenses to be imported. All will be created as drafts.</DialogDescription>
          </DialogHeader>

          {importErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <FileWarning className="h-4 w-4" /> {importErrors.length} row(s) skipped
              </div>
              <ul className="text-xs text-destructive/80 list-disc pl-5 space-y-0.5">
                {importErrors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                {importErrors.length > 5 && <li>...and {importErrors.length - 5} more</li>}
              </ul>
            </div>
          )}

          {importPreview && importPreview.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" /> {importPreview.length} expense(s) ready to import
              </div>
              <div className="rounded-lg border divide-y max-h-60 overflow-y-auto">
                {importPreview.map((row, i) => (
                  <div key={i} className="p-2 text-sm flex items-center justify-between">
                    <div>
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.merchant || 'No merchant'} · {row.expense_date}</p>
                    </div>
                    <span className="font-semibold">${row.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No valid rows found in the file.</p>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleImportConfirm} disabled={importing || !importPreview?.length} className="w-full sm:w-auto">
              {importing ? 'Importing...' : `Import ${importPreview?.length || 0} Expense(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
