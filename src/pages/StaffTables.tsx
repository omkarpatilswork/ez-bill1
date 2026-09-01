import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, CheckCircle2, Wifi, X, RotateCcw } from 'lucide-react';

// Tier-1 pilot staff screen: no POS integration, just "enter the total,
// photograph the closed bill, send it" — this is what makes a table's NFC
// tag / QR code start handing out that receipt. Protected route; any
// signed-in user for the pilot — tighten to a real staff role before a
// wider rollout. See supabase/functions/resolve-tag and the NFC Airdrop
// feature doc.
//
// v2 — smoother for both demos and real service:
// - Table state (ready / open, amount, how long ago) now reflects the real
//   unclaimed row in tag_pending_bills instead of a local flag that vanished
//   on refresh — staff (and anyone else on /staff) can see at a glance which
//   tables already have a bill waiting, from any device.
// - Live via Supabase Realtime, so a second staff phone updates instantly.
//   (Requires tag_pending_bills to be added to the supabase_realtime
//   publication — see the note at the bottom of this file. Falls back to a
//   60s poll if that isn't enabled, so nothing breaks either way.)
// - The 45-minute grace window here matches resolve-tag exactly, so a table
//   never shows "Ready" here after it's actually gone stale for a tapper.
// - Sending a bill is one bottom sheet: total first (staff know this
//   instantly — it's the printed number in front of them), photo second,
//   with a preview + retake before it goes out. Total is now required, not
//   optional — it removes the biggest single source of a wrong receipt
//   (OCR misreading a messy printed bill) and lets the customer's screen
//   show a real number immediately instead of "Reading bill…".
// - "Clear" lets staff take a table back down if they picked the wrong one
//   or fat-fingered the amount, without waiting out the grace window.

interface BillTag { tag_id: string; label: string; merchant_name: string }
interface PendingBill { id: string; amount: number | null; created_at: string }

const GRACE_WINDOW_MINUTES = 45; // must match supabase/functions/resolve-tag

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins === 1) return '1m ago';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function StaffTables() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tags, setTags] = useState<BillTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [pending, setPending] = useState<Record<string, PendingBill>>({});

  const [sheetTag, setSheetTag] = useState<BillTag | null>(null);
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const sinceISO = new Date(Date.now() - GRACE_WINDOW_MINUTES * 60_000).toISOString();
    const { data } = await supabase
      .from('tag_pending_bills')
      .select('id, tag_id, amount, created_at')
      .is('claimed_at', null)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false });

    const map: Record<string, PendingBill> = {};
    (data || []).forEach(row => {
      // Rows come back newest-first; keep only the latest per tag — this
      // mirrors exactly what resolve-tag would hand a tapper right now.
      if (!map[row.tag_id]) map[row.tag_id] = { id: row.id, amount: row.amount, created_at: row.created_at };
    });
    setPending(map);
  }, []);

  useEffect(() => {
    setLoadingTags(true);
    supabase.from('bill_tags').select('*').order('label').then(({ data }) => {
      setTags(data || []);
      setLoadingTags(false);
    });
    loadPending();

    const channel = supabase
      .channel('staff-tag-pending-bills')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tag_pending_bills' }, () => loadPending())
      .subscribe();

    // Safety-net poll: catches the 45-minute grace window expiring, and
    // covers environments where Realtime isn't enabled for this table.
    const interval = setInterval(loadPending, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadPending]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => {
      const ap = pending[a.tag_id];
      const bp = pending[b.tag_id];
      if (!!ap !== !!bp) return ap ? -1 : 1; // tables with a bill waiting float to the top
      if (ap && bp) return new Date(bp.created_at).getTime() - new Date(ap.created_at).getTime();
      return a.label.localeCompare(b.label);
    });
  }, [tags, pending]);

  const readyCount = Object.keys(pending).length;

  const openSheet = (tag: BillTag) => {
    setSheetTag(tag);
    setAmount('');
    setFile(null);
    setPreview(null);
  };

  const closeSheet = () => {
    if (preview) URL.revokeObjectURL(preview);
    setSheetTag(null);
    setPreview(null);
    setFile(null);
    setAmount('');
  };

  const pickFile = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const sendBill = async () => {
    if (!user || !sheetTag || !file || !amount) return;
    setSubmitting(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${sheetTag.tag_id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pending-receipts').upload(filePath, file);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('tag_pending_bills').insert({
        tag_id: sheetTag.tag_id,
        file_path: filePath,
        amount: Number(amount),
        created_by: user.id,
      });
      if (insErr) throw insErr;

      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
      toast({ title: 'Bill sent', description: `${sheetTag.label} is ready to tap.` });
      closeSheet();
      loadPending();
    } catch (err: any) {
      toast({ title: "Couldn't send bill", description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const clearTable = async (tag: BillTag) => {
    const row = pending[tag.tag_id];
    if (!row) return;
    setClearingId(row.id);
    try {
      const { error } = await supabase
        .from('tag_pending_bills')
        .update({ claimed_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      toast({ title: 'Table cleared', description: `${tag.label} no longer has a bill waiting.` });
      loadPending();
    } catch (err: any) {
      toast({ title: "Couldn't clear table", description: err.message, variant: 'destructive' });
    } finally {
      setClearingId(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">NFC Tables — Staff</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter the total and snap the closed bill — the table's tag / QR code hands that receipt to whoever taps it.
        {tags.length > 0 && (
          <> {' '}·{' '}<span className="text-foreground font-medium">{readyCount} of {tags.length}</span> ready now</>
        )}
      </p>

      <div className="space-y-3">
        {sortedTags.map(tag => {
          const row = pending[tag.tag_id];
          return (
            <Card
              key={tag.tag_id}
              className={`border-0 glass-card rounded-2xl transition-colors ${row ? 'ring-1 ring-green-500/40 bg-green-500/[0.03]' : ''}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  {tag.label}
                  {row ? (
                    <Badge variant="outline" className="border-green-500/40 text-green-500 gap-1 font-normal shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      {row.amount != null ? `₹${row.amount.toLocaleString('en-IN')}` : 'Ready'} · {timeAgo(row.created_at)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground font-normal shrink-0">Open</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button size="sm" variant={row ? 'outline' : 'default'} className="flex-1 min-h-[40px]" onClick={() => openSheet(tag)}>
                  <Camera className="h-4 w-4 mr-1.5" /> {row ? 'Send new bill' : 'Send bill'}
                </Button>
                {row && (
                  <Button
                    size="sm" variant="ghost" className="min-h-[40px] w-10 px-0 text-muted-foreground"
                    disabled={clearingId === row.id} onClick={() => clearTable(tag)} aria-label={`Clear ${tag.label}`}
                  >
                    {clearingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loadingTags && tags.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No tags provisioned yet — add rows to bill_tags in Supabase.</p>
        )}
      </div>

      <Sheet open={!!sheetTag} onOpenChange={open => !open && closeSheet()}>
        <SheetContent side="bottom" className="rounded-t-2xl max-w-xl mx-auto space-y-5">
          <SheetHeader className="text-left">
            <SheetTitle>{sheetTag?.label}</SheetTitle>
            <SheetDescription>Enter the total, then attach the printed bill.</SheetDescription>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs">Total</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">₹</span>
              <Input
                type="number" inputMode="decimal" step="0.01" autoFocus
                value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="h-14 pl-8 text-2xl font-semibold tabular-nums bg-secondary/30 border-border/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Bill photo</Label>
            {preview ? (
              <div className="relative">
                <img src={preview} alt="Bill preview" className="w-full max-h-48 object-contain rounded-lg bg-muted/30 border border-border/30" />
                <Button type="button" size="sm" variant="secondary" className="absolute bottom-2 right-2 h-8" onClick={() => pickFile(null)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retake
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border border-dashed border-border/50 bg-secondary/20 text-muted-foreground cursor-pointer">
                <Camera className="h-5 w-5" />
                <span className="text-xs">Tap to photograph the bill</span>
                <input
                  type="file" accept="image/*,.pdf" capture="environment" className="hidden"
                  onChange={e => pickFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>

          <SheetFooter className="flex-row gap-2 sm:justify-stretch">
            <Button variant="ghost" className="flex-1 min-h-[44px]" onClick={closeSheet}>Cancel</Button>
            <Button className="flex-1 min-h-[44px]" disabled={!file || !amount || submitting} onClick={sendBill}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to table'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// One-time Supabase setup for the live-sync piece above (safe to skip — the
// 60s poll covers it either way, this just makes updates instant):
//   alter publication supabase_realtime add table public.tag_pending_bills;
