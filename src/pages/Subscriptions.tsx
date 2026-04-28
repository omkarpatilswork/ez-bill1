import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Repeat, Loader2, AlertTriangle, ExternalLink,
  CheckCircle2, Copy, Calendar, TrendingDown, Search, Sparkles,
  PiggyBank, Plus, Mail, X, Check, Inbox, Link2,
} from 'lucide-react';
import {
  detectSubscriptions, detectLikelySubscriptions, getCancelLink,
  type DetectedSubscription, type SubscriptionStatus,
} from '@/lib/subscription-engine';
import {
  POPULAR_SERVICES, POPULAR_CATEGORIES, matchService, getServiceByKey,
  type PopularCategory, type PopularService,
} from '@/lib/popular-subscriptions';

const STATUS_META: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Active',    color: 'text-success',     bg: 'bg-success/15' },
  low_use:   { label: 'Low use',   color: 'text-gold',        bg: 'bg-gold/15' },
  unused:    { label: 'Unused',    color: 'text-destructive', bg: 'bg-destructive/15' },
  duplicate: { label: 'Duplicate', color: 'text-destructive', bg: 'bg-destructive/15' },
};

interface DetectedSubRow {
  id: string;
  service_key: string;
  service_name: string;
  category: string;
  source: string;
  email_status: string;                  // 'active' | 'cancelled'
  user_confirmed_status: string | null;  // 'subscribed' | 'unsubscribed' | null
  last_email_subject: string | null;
  last_email_from: string | null;
  last_email_date: string | null;
  last_amount: number | null;
  email_count: number;
}

export default function Subscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<PopularCategory | 'all'>('all');
  const [inboxSubs, setInboxSubs] = useState<DetectedSubRow[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);          // 0-100 simulated
  const [scanAnalyzed, setScanAnalyzed] = useState(0);          // animated count
  const [lastScanResult, setLastScanResult] = useState<{ scanned: number; total: number; detected: number } | null>(null);

  const loadInboxSubs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('detected_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_email_date', { ascending: false });
    setInboxSubs((data as DetectedSubRow[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const [{ data: exp }] = await Promise.all([
        supabase
        .from('expenses')
        .select('id, amount, expense_date, merchant, title')
        .eq('user_id', user.id)
        .gte('expense_date', sixMonthsAgo.toISOString().slice(0, 10))
          .order('expense_date', { ascending: true }),
      ]);
      setExpenses(exp || []);
      await loadInboxSubs();
      // Check Gmail connection (silent)
      try {
        const { data: gmailStatus } = await supabase.functions.invoke('gmail-auth', {
          body: { action: 'status' },
        });
        if (gmailStatus?.connected) setGmailConnected(true);
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  const summary = useMemo(() => detectSubscriptions(expenses), [expenses]);

  /** Likely subscriptions from a single bill (catalog match). */
  const likelyFromBills = useMemo(() => detectLikelySubscriptions(
    expenses,
    (text) => {
      const m = matchService(text);
      return m ? { key: m.key, name: m.name, category: m.category } : null;
    },
  ), [expenses]);

  /** Map each detected subscription back to a known PopularService (when possible). */
  const detectedByService = useMemo(() => {
    const map = new Map<string, DetectedSubscription>();
    for (const sub of summary.subscriptions) {
      const svc = matchService(sub.merchant) || matchService(sub.rawKey);
      if (svc) map.set(svc.name, sub);
    }
    return map;
  }, [summary]);

  /** Also flag merchants that appeared in expenses at least once (even if not recurring yet). */
  const seenInExpenses = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) {
      const svc = matchService(`${e.merchant || ''} ${e.title || ''}`);
      if (svc) set.add(svc.name);
    }
    return set;
  }, [expenses]);

  /** Inbox-detected subs keyed by service_key for fast lookup. */
  const inboxByKey = useMemo(() => {
    const map = new Map<string, DetectedSubRow>();
    for (const r of inboxSubs) map.set(r.service_key, r);
    return map;
  }, [inboxSubs]);

  /** Subs that need user confirmation: detected from inbox & not yet confirmed. */
  const pendingConfirm = useMemo(
    () => inboxSubs.filter(r => r.user_confirmed_status === null && r.email_status === 'active'),
    [inboxSubs],
  );

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return POPULAR_SERVICES.filter(s => {
      if (activeCat !== 'all' && s.category !== activeCat) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, activeCat]);

  /** A service is "active" if any of: recurring detection, inbox active+confirmed/unconfirmed, or seen in bills. */
  const isServiceActive = (svc: PopularService): boolean => {
    if (detectedByService.has(svc.name)) return true;
    const inbox = inboxByKey.get(svc.key);
    if (inbox && inbox.user_confirmed_status !== 'unsubscribed' && inbox.email_status === 'active') return true;
    if (likelyFromBills.some(l => l.serviceKey === svc.key)) return true;
    return false;
  };
  const activeFromCatalog = POPULAR_SERVICES.filter(isServiceActive).length;

  const handleCancel = (merchant: string, monthly: number) => {
    const link = getCancelLink(merchant);
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
      toast({ title: `Opening ${merchant}`, description: `You could save ₹${(monthly * 12).toLocaleString('en-IN')}/yr.` });
    } else {
      toast({
        title: 'Open the app to cancel',
        description: `Search "${merchant} cancel subscription" or check account settings.`,
      });
    }
  };

  const handleScanInbox = async () => {
    if (!gmailConnected) {
      navigate('/email-bills');
      return;
    }
    setScanning(true);
    setScanProgress(0);
    setScanAnalyzed(0);
    setLastScanResult(null);

    // Simulated progress while the edge function runs (typical: 8-15s).
    // Climbs toward 90% with an animated message counter (0 → ~100).
    const startedAt = Date.now();
    const targetMs = 12000;
    const targetCount = 100;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(90, Math.round((elapsed / targetMs) * 90));
      setScanProgress(pct);
      setScanAnalyzed(Math.min(targetCount, Math.round((elapsed / targetMs) * targetCount)));
    }, 200);

    try {
      const { data, error } = await supabase.functions.invoke('gmail-subscription-scan', {
        body: { days: 180 },
      });
      if (error) throw error;
      // Snap to real numbers from the server.
      const scanned = data?.scanned ?? scanAnalyzed;
      const total = data?.total_found ?? scanned;
      const detected = data?.detected_count ?? 0;
      setScanAnalyzed(scanned);
      setScanProgress(100);
      setLastScanResult({ scanned, total, detected });
      await loadInboxSubs();
      toast({
        title: 'Inbox scan complete',
        description: `Analyzed ${scanned} email${scanned === 1 ? '' : 's'} · ${detected} subscription${detected === 1 ? '' : 's'} found.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err?.message || 'Could not scan inbox', variant: 'destructive' });
    } finally {
      clearInterval(tick);
      setScanning(false);
      // Keep the result visible; reset progress after a beat so the bar stays full briefly.
      setTimeout(() => setScanProgress(0), 1500);
    }
  };

  const confirmStatus = async (row: DetectedSubRow, status: 'subscribed' | 'unsubscribed') => {
    const { error } = await supabase
      .from('detected_subscriptions')
      .update({ user_confirmed_status: status })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    setInboxSubs(prev => prev.map(r => r.id === row.id ? { ...r, user_confirmed_status: status } : r));
    toast({
      title: status === 'subscribed' ? 'Marked as active' : 'Marked as cancelled',
      description: row.service_name,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto md:max-w-none animate-fade-in pb-24">
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
          <p className="text-xs text-muted-foreground">Your one-page hub to track and cancel recurring spends</p>
        </div>
      </div>

      {/* Scan Inbox CTA — frictionless detection */}
      <div className="glass-card rounded-2xl p-4 border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {scanning
                ? 'Scanning your inbox…'
                : gmailConnected
                  ? 'Scan your inbox for subscriptions'
                  : 'Connect Gmail to find your subscriptions'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scanning
                ? `Analyzed ${scanAnalyzed} message${scanAnalyzed === 1 ? '' : 's'}…`
                : lastScanResult
                  ? `Last scan: analyzed ${lastScanResult.scanned} of ${lastScanResult.total} · ${lastScanResult.detected} found.`
                  : gmailConnected
                    ? 'We\u2019ll find renewal & welcome emails so nothing slips through.'
                    : 'Detect Netflix, Spotify, ChatGPT and 40+ services automatically.'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleScanInbox}
            disabled={scanning}
            className="rounded-xl shrink-0"
          >
            {scanning ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scanning</>
            ) : gmailConnected ? (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Scan</>
            ) : (
              <><Link2 className="h-3.5 w-3.5 mr-1.5" /> Connect</>
            )}
          </Button>
        </div>

        {/* Progress bar — visible while scanning or briefly after completion */}
        {(scanning || scanProgress > 0) && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-background/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-gold transition-[width] duration-300 ease-out"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
              <span>{scanning ? 'Reading email metadata…' : 'Done'}</span>
              <span className="tabular-nums">{scanProgress}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Hero summary */}
      <div className="glass-card rounded-3xl p-6 border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total monthly cost</p>
        <div className="flex items-baseline gap-2 mb-4">
          <p className="text-4xl font-bold text-foreground">₹{summary.totalMonthly.toLocaleString('en-IN')}</p>
          <span className="text-xs text-muted-foreground">≈ ₹{(summary.totalMonthly * 12).toLocaleString('en-IN')}/yr</span>
        </div>

        <div className="grid grid-cols-4 gap-3 pt-3 border-t border-border/30">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Active</p>
            <p className="text-sm font-bold text-success">₹{summary.activeMonthly.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Wasted</p>
            <p className="text-sm font-bold text-destructive">₹{summary.leakMonthly.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Detected</p>
            <p className="text-sm font-bold text-foreground">{summary.subscriptions.length}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Known apps</p>
            <p className="text-sm font-bold text-foreground">{activeFromCatalog}</p>
          </div>
        </div>

        {summary.leakMonthly > 0 && (
          <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <TrendingDown className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-foreground">
              You could save <span className="font-bold text-destructive">₹{(summary.leakMonthly * 12).toLocaleString('en-IN')}/yr</span> by cancelling unused & duplicate subscriptions.
            </div>
          </div>
        )}

        {summary.duplicates.length > 0 && (
          <div className="mt-3 flex items-start gap-3 p-3 rounded-xl bg-gold/10 border border-gold/20">
            <Copy className="h-4 w-4 text-gold shrink-0 mt-0.5" />
            <div className="text-xs text-foreground">
              <span className="font-semibold">Duplicates:</span>{' '}
              {summary.duplicates.map(d => `${d.category}: ${d.merchants.join(' + ')}`).join(' · ')} — pick one.
            </div>
          </div>
        )}
      </div>

      {/* Found in inbox — confirm Yes/No */}
      {pendingConfirm.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-primary" /> Found in your inbox
            </h2>
            <span className="text-[11px] text-muted-foreground">{pendingConfirm.length} to confirm</span>
          </div>
          <p className="text-[11px] text-muted-foreground px-1 -mt-1">
            We saw these in your email. Are you still subscribed?
          </p>
          <div className="space-y-2">
            {pendingConfirm.map(row => {
              const svc = getServiceByKey(row.service_key);
              const lastDate = row.last_email_date ? new Date(row.last_email_date) : null;
              return (
                <div key={row.id} className="glass-card rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-xl">
                      {svc?.emoji || '📩'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {row.service_name}
                        </span>
                        {row.last_amount ? (
                          <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                            ₹{row.last_amount.toLocaleString('en-IN')}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {row.category} · {row.email_count} email{row.email_count > 1 ? 's' : ''}
                          {lastDate && <> · last {lastDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() => confirmStatus(row, 'subscribed')}
                      className="flex-1 rounded-xl bg-success/15 hover:bg-success/25 text-success border border-success/30"
                      variant="outline"
                    >
                      <Check className="h-3.5 w-3.5 mr-1.5" /> Still subscribed
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => confirmStatus(row, 'unsubscribed')}
                      className="flex-1 rounded-xl"
                      variant="outline"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" /> No, cancelled
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Detected subscriptions (recurring with multiple charges) */}
      {summary.subscriptions.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Detected from your bills
            </h2>
            <span className="text-[11px] text-muted-foreground">{summary.subscriptions.length} found</span>
          </div>

          <div className="space-y-2">
            {summary.subscriptions.map(sub => {
              const svc = matchService(sub.merchant) || matchService(sub.rawKey);
              const meta = STATUS_META[sub.status];
              const cancelLink = getCancelLink(sub.merchant);
              const renewal = new Date(sub.nextRenewalDate);
              const daysToRenewal = Math.ceil((renewal.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const wasteful = sub.status === 'unused' || sub.status === 'low_use' || sub.status === 'duplicate';
              return (
                <div key={sub.rawKey} className="glass-card rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-xl">
                      {svc?.emoji || '🔁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {svc?.name || sub.merchant}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                          ₹{sub.monthlyCost.toLocaleString('en-IN')}/mo
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {sub.cadence} · {sub.occurrences}× · <Calendar className="h-2.5 w-2.5 inline -mt-0.5" />
                          {' '}{daysToRenewal > 0 ? `${daysToRenewal}d to renewal` : `renewed ${Math.abs(daysToRenewal)}d ago`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {wasteful && (
                    <Button
                      size="sm"
                      onClick={() => handleCancel(sub.merchant, sub.monthlyCost)}
                      className="w-full mt-3 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl"
                    >
                      {cancelLink ? <ExternalLink className="h-3.5 w-3.5 mr-2" /> : <AlertTriangle className="h-3.5 w-3.5 mr-2" />}
                      Cancel — Save ₹{(sub.monthlyCost * 12).toLocaleString('en-IN')}/yr
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Popular subscriptions catalog — auto checks if user has them */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <PiggyBank className="h-4 w-4 text-gold" /> Popular subscriptions
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {activeFromCatalog} of {POPULAR_SERVICES.length} active
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Netflix, Spotify, ChatGPT…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/60 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button onClick={() => setActiveCat('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCat === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}>
            All
          </button>
          {POPULAR_CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setActiveCat(c.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCat === c.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}>
              <span className="mr-1">{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {filteredCatalog.map(svc => (
            <PopularCard
              key={svc.name}
              svc={svc}
              detected={detectedByService.get(svc.name)}
              seen={seenInExpenses.has(svc.name)}
              inbox={inboxByKey.get(svc.key)}
              onCancel={handleCancel}
              onAdd={() => navigate('/expenses/new')}
            />
          ))}
        </div>

        {filteredCatalog.length === 0 && (
          <div className="glass-card rounded-2xl p-6 text-center text-sm text-muted-foreground">
            No services match your search.
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────── Popular service tile ───────── */
function PopularCard({
  svc, detected, seen, inbox, onCancel, onAdd,
}: {
  svc: PopularService;
  detected?: DetectedSubscription;
  seen: boolean;
  inbox?: DetectedSubRow;
  onCancel: (merchant: string, monthly: number) => void;
  onAdd: () => void;
}) {
  // Active if recurring detected, OR inbox shows active+confirmed/unconfirmed (not unsubscribed).
  const inboxActive = !!inbox && inbox.user_confirmed_status !== 'unsubscribed' && inbox.email_status === 'active';
  const isActive = !!detected || inboxActive;
  const meta = detected ? STATUS_META[detected.status] : null;
  const cost = detected?.monthlyCost ?? inbox?.last_amount ?? svc.typical ?? 0;
  const inboxCancelled = !!inbox && (inbox.email_status === 'cancelled' || inbox.user_confirmed_status === 'unsubscribed');

  return (
    <div
      className={`relative rounded-2xl p-3 select-none transition-colors ${
        isActive
          ? 'border border-primary/40 sub-tile sub-tile-active'
          : 'border border-border/30 sub-tile'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="h-9 w-9 rounded-xl bg-background/40 flex items-center justify-center text-lg shrink-0">
          {svc.emoji}
        </div>
        {inboxCancelled ? (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            Cancelled
          </span>
        ) : isActive ? (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-success/20 text-success flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Active
          </span>
        ) : seen ? (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold">
            Seen once
          </span>
        ) : (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
            Not active
          </span>
        )}
      </div>

      <p className="text-sm font-semibold text-foreground truncate">{svc.name}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{svc.category}</p>

      <div className="mt-2 flex items-baseline justify-between">
        <span className={`text-sm font-bold tabular-nums ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {cost > 0 ? `₹${cost.toLocaleString('en-IN')}` : '—'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {isActive ? '/mo' : svc.typical ? 'typical/mo' : ''}
        </span>
      </div>

      {isActive && meta && detected && (
        <div className="mt-2 flex items-center justify-between gap-1.5">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
            {meta.label}
          </span>
          {(detected.status === 'unused' || detected.status === 'low_use' || detected.status === 'duplicate') && (
            <button
              onClick={() => onCancel(detected.merchant, detected.monthlyCost)}
              className="text-[10px] font-semibold text-destructive hover:underline flex items-center gap-1"
            >
              Cancel <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {isActive && !detected && inbox && (
        <div className="mt-2 flex items-center justify-between gap-1.5">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary flex items-center gap-0.5">
            <Mail className="h-2.5 w-2.5" /> From inbox
          </span>
          {svc.cancelUrl && (
            <a
              href={svc.cancelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-semibold text-foreground hover:text-primary flex items-center gap-1"
            >
              Manage <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      )}

      {!isActive && (
        <button
          onClick={onAdd}
          className="mt-2 w-full text-[10px] font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1 rounded-lg bg-background/30"
        >
          <Plus className="h-2.5 w-2.5" /> I have this
        </button>
      )}
    </div>
  );
}
