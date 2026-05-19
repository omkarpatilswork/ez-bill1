import SEO from '@/components/SEO';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Repeat, Loader2, ExternalLink, Calendar, Sparkles,
  Plus, Mail, X, Check, Inbox, Link2, Trash2, Pencil, FileText,
} from 'lucide-react';
import {
  POPULAR_SERVICES, getServiceByKey, matchService, type PopularService,
} from '@/lib/popular-subscriptions';

interface SubRow {
  id: string;
  service_key: string;
  service_name: string;
  category: string;
  source: string;                        // 'gmail' | 'manual'
  email_status: string;                  // 'active' | 'cancelled'
  user_confirmed_status: string | null;  // 'subscribed' | 'unsubscribed' | null
  last_email_subject: string | null;
  last_email_from: string | null;
  last_email_date: string | null;        // doubles as "last billed" date
  last_amount: number | null;
  email_count: number;
  created_at: string;
  next_billing_date?: string | null;
  billing_cycle?: string | null;         // 'monthly' | 'yearly' | 'weekly'
  currency?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  started_at?: string | null;
  last_email_snippet?: string | null;
}

function cycleDays(cycle?: string | null): number {
  if (cycle === 'yearly') return 365;
  if (cycle === 'weekly') return 7;
  return 30;
}
function currencySymbol(c?: string | null): string {
  switch ((c || 'INR').toUpperCase()) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default: return '₹';
  }
}
function fmtMoney(n: number, currency?: string | null) {
  return `${currencySymbol(currency)}${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtINR(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function monthlyEquivalent(amount: number, cycle?: string | null): number {
  if (!amount) return 0;
  if (cycle === 'yearly') return amount / 12;
  if (cycle === 'weekly') return amount * 4.33;
  return amount;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function nextRenewal(row: Pick<SubRow, 'next_billing_date' | 'last_email_date' | 'billing_cycle'>): Date | null {
  if (row.next_billing_date) {
    const d = new Date(row.next_billing_date);
    if (!isNaN(d.getTime())) return d;
  }
  if (!row.last_email_date) return null;
  const cd = cycleDays(row.billing_cycle) * 86400000;
  let next = new Date(row.last_email_date).getTime() + cd;
  while (next < Date.now()) next += cd;
  return new Date(next);
}
function cycleLabel(cycle?: string | null): string {
  if (cycle === 'yearly') return '/yr';
  if (cycle === 'weekly') return '/wk';
  return '/mo';
}

export default function Subscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SubRow[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanAnalyzed, setScanAnalyzed] = useState(0);
  const [lastScanResult, setLastScanResult] = useState<{ scanned: number; total: number; detected: number } | null>(null);

  const [editing, setEditing] = useState<SubRow | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('detected_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_email_date', { ascending: false, nullsFirst: false });
    setRows((data as SubRow[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
      try {
        const { data: g } = await supabase.functions.invoke('gmail-auth', { body: { action: 'status' } });
        if (g?.connected) setGmailConnected(true);
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  /* ------- derived ------- */
  const mySubs = useMemo(
    () => rows.filter(r =>
      (r.source === 'manual') ||
      (r.user_confirmed_status === 'subscribed') ||
      (r.email_status === 'active' && r.user_confirmed_status !== 'unsubscribed')
    ),
    [rows]
  );
  const pendingConfirm = useMemo(
    () => rows.filter(r =>
      r.source !== 'manual' &&
      r.user_confirmed_status === null &&
      r.email_status === 'active'
    ),
    [rows]
  );
  const confirmedOrManual = useMemo(
    () => mySubs.filter(r => r.source === 'manual' || r.user_confirmed_status === 'subscribed'),
    [mySubs]
  );
  const totalMonthly = useMemo(
    () => confirmedOrManual.reduce(
      (s, r) => s + monthlyEquivalent(Number(r.last_amount) || 0, r.billing_cycle),
      0,
    ),
    [confirmedOrManual]
  );

  const nextDueRow = useMemo(() => {
    const withDates = confirmedOrManual
      .map(r => ({ r, next: nextRenewal(r) }))
      .filter(x => x.next) as { r: SubRow; next: Date }[];
    withDates.sort((a, b) => a.next.getTime() - b.next.getTime());
    return withDates[0] || null;
  }, [confirmedOrManual]);

  /* ------- actions ------- */
  const handleScanInbox = async () => {
    if (!gmailConnected) { navigate('/email-bills'); return; }
    setScanning(true); setScanProgress(0); setScanAnalyzed(0); setLastScanResult(null);
    const started = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - started;
      setScanProgress(Math.min(90, Math.round((elapsed / 12000) * 90)));
      setScanAnalyzed(Math.min(100, Math.round((elapsed / 12000) * 100)));
    }, 200);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-subscription-scan', { body: { days: 180 } });
      if (error) throw error;
      const scanned = data?.scanned ?? scanAnalyzed;
      const total = data?.total_found ?? scanned;
      const detected = data?.detected_count ?? 0;
      setScanAnalyzed(scanned); setScanProgress(100);
      setLastScanResult({ scanned, total, detected });
      await load();
      toast({ title: 'Inbox scan complete', description: `${detected} subscription${detected === 1 ? '' : 's'} found.` });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err?.message || 'Could not scan inbox', variant: 'destructive' });
    } finally {
      clearInterval(tick);
      setScanning(false);
      setTimeout(() => setScanProgress(0), 1500);
    }
  };

  const confirmStatus = async (row: SubRow, status: 'subscribed' | 'unsubscribed') => {
    const { error } = await supabase.from('detected_subscriptions')
      .update({ user_confirmed_status: status }).eq('id', row.id);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, user_confirmed_status: status } : r));
    toast({ title: status === 'subscribed' ? 'Added to subscriptions' : 'Marked as cancelled', description: row.service_name });
  };

  const removeSub = async (row: SubRow) => {
    if (row.source === 'manual') {
      const { error } = await supabase.from('detected_subscriptions').delete().eq('id', row.id);
      if (error) { toast({ title: 'Could not remove', description: error.message, variant: 'destructive' }); return; }
      setRows(prev => prev.filter(r => r.id !== row.id));
    } else {
      await confirmStatus(row, 'unsubscribed');
    }
    toast({ title: 'Removed', description: row.service_name });
  };

  /* ------- render ------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto md:max-w-none animate-fade-in pb-24">
      <SEO title="Subscriptions" description="Track recurring subscriptions detected from your inbox and manage monthly spending in EZ Bill." path="/subscriptions" />
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')}
          className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" /> Subscriptions
          </h1>
          <p className="text-xs text-muted-foreground">Track every recurring payment in one place</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} className="rounded-xl">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
        </Button>
      </div>

      {/* Total monthly cost — hero */}
      <div className="glass-card rounded-3xl p-6 border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total monthly cost</p>
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-4xl font-bold text-foreground tabular-nums">{fmtINR(totalMonthly)}</p>
          <span className="text-xs text-muted-foreground">≈ {fmtINR(totalMonthly * 12)}/yr</span>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Active subscriptions</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{confirmedOrManual.length}</p>
          </div>
          {nextDueRow && (
            <div className="text-right">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Next renewal</p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {nextDueRow.r.service_name} · {fmtDate(nextDueRow.next.toISOString())}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Your subscriptions */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground">Your subscriptions</h2>
          <span className="text-[11px] text-muted-foreground">{confirmedOrManual.length} active</span>
        </div>

        {confirmedOrManual.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-center">
            <Repeat className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">No subscriptions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Scan your inbox or add one manually to start tracking.
            </p>
            <div className="flex gap-2 mt-4 justify-center">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="rounded-xl">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add manually
              </Button>
              <Button size="sm" onClick={handleScanInbox} disabled={scanning} className="rounded-xl">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Scan inbox
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {confirmedOrManual.map(r => {
              const svc = getServiceByKey(r.service_key) || matchService(r.service_name);
              const next = nextRenewal(r);
              const daysToNext = next ? Math.ceil((next.getTime() - Date.now()) / 86400000) : null;
              return (
                <div key={r.id} className="glass-card rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-xl">
                      {svc?.emoji || '🔁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">{r.service_name}</span>
                        <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                          {r.last_amount ? `${fmtMoney(r.last_amount, r.currency)}${cycleLabel(r.billing_cycle)}` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{r.category}</span>
                        {r.is_trial && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold">
                            Trial{r.trial_ends_at ? ` · ends ${fmtDate(r.trial_ends_at)}` : ''}
                          </span>
                        )}
                        {r.billing_cycle && r.billing_cycle !== 'monthly' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground capitalize">
                            {r.billing_cycle}
                          </span>
                        )}
                        {r.source === 'manual' ? (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            Manual
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary flex items-center gap-0.5">
                            <Mail className="h-2.5 w-2.5" /> Inbox
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>Started: <span className="text-foreground">{fmtDate(r.started_at || null)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>Last: <span className="text-foreground">{fmtDate(r.last_email_date)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Next: <span className="text-foreground">{next ? fmtDate(next.toISOString()) : '—'}</span>
                            {daysToNext !== null && daysToNext >= 0 && daysToNext <= 7 && (
                              <span className="ml-1 text-gold">in {daysToNext}d</span>
                            )}
                          </span>
                        </div>
                      </div>
                      {r.billing_cycle && r.billing_cycle !== 'monthly' && r.last_amount ? (
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          ≈ {fmtMoney(monthlyEquivalent(Number(r.last_amount), r.billing_cycle), r.currency)}/mo equivalent
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex gap-1.5 mt-2 justify-end">
                    <button
                      onClick={() => setEditing(r)}
                      className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    {svc?.cancelUrl && (
                      <a href={svc.cancelUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> Manage
                      </a>
                    )}
                    <button
                      onClick={() => removeSub(r)}
                      className="text-[11px] text-destructive hover:text-destructive/80 px-2 py-1 rounded-lg flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pending confirmation */}
      {pendingConfirm.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-primary" /> Review queue
            </h2>
            <span className="text-[11px] text-muted-foreground">{pendingConfirm.length} to confirm</span>
          </div>
          <p className="text-[11px] text-muted-foreground px-1 -mt-1">
            We found these in your inbox. Confirm what's right, edit what's off, or mark as not a subscription.
          </p>
          <div className="space-y-2">
            {pendingConfirm.map(row => {
              const svc = getServiceByKey(row.service_key);
              const monthly = row.last_amount
                ? monthlyEquivalent(Number(row.last_amount), row.billing_cycle)
                : null;
              return (
                <div key={row.id} className="glass-card rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-xl">
                      {svc?.emoji || '📩'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">{row.service_name}</span>
                        {row.last_amount ? (
                          <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                            {fmtMoney(row.last_amount, row.currency)}{cycleLabel(row.billing_cycle)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{row.category}</span>
                        {row.billing_cycle && row.billing_cycle !== 'monthly' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground capitalize">
                            {row.billing_cycle}
                          </span>
                        )}
                        {monthly !== null && row.billing_cycle && row.billing_cycle !== 'monthly' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                            ≈ {fmtMoney(monthly, row.currency)}/mo
                          </span>
                        )}
                        {row.last_email_date && (
                          <span className="text-[10px] text-muted-foreground">· {fmtDate(row.last_email_date)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Email evidence */}
                  {(row.last_email_subject || row.last_email_from || row.last_email_snippet) && (
                    <div className="mt-3 rounded-xl border border-border/40 bg-background/30 p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <FileText className="h-3 w-3" /> Source email
                        {row.email_count > 1 && (
                          <span className="ml-auto normal-case tracking-normal">+{row.email_count - 1} more</span>
                        )}
                      </div>
                      {row.last_email_subject && (
                        <p className="text-[11px] font-medium text-foreground line-clamp-2">{row.last_email_subject}</p>
                      )}
                      {row.last_email_from && (
                        <p className="text-[10px] text-muted-foreground truncate">from {row.last_email_from}</p>
                      )}
                      {row.last_email_snippet && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 italic">"{row.last_email_snippet}"</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => confirmStatus(row, 'subscribed')}
                      className="flex-1 rounded-xl bg-success/15 hover:bg-success/25 text-success border-success/30">
                      <Check className="h-3.5 w-3.5 mr-1.5" /> Add
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(row)}
                      className="rounded-xl">
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => confirmStatus(row, 'unsubscribed')}
                      className="rounded-xl">
                      <X className="h-3.5 w-3.5 mr-1.5" /> Not a sub
                    </Button>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setAdding(true)}
              className="w-full glass-card rounded-2xl p-3 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> We missed one — add manually
            </button>
          </div>
        </section>
      )}

      {/* Scan inbox CTA at bottom */}
      <div className="glass-card rounded-2xl p-4 border border-primary/20">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {scanning ? 'Scanning your inbox…'
                : gmailConnected ? 'Find more from your inbox'
                : 'Connect Gmail to auto-detect subscriptions'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scanning ? `Analyzed ${scanAnalyzed} email${scanAnalyzed === 1 ? '' : 's'}…`
                : lastScanResult ? `Last scan: ${lastScanResult.detected} found from ${lastScanResult.scanned} emails.`
                : 'We read renewal & welcome emails to spot Netflix, Spotify, ChatGPT and more.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleScanInbox} disabled={scanning} className="rounded-xl shrink-0">
            {scanning ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scanning</>
              : gmailConnected ? <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Scan</>
              : <><Link2 className="h-3.5 w-3.5 mr-1.5" /> Connect</>}
          </Button>
        </div>
        {(scanning || scanProgress > 0) && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-background/40 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-gold transition-[width] duration-300 ease-out"
                style={{ width: `${scanProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <SubscriptionDialog
        open={adding || !!editing}
        editing={editing}
        userId={user?.id || ''}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={async () => { await load(); setAdding(false); setEditing(null); }}
      />
    </div>
  );
}

/* ───────── Add / Edit dialog ───────── */
function SubscriptionDialog({
  open, editing, userId, onClose, onSaved,
}: {
  open: boolean;
  editing: SubRow | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [lastBilled, setLastBilled] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('Other');
  const [serviceKey, setServiceKey] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'weekly'>('monthly');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.service_name);
      setAmount(editing.last_amount ? String(editing.last_amount) : '');
      setLastBilled((editing.last_email_date || new Date().toISOString()).slice(0, 10));
      setCategory(editing.category || 'Other');
      setServiceKey(editing.service_key);
      setBillingCycle((editing.billing_cycle as any) || 'monthly');
    } else {
      setName(''); setAmount(''); setLastBilled(new Date().toISOString().slice(0, 10));
      setCategory('Other'); setServiceKey(''); setBillingCycle('monthly');
    }
  }, [open, editing]);

  const pickPopular = (svc: PopularService) => {
    setName(svc.name);
    setCategory(svc.category);
    setServiceKey(svc.key);
    if (!amount && svc.typical) setAmount(String(svc.typical));
  };

  const save = async () => {
    if (!name.trim() || !amount) {
      toast({ title: 'Name and amount required', variant: 'destructive' });
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('detected_subscriptions')
          .update({
            service_name: name.trim(),
            category,
            last_amount: amt,
            last_email_date: new Date(lastBilled).toISOString(),
            user_confirmed_status: 'subscribed',
            email_status: 'active',
            billing_cycle: billingCycle,
          })
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const key = serviceKey || `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const { error } = await supabase.from('detected_subscriptions').insert({
          user_id: userId,
          service_key: key,
          service_name: name.trim(),
          category,
          source: 'manual',
          email_status: 'active',
          user_confirmed_status: 'subscribed',
          last_amount: amt,
          last_email_date: new Date(lastBilled).toISOString(),
          email_count: 1,
          billing_cycle: billingCycle,
        });
        if (error) throw error;
      }
      toast({ title: editing ? 'Updated' : 'Added', description: name });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return POPULAR_SERVICES.filter(s => s.name.toLowerCase().includes(q)).slice(0, 5);
  }, [name]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit subscription' : 'Add subscription'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update the details of this subscription.' : 'Add any subscription that we didn\u2019t detect.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Name</Label>
            <Input id="sub-name" placeholder="e.g. Netflix, Apple One"
              value={name} onChange={(e) => setName(e.target.value)} />
            {!editing && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions.map(s => (
                  <button key={s.key} type="button" onClick={() => pickPopular(s)}
                    className="text-[11px] px-2 py-1 rounded-full bg-secondary hover:bg-secondary/70 text-foreground flex items-center gap-1">
                    <span>{s.emoji}</span>{s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sub-amount">Amount (₹)</Label>
              <Input id="sub-amount" type="number" inputMode="decimal" placeholder="499"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-cycle">Billing cycle</Label>
              <select
                id="sub-cycle" value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as any)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-last">Last billed</Label>
            <Input id="sub-last" type="date" value={lastBilled} onChange={(e) => setLastBilled(e.target.value)} />
            {amount && billingCycle !== 'monthly' && (
              <p className="text-[10px] text-muted-foreground">
                ≈ ₹{Math.round(monthlyEquivalent(parseFloat(amount) || 0, billingCycle)).toLocaleString('en-IN')}/mo equivalent
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-cat">Category</Label>
            <select
              id="sub-cat" value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {['OTT','Music','SaaS','Cloud','AI','Telecom','Fitness','Membership','News','Gaming','Other'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save' : 'Add subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
