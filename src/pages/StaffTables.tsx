import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, CheckCircle2, Wifi } from 'lucide-react';

// Tier-1 pilot staff screen: no POS integration, just "photograph the closed
// bill, mark it ready" — this is what makes a table's NFC tag start handing
// out that receipt. Protected route; any signed-in user for the pilot —
// tighten to a real staff role before a wider rollout.
// See supabase/functions/resolve-tag and the NFC Airdrop feature doc.

interface BillTag { tag_id: string; label: string; merchant_name: string }

export default function StaffTables() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tags, setTags] = useState<BillTag[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justMarked, setJustMarked] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('bill_tags' as any).select('*').order('label').then(({ data }) => {
      setTags((data as unknown as BillTag[]) || []);
    });
  }, []);

  const markReady = async (tagId: string) => {
    if (!user || !file) return;
    setSubmitting(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${tagId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pending-receipts').upload(filePath, file);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('tag_pending_bills' as any).insert({
        tag_id: tagId,
        file_path: filePath,
        amount: amount ? Number(amount) : null,
        created_by: user.id,
      } as any);
      if (insErr) throw insErr;

      setJustMarked(tagId);
      setActiveTag(null);
      setFile(null);
      setAmount('');
      toast({ title: 'Bill ready to tap', description: `${tags.find(t => t.tag_id === tagId)?.label} can now be tapped for this receipt.` });
      setTimeout(() => setJustMarked(null), 4000);
    } catch (err: any) {
      toast({ title: 'Could not mark ready', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">NFC Tables — Staff</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        When a table's bill closes, snap a photo of the printed bill here and mark it ready.
        The table's NFC tag / QR code will immediately start handing that receipt to whoever taps it.
      </p>

      <div className="space-y-3">
        {tags.map(tag => (
          <Card key={tag.tag_id} className="border-0 glass-card rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                {tag.label}
                {justMarked === tag.tag_id && (
                  <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeTag === tag.tag_id ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Bill photo</Label>
                    <Input type="file" accept="image/*,.pdf" capture="environment"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="min-h-[40px] bg-secondary/30 border-border/30 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (optional, shows while AI reads the photo)</Label>
                    <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0.00" className="min-h-[40px] bg-secondary/30 border-border/30 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 min-h-[40px]" disabled={!file || submitting} onClick={() => markReady(tag.tag_id)}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1.5" /> Mark ready</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => { setActiveTag(null); setFile(null); setAmount(''); }}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="outline" className="w-full min-h-[40px]" onClick={() => setActiveTag(tag.tag_id)}>
                  Upload closed bill
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {tags.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No tags provisioned yet — add rows to bill_tags in Supabase.</p>
        )}
      </div>
    </div>
  );
}
