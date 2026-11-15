/* eslint-disable @typescript-eslint/no-explicit-any -- the send and clear logic is carried over unchanged from the Phase 1 work; only the layout below was redesigned */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import SEO from '@/components/SEO';
import { EmptyState, Field, INPUT, ScreenHeader, Sheet } from '@/components/next/Sheet';
import { supabase } from '@/integrations/supabase/client';
import { prepareForReading } from '@/lib/image-prep';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

// Read the bill once, now, while staff are signed in, and store the result on the
// pending bill. resolve-tag hands it to the guest who taps, so their page shows the
// details without calling the AI before they sign in. Runs in the background: the
// staff screen does not wait for it. If it fails or is not done in time, the guest's
// page reads the photo itself after they sign in.
async function readBillForTap(pendingId: string, file: File) {
  try {
    const ready = await prepareForReading(file);
    const { data, error } = await supabase.functions.invoke('extract-receipt', {
      body: { file_base64: ready.base64, file_type: ready.type },
    });
    if (error || !data || data.error) return;
    await supabase.from('tag_pending_bills').update({ extracted: data }).eq('id', pendingId);
  } catch {
    // Best effort; see above.
  }
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
      const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pending-receipts').upload(filePath, file);
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase.from('tag_pending_bills').insert({
        tag_id: sheetTag.tag_id,
        file_path: filePath,
        amount: Number(amount),
        created_by: user.id,
      }).select('id').single();
      if (insErr) throw insErr;
      void readBillForTap(inserted.id, file);

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
    <>
      <SEO title="Staff tables" description="Send a closed bill to a table's NFC tag." path="/staff" />
      <div className="max-w-[760px] pb-8">
        <ScreenHeader title="Staff tables" summary={tags.length > 0 ? <><span className="text-fg">{readyCount} of {tags.length}</span> tables have a bill waiting to be tapped.</> : undefined} />

        {loadingTags ? (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-[18px] bg-surface-2" />)}</div>
        ) : tags.length === 0 ? (
          <EmptyState title="No tables set up." body="Tags are added for each venue during setup. Once a table has a tag, it appears here." />
        ) : (
          <ul className="ez-card mt-8 divide-y divide-line-soft overflow-hidden">
            {sortedTags.map((tag) => {
              const row = pending[tag.tag_id];
              return (
                <li key={tag.tag_id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 lg:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold leading-snug text-fg">{tag.label}</p>
                    <p className="text-[13.5px] text-dim">
                      {row ? <><span className="text-brand-text">Bill waiting</span>{row.amount != null && <> · <span className="ez-num">₹{row.amount.toLocaleString('en-IN')}</span></>} · sent {timeAgo(row.created_at)}</> : 'No bill sent'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {row && <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm" disabled={clearingId === row.id} onClick={() => clearTable(tag)}>{clearingId === row.id ? 'Clearing' : 'Clear'}</button>}
                    <button type="button" className={cn('ez-btn ez-btn--sm', row ? 'ez-btn--ghost' : 'ez-btn--primary')} onClick={() => openSheet(tag)}>{row ? 'Send a new bill' : 'Send bill'}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-5 max-w-[560px] text-[13.5px] text-faint">A bill stays on its table for {GRACE_WINDOW_MINUTES} minutes or until a guest saves it. Whoever taps the tag in that time sees this bill, so clear a table when the guests have left.</p>
      </div>

      <Sheet open={!!sheetTag} onOpenChange={(o) => { if (!o) closeSheet(); }} label="Send a bill" title={sheetTag?.label || ''}>
        <div className="space-y-4">
          <Field id="staff-total" label="Bill total" hint="The guest sees this at once, while the photo is read.">
            <input id="staff-total" type="number" min="0" step="0.01" inputMode="decimal" className={cn(INPUT, 'ez-num')} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="412" autoFocus />
          </Field>
          {preview ? (
            <div>
              <img src={preview} alt="The bill you photographed" className="max-h-56 w-full rounded-[14px] border border-line-soft bg-surface object-contain" />
              <button type="button" className="mt-2 text-[14px] font-medium text-dim underline decoration-line underline-offset-4 hover:text-fg" onClick={() => pickFile(null)}>Take it again</button>
            </div>
          ) : (
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line text-[14.5px] font-medium text-dim hover:border-brand hover:text-fg">
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
              <Camera className="h-5 w-5" strokeWidth={1.75} /> Photograph the printed bill
            </label>
          )}
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" className="ez-btn ez-btn--ghost" onClick={closeSheet}>Cancel</button>
            <button type="button" className="ez-btn ez-btn--primary disabled:opacity-40" disabled={!file || !amount || submitting} onClick={sendBill}>{submitting ? 'Sending' : 'Send to the table'}</button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
