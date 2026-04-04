import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Mail, Link2, Unlink, RefreshCw, Loader2, FileText, Download,
  CheckCircle2, AlertCircle, Eye, ScanLine, ArrowRight,
} from 'lucide-react';
import type { ExpenseCategory } from '@/lib/types';

interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface EmailBill {
  message_id: string;
  subject: string;
  from: string;
  date: string;
  attachments: EmailAttachment[];
}

interface ExtractedData {
  merchant_name?: string;
  amount?: number | null;
  date_time?: string;
  bill_invoice_number?: string;
  category?: string;
}

export default function EmailBills() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [emails, setEmails] = useState<EmailBill[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Processing state
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [attachmentMime, setAttachmentMime] = useState<string>('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importForm, setImportForm] = useState({
    title: '', merchant: '', amount: '', expense_date: '', category_id: '', description: '',
  });
  const [isImporting, setIsImporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentEmailMsgId, setCurrentEmailMsgId] = useState('');

  useEffect(() => {
    checkConnection();
    supabase.from('expense_categories').select('*').then(({ data }) => {
      setCategories((data as unknown as ExpenseCategory[]) || []);
    });
  }, []);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : '';
  };

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'status' },
      });
      if (!error && data?.connected) {
        setIsConnected(true);
        setConnectedEmail(data.email);
      }
    } catch {
      // Not connected
    } finally {
      setIsChecking(false);
    }
  };

  const connectGmail = async () => {
    try {
      const redirectUri = `${window.location.origin}/email-bills`;
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'get_auth_url', redirect_uri: redirectUri },
      });
      if (error || !data?.auth_url) {
        toast({ title: 'Error', description: data?.error || 'Failed to get auth URL', variant: 'destructive' });
        return;
      }
      // Open in new window for OAuth
      window.location.href = data.auth_url;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !isConnected) {
      const exchangeCode = async () => {
        const redirectUri = `${window.location.origin}/email-bills`;
        const { data, error } = await supabase.functions.invoke('gmail-auth', {
          body: { action: 'exchange_code', code, redirect_uri: redirectUri },
        });
        if (error || !data?.success) {
          toast({ title: 'Connection failed', description: data?.error || 'Could not connect Gmail', variant: 'destructive' });
        } else {
          setIsConnected(true);
          setConnectedEmail(data.email);
          toast({ title: 'Gmail connected', description: `Connected as ${data.email}` });
        }
        // Clean URL
        window.history.replaceState({}, '', '/email-bills');
      };
      exchangeCode();
    }
  }, []);

  const disconnectGmail = async () => {
    const { error } = await supabase.functions.invoke('gmail-auth', {
      body: { action: 'disconnect' },
    });
    if (!error) {
      setIsConnected(false);
      setConnectedEmail('');
      setEmails([]);
      toast({ title: 'Disconnected', description: 'Gmail has been disconnected.' });
    }
  };

  const scanEmails = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-scan', {
        body: { max_results: 20 },
      });
      if (error) throw new Error('Failed to scan emails');
      if (data?.error) throw new Error(data.error);
      setEmails(data?.emails || []);
      toast({
        title: 'Scan complete',
        description: `Found ${data?.new_count || 0} new emails with bill attachments out of ${data?.total_found || 0} total.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  };

  const processAttachment = async (email: EmailBill, attachment: EmailAttachment) => {
    const processingKey = `${email.message_id}-${attachment.id}`;
    setProcessingId(processingKey);
    setCurrentEmailMsgId(email.message_id);

    try {
      // Fetch attachment data
      const { data: attData, error: attError } = await supabase.functions.invoke('gmail-attachment', {
        body: { message_id: email.message_id, attachment_id: attachment.id },
      });
      if (attError || attData?.error) throw new Error(attData?.error || 'Failed to fetch attachment');

      const base64 = attData.data;
      setAttachmentPreview(`data:${attachment.mimeType};base64,${base64}`);
      setAttachmentMime(attachment.mimeType);

      // Run OCR extraction
      const { data: extracted, error: extractError } = await supabase.functions.invoke('extract-receipt', {
        body: { file_base64: base64, file_type: attachment.mimeType },
      });

      if (extractError || extracted?.error) throw new Error(extracted?.error || 'Extraction failed');

      setExtractedData(extracted);

      // Pre-fill import form
      const matchCategory = (name?: string) => {
        if (!name || name === 'Not Found') return '';
        const match = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
        return match?.id || '';
      };

      setImportForm({
        title: extracted.bill_invoice_number && extracted.bill_invoice_number !== 'Not Found'
          ? `Invoice ${extracted.bill_invoice_number}`
          : extracted.merchant_name && extracted.merchant_name !== 'Not Found'
            ? `Expense at ${extracted.merchant_name}` : email.subject || 'Email Bill',
        merchant: extracted.merchant_name !== 'Not Found' ? (extracted.merchant_name || '') : '',
        amount: extracted.amount != null ? String(extracted.amount) : '',
        expense_date: extracted.date_time && extracted.date_time !== 'Not Found'
          ? extracted.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10),
        category_id: matchCategory(extracted.category),
        description: `From email: ${email.subject}\nSender: ${email.from}`,
      });

      setShowImportDialog(true);
    } catch (err: any) {
      toast({ title: 'Processing failed', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleImport = async () => {
    if (!user) return;
    setIsImporting(true);

    try {
      const { data: expense, error } = await supabase.from('expenses').insert({
        user_id: user.id,
        title: importForm.title,
        merchant: importForm.merchant,
        amount: parseFloat(importForm.amount),
        expense_date: importForm.expense_date,
        category_id: importForm.category_id || null,
        description: importForm.description,
        status: 'draft',
      } as any).select().single();

      if (error) throw error;

      // Mark email as processed
      await supabase.from('processed_emails').insert({
        user_id: user.id,
        gmail_message_id: currentEmailMsgId,
        subject: importForm.title,
        sender: importForm.merchant,
        expense_id: (expense as any)?.id,
      } as any);

      // Remove from list
      setEmails(prev => prev.filter(e => e.message_id !== currentEmailMsgId));
      setShowImportDialog(false);
      setExtractedData(null);
      setAttachmentPreview(null);

      toast({ title: 'Expense imported', description: 'The bill has been saved as a draft expense.' });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Email Bills</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Gmail to automatically find and import bills from your inbox.
        </p>
      </div>

      {/* Connection Card */}
      <Card className="shadow-md border-0">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isConnected ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {isConnected ? 'Gmail Connected' : 'Connect Gmail'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isConnected ? connectedEmail : 'Link your Gmail to scan for bills and receipts'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {isConnected ? (
                <>
                  <Button onClick={scanEmails} disabled={isScanning} className="min-h-[44px] flex-1 sm:flex-initial">
                    {isScanning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</> : <><RefreshCw className="h-4 w-4 mr-2" /> Scan Inbox</>}
                  </Button>
                  <Button variant="outline" onClick={disconnectGmail} className="min-h-[44px]">
                    <Unlink className="h-4 w-4 mr-1" /> Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={connectGmail} className="min-h-[44px] w-full sm:w-auto">
                  <Link2 className="h-4 w-4 mr-2" /> Connect Gmail
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      {!isConnected && (
        <Card className="shadow-md border-0 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { step: '1', title: 'Connect', desc: 'Securely link your Gmail account with read-only access' },
              { step: '2', title: 'Scan', desc: 'We search for emails with invoices, receipts, and bills' },
              { step: '3', title: 'Extract', desc: 'AI reads the attachments and extracts expense details' },
              { step: '4', title: 'Import', desc: 'Review, edit, and import as expenses with one click' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {item.step}
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Email Results */}
      {isConnected && emails.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Found Bills ({emails.length})</h2>
          </div>
          {emails.map(email => (
            <Card key={email.message_id} className="shadow-sm border-0">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{email.subject || 'No subject'}</p>
                      <p className="text-xs text-muted-foreground truncate">From: {email.from}</p>
                      <p className="text-xs text-muted-foreground">{email.date ? new Date(email.date).toLocaleDateString() : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {email.attachments.map(att => {
                      const key = `${email.message_id}-${att.id}`;
                      const isProcessing = processingId === key;
                      return (
                        <Button
                          key={att.id}
                          variant="outline"
                          size="sm"
                          className="min-h-[40px] text-xs"
                          disabled={!!processingId}
                          onClick={() => processAttachment(email, att)}
                        >
                          {isProcessing ? (
                            <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Processing...</>
                          ) : (
                            <><ScanLine className="h-3 w-3 mr-1.5" /> {att.filename} <ArrowRight className="h-3 w-3 ml-1" /></>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isConnected && !isScanning && emails.length === 0 && (
        <Card className="shadow-md border-0">
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No bills found yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Click "Scan Inbox" to search for bills and receipts in your email.</p>
            <Button onClick={scanEmails} disabled={isScanning}>
              <RefreshCw className="h-4 w-4 mr-2" /> Scan Inbox
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Expense
            </DialogTitle>
          </DialogHeader>

          {/* Extracted summary */}
          {extractedData && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">AI Extracted Fields</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {([
                  ['Merchant', extractedData.merchant_name],
                  ['Amount', extractedData.amount != null ? `$${extractedData.amount}` : null],
                  ['Date', extractedData.date_time],
                  ['Category', extractedData.category],
                ] as [string, any][]).map(([label, value]) => (
                  <div key={label} className="flex items-center gap-1.5 bg-background rounded px-2 py-1.5">
                    <span className="text-muted-foreground">{label}:</span>
                    <span className={`font-medium ${!value || value === 'Not Found' ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                      {!value || value === 'Not Found' ? 'N/A' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
              {attachmentPreview && (
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setShowPreview(true)}>
                  <Eye className="h-3.5 w-3.5 mr-1.5" /> View Original Document
                </Button>
              )}
            </div>
          )}

          {/* Editable form */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Title</Label>
              <Input className="min-h-[44px]" value={importForm.title} onChange={e => setImportForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Merchant</Label>
                <Input className="min-h-[44px]" value={importForm.merchant} onChange={e => setImportForm(p => ({ ...p, merchant: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Amount ($)</Label>
                <Input className="min-h-[44px]" type="number" step="0.01" value={importForm.amount} onChange={e => setImportForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Date</Label>
                <Input className="min-h-[44px]" type="date" value={importForm.expense_date} onChange={e => setImportForm(p => ({ ...p, expense_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Category</Label>
                <Select value={importForm.category_id} onValueChange={v => setImportForm(p => ({ ...p, category_id: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleImport}
                disabled={isImporting || !importForm.title || !importForm.amount}
                className="flex-1 min-h-[44px]"
              >
                {isImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</> : <><Download className="h-4 w-4 mr-2" /> Import as Draft</>}
              </Button>
              <Button variant="outline" onClick={() => setShowImportDialog(false)} className="min-h-[44px]">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] rounded-lg border border-border bg-muted/20 flex items-center justify-center p-2">
            {attachmentPreview && (
              attachmentMime === 'application/pdf' ? (
                <iframe src={attachmentPreview} className="w-full h-[65vh] rounded" title="Document" />
              ) : (
                <img src={attachmentPreview} alt="Document" className="max-w-full max-h-[65vh] object-contain rounded" />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
