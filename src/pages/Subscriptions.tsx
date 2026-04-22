import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Repeat, Loader2, AlertTriangle, ExternalLink,
  CheckCircle2, Copy, Calendar, TrendingDown, Search, Sparkles,
  PiggyBank, Plus,
} from 'lucide-react';
import {
  detectSubscriptions, getCancelLink,
  type DetectedSubscription, type SubscriptionStatus,
} from '@/lib/subscription-engine';
import {
  POPULAR_SERVICES, POPULAR_CATEGORIES, matchService,
  type PopularCategory, type PopularService,
} from '@/lib/popular-subscriptions';

const STATUS_META: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Active',    color: 'text-success',     bg: 'bg-success/15' },
  low_use:   { label: 'Low use',   color: 'text-gold',        bg: 'bg-gold/15' },
  unused:    { label: 'Unused',    color: 'text-destructive', bg: 'bg-destructive/15' },
  duplicate: { label: 'Duplicate', color: 'text-destructive', bg: 'bg-destructive/15' },
};

export default function Subscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<PopularCategory | 'all'>('all');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data } = await supabase
        .from('expenses')
        .select('id, amount, expense_date, merchant, title')
        .eq('user_id', user.id)
        .gte('expense_date', sixMonthsAgo.toISOString().slice(0, 10))
        .order('expense_date', { ascending: true });
      setExpenses(data || []);
      setLoading(false);
    })();
  }, [user]);

  const summary = useMemo(() => detectSubscriptions(expenses), [expenses]);

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

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return POPULAR_SERVICES.filter(s => {
      if (activeCat !== 'all' && s.category !== activeCat) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, activeCat]);

  const activeFromCatalog = POPULAR_SERVICES.filter(s => detectedByService.has(s.name)).length;

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
  svc, detected, seen, onCancel, onAdd,
}: {
  svc: PopularService;
  detected?: DetectedSubscription;
  seen: boolean;
  onCancel: (merchant: string, monthly: number) => void;
  onAdd: () => void;
}) {
  const isActive = !!detected;
  const meta = detected ? STATUS_META[detected.status] : null;
  const cost = detected?.monthlyCost ?? svc.typical ?? 0;

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
        {isActive ? (
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
