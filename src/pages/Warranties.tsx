import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, differenceInDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  ShieldCheck, Camera, Upload, Plus, ExternalLink, Trash2, Loader2,
  Calendar, Package, AlertTriangle, CheckCircle2, QrCode, Mail, Phone,
  FileCheck, ShieldAlert, BookOpen, ChevronRight,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import SEO from '@/components/SEO';

type Warranty = {
  id: string;
  product_name: string;
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  category: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  warranty_months: number | null;
  retailer: string | null;
  notes: string | null;
  qr_url: string | null;
  support_url: string | null;
  image_path: string | null;
  source: string;
  created_at: string;
  support_phone?: string | null;
  support_email?: string | null;
  claim_url?: string | null;
  coverage?: string | null;
  exclusions?: string | null;
  required_documents?: string[] | null;
  claim_steps?: string[] | null;
  warranty_terms?: string | null;
};

type FormState = {
  product_name: string;
  brand: string;
  model_number: string;
  serial_number: string;
  category: string;
  purchase_date: string;
  expiry_date: string;
  warranty_months: string;
  retailer: string;
  notes: string;
  qr_url: string;
  support_url: string;
};

const EMPTY_FORM: FormState = {
  product_name: '', brand: '', model_number: '', serial_number: '',
  category: 'Other', purchase_date: '', expiry_date: '', warranty_months: '',
  retailer: '', notes: '', qr_url: '', support_url: '',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function statusFor(expiry?: string | null) {
  if (!expiry) return { label: 'Unknown', color: 'bg-muted text-muted-foreground', icon: AlertTriangle };
  const days = differenceInDays(parseISO(expiry), new Date());
  if (days < 0) return { label: 'Expired', color: 'bg-destructive/20 text-destructive border-destructive/40', icon: AlertTriangle };
  if (days <= 30) return { label: `${days}d left`, color: 'bg-warning/20 text-warning border-warning/40', icon: AlertTriangle };
  return { label: 'Active', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: CheckCircle2 };
}

export default function Warranties() {
  const { user } = useAuth();
  const [items, setItems] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [extras, setExtras] = useState<any>({});
  const [emailScanning, setEmailScanning] = useState(false);
  const [detail, setDetail] = useState<Warranty | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('warranties' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Could not load warranties', description: error.message, variant: 'destructive' });
    }
    setItems((data || []) as unknown as Warranty[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const handleScan = async (file: File) => {
    setPendingFile(file);
    setScanning(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-warranty', {
        body: { file_base64: base64, file_type: file.type || 'image/jpeg' },
      });
      if (error) throw error;
      if (data?.fallback) {
        toast({ title: 'Scan needs a clearer photo', description: data.error });
      }
      setExtras({
        support_phone: data?.support_phone || null,
        support_email: data?.support_email || null,
        claim_url: data?.claim_url || null,
        coverage: data?.coverage || '',
        exclusions: data?.exclusions || '',
        required_documents: data?.required_documents || [],
        claim_steps: data?.claim_steps || [],
        warranty_terms: data?.warranty_terms || '',
        raw_extracted: data || {},
      });
      setForm({
        product_name: data?.product_name || '',
        brand: data?.brand || '',
        model_number: data?.model_number || '',
        serial_number: data?.serial_number || '',
        category: data?.category || 'Other',
        purchase_date: data?.purchase_date || '',
        expiry_date: data?.expiry_date || '',
        warranty_months: data?.warranty_months ? String(data.warranty_months) : '',
        retailer: data?.retailer || '',
        notes: data?.notes || '',
        qr_url: data?.qr_url || '',
        support_url: data?.support_url || '',
      });
      setDialogOpen(true);
    } catch (e: any) {
      toast({ title: 'Scan failed', description: e.message || 'Try again', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const openManual = () => {
    setForm(EMPTY_FORM);
    setPendingFile(null);
    setExtras({});
    setDialogOpen(true);
  };

  const handleEmailScan = async () => {
    setEmailScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-warranty-scan', {
        body: { max_results: 30, days: 365 },
      });
      if (error) throw error;
      const saved = data?.saved_count || 0;
      toast({
        title: saved > 0 ? `Found ${saved} warranty${saved > 1 ? 'ies' : ''}` : 'No new warranties',
        description: saved > 0
          ? 'Imported from your Gmail with claim instructions.'
          : 'We scanned your inbox but found nothing new.',
      });
      load();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('Gmail not connected')) {
        toast({ title: 'Connect Gmail first', description: 'Go to Import Bills to connect Gmail.', variant: 'destructive' });
      } else {
        toast({ title: 'Email scan failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setEmailScanning(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.product_name.trim()) {
      toast({ title: 'Product name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let image_path: string | null = null;
      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('warranty-cards')
          .upload(path, pendingFile, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
        image_path = path;
      }

      const payload = {
        user_id: user.id,
        product_name: form.product_name.trim(),
        brand: form.brand.trim(),
        model_number: form.model_number.trim(),
        serial_number: form.serial_number.trim(),
        category: form.category || 'Other',
        purchase_date: form.purchase_date || null,
        expiry_date: form.expiry_date || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        retailer: form.retailer.trim(),
        notes: form.notes.trim(),
        qr_url: form.qr_url.trim() || null,
        support_url: form.support_url.trim() || null,
        image_path,
        source: pendingFile ? 'photo' : 'manual',
        ...extras,
      };
      const { error } = await supabase.from('warranties' as any).insert(payload);
      if (error) throw error;
      toast({ title: 'Warranty saved' });
      setDialogOpen(false);
      setPendingFile(null);
      setExtras({});
      setForm(EMPTY_FORM);
      load();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (w: Warranty) => {
    if (!confirm(`Delete warranty for "${w.product_name}"?`)) return;
    const { error } = await supabase.from('warranties' as any).delete().eq('id', w.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    if (w.image_path) {
      await supabase.storage.from('warranty-cards').remove([w.image_path]);
    }
    setItems(prev => prev.filter(x => x.id !== w.id));
    toast({ title: 'Deleted' });
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-6 animate-fade-in">
      <SEO
        title="Warranties | EZ Bill"
        description="Track product warranties, expiry dates and warranty cards in one place."
      />

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Warranties
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Snap a warranty card and we'll save it — including any QR code link.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <label className="glass-card p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); e.target.value = ''; }}
          />
          {scanning ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Camera className="h-6 w-6 text-primary" />}
          <span className="text-sm font-medium">Scan Card</span>
          <span className="text-[11px] text-muted-foreground text-center">Photo + QR</span>
        </label>
        <label className="glass-card p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); e.target.value = ''; }}
          />
          <Upload className="h-6 w-6 text-gold" />
          <span className="text-sm font-medium">Upload File</span>
          <span className="text-[11px] text-muted-foreground text-center">From gallery</span>
        </label>
        <button
          onClick={handleEmailScan}
          disabled={emailScanning}
          className="glass-card p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60"
        >
          {emailScanning ? <Loader2 className="h-6 w-6 animate-spin text-info" /> : <Mail className="h-6 w-6 text-info" />}
          <span className="text-sm font-medium">Scan Email</span>
          <span className="text-[11px] text-muted-foreground text-center">From Gmail</span>
        </button>
      </div>

      <Button variant="outline" className="w-full" onClick={openManual}>
        <Plus className="h-4 w-4 mr-2" /> Add manually
      </Button>

      <section>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <Card className="glass-card p-8 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No warranties saved yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Snap a warranty card to get started.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map(w => {
              const status = statusFor(w.expiry_date);
              const StatusIcon = status.icon;
              return (
                <Card key={w.id} className="glass-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => setDetail(w)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{w.product_name}</h3>
                        <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                        {(w.claim_steps && w.claim_steps.length > 0) && (
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                            <BookOpen className="h-3 w-3 mr-1" />Claim guide
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[w.brand, w.model_number].filter(Boolean).join(' · ') || w.category}
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        {w.purchase_date && (
                          <div>
                            <div className="text-muted-foreground">Purchased</div>
                            <div>{format(parseISO(w.purchase_date), 'd MMM yyyy')}</div>
                          </div>
                        )}
                        {w.expiry_date && (
                          <div>
                            <div className="text-muted-foreground">Expires</div>
                            <div>{format(parseISO(w.expiry_date), 'd MMM yyyy')}</div>
                          </div>
                        )}
                        {w.serial_number && (
                          <div className="col-span-2">
                            <div className="text-muted-foreground">Serial</div>
                            <div className="font-mono text-[11px] truncate">{w.serial_number}</div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-3 text-xs text-primary">
                        View claim guide <ChevronRight className="h-3 w-3" />
                      </div>
                    </button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(w)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pendingFile ? 'Confirm warranty details' : 'Add warranty'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product name *</Label>
              <Input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Brand</Label>
                <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <Label>Model #</Label>
                <Input value={form.model_number} onChange={e => setForm({ ...form, model_number: e.target.value })} />
              </div>
              <div>
                <Label>Serial #</Label>
                <Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div>
                <Label>Purchase date</Label>
                <Input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              <div>
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div>
                <Label>Warranty (months)</Label>
                <Input type="number" value={form.warranty_months} onChange={e => setForm({ ...form, warranty_months: e.target.value })} />
              </div>
              <div>
                <Label>Retailer</Label>
                <Input value={form.retailer} onChange={e => setForm({ ...form, retailer: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>QR / registration URL</Label>
              <Input value={form.qr_url} onChange={e => setForm({ ...form, qr_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Brand support URL</Label>
              <Input value={form.support_url} onChange={e => setForm({ ...form, support_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save warranty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  {detail.product_name}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {[detail.brand, detail.model_number].filter(Boolean).join(' · ')}
                </p>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Status row */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {detail.purchase_date && (
                    <div className="glass-card p-2 rounded-lg">
                      <div className="text-muted-foreground">Purchased</div>
                      <div className="font-medium">{format(parseISO(detail.purchase_date), 'd MMM yyyy')}</div>
                    </div>
                  )}
                  {detail.expiry_date && (
                    <div className="glass-card p-2 rounded-lg">
                      <div className="text-muted-foreground">Expires</div>
                      <div className="font-medium">{format(parseISO(detail.expiry_date), 'd MMM yyyy')}</div>
                    </div>
                  )}
                  {detail.warranty_months && (
                    <div className="glass-card p-2 rounded-lg">
                      <div className="text-muted-foreground">Duration</div>
                      <div className="font-medium">{detail.warranty_months} months</div>
                    </div>
                  )}
                  {detail.serial_number && (
                    <div className="glass-card p-2 rounded-lg col-span-2">
                      <div className="text-muted-foreground">Serial</div>
                      <div className="font-mono text-[11px] truncate">{detail.serial_number}</div>
                    </div>
                  )}
                </div>

                {detail.warranty_terms && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Warranty terms</div>
                    <p className="text-sm">{detail.warranty_terms}</p>
                  </div>
                )}

                {detail.coverage && (
                  <div className="glass-card p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> What's covered
                    </div>
                    <p className="text-xs leading-relaxed">{detail.coverage}</p>
                  </div>
                )}

                {detail.exclusions && (
                  <div className="glass-card p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-xs font-medium text-destructive mb-1">
                      <ShieldAlert className="h-3.5 w-3.5" /> Not covered
                    </div>
                    <p className="text-xs leading-relaxed">{detail.exclusions}</p>
                  </div>
                )}

                {detail.required_documents && detail.required_documents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-medium mb-2">
                      <FileCheck className="h-3.5 w-3.5 text-gold" /> Keep ready
                    </div>
                    <ul className="space-y-1">
                      {detail.required_documents.map((d, i) => (
                        <li key={i} className="text-xs flex gap-2">
                          <span className="text-gold">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.claim_steps && detail.claim_steps.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-medium mb-2">
                      <BookOpen className="h-3.5 w-3.5 text-primary" /> How to claim
                    </div>
                    <ol className="space-y-2">
                      {detail.claim_steps.map((step, i) => (
                        <li key={i} className="text-xs flex gap-2">
                          <span className="flex-none h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 pt-2">
                  {detail.claim_url && (
                    <a href={detail.claim_url} target="_blank" rel="noreferrer"
                      className="glass-card p-3 rounded-lg flex items-center justify-between hover:bg-primary/5 transition">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ExternalLink className="h-4 w-4 text-primary" /> Start claim online
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  {detail.support_phone && (
                    <a href={`tel:${detail.support_phone.replace(/\s+/g, '')}`}
                      className="glass-card p-3 rounded-lg flex items-center justify-between hover:bg-primary/5 transition">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Phone className="h-4 w-4 text-primary" /> Call support
                      </div>
                      <span className="text-xs text-muted-foreground">{detail.support_phone}</span>
                    </a>
                  )}
                  {detail.support_email && (
                    <a href={`mailto:${detail.support_email}`}
                      className="glass-card p-3 rounded-lg flex items-center justify-between hover:bg-primary/5 transition">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Mail className="h-4 w-4 text-primary" /> Email support
                      </div>
                      <span className="text-xs text-muted-foreground truncate max-w-[160px]">{detail.support_email}</span>
                    </a>
                  )}
                  {detail.support_url && (
                    <a href={detail.support_url} target="_blank" rel="noreferrer"
                      className="glass-card p-3 rounded-lg flex items-center justify-between hover:bg-primary/5 transition">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ExternalLink className="h-4 w-4 text-primary" /> Brand support site
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  {detail.qr_url && (
                    <a href={detail.qr_url} target="_blank" rel="noreferrer"
                      className="glass-card p-3 rounded-lg flex items-center justify-between hover:bg-primary/5 transition">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <QrCode className="h-4 w-4 text-gold" /> QR code link
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                </div>

                {detail.notes && (
                  <div className="text-xs text-muted-foreground border-t border-border/30 pt-3">
                    {detail.notes}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}