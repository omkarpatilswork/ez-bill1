import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Repeat, Loader2, Tv, Cpu, Wifi, Dumbbell, Crown, Box,
  AlertTriangle, ExternalLink, CheckCircle2, Copy, Calendar, TrendingDown,
} from 'lucide-react';
import {
  detectSubscriptions, getCancelLink,
  type DetectedSubscription, type SubscriptionStatus,
} from '@/lib/subscription-engine';

const CAT_ICONS: Record<string, any> = {
  OTT: Tv, SaaS: Cpu, Telecom: Wifi, Fitness: Dumbbell, Membership: Crown, Other: Box,
};
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
  const [filter, setFilter] = useState<'all' | SubscriptionStatus>('all');

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

  const filtered = filter === 'all'
    ? summary.subscriptions
    : summary.subscriptions.filter(s => s.status === filter);

  const counts = {
    all: summary.subscriptions.length,
    active: summary.subscriptions.filter(s => s.status === 'active').length,
    low_use: summary.subscriptions.filter(s => s.status === 'low_use').length,
    unused: summary.subscriptions.filter(s => s.status === 'unused').length,
    duplicate: summary.subscriptions.filter(s => s.status === 'duplicate').length,
  };

  const handleCancel = (sub: DetectedSubscription) => {
    const link = getCancelLink(sub.merchant);
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
      toast({ title: `Opening ${sub.merchant}`, description: 'Cancel via the official page.' });
    } else {
      toast({
        title: 'No direct link',
        description: `Search "${sub.merchant} cancel subscription" or check your account settings.`,
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
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-24">
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
          <p className="text-xs text-muted-foreground">Recurring charges detected from your bills</p>
        </div>
      </div>

      {/* Summary Hero */}
      <div className="glass-card rounded-3xl p-6 border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total monthly cost</p>
        <p className="text-4xl font-bold text-foreground mb-4">₹{summary.totalMonthly.toLocaleString('en-IN')}</p>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/30">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Active</p>
            <p className="text-sm font-bold text-success">₹{summary.activeMonthly.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Wasted</p>
            <p className="text-sm font-bold text-destructive">₹{summary.leakMonthly.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Total subs</p>
            <p className="text-sm font-bold text-foreground">{counts.all}</p>
          </div>
        </div>

        {summary.leakMonthly > 0 && (
          <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <TrendingDown className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-foreground">
              You could save <span className="font-bold text-destructive">₹{(summary.leakMonthly * 12).toLocaleString('en-IN')}/year</span> by cancelling unused & duplicate subscriptions.
            </div>
          </div>
        )}
      </div>

      {/* Duplicates callout */}
      {summary.duplicates.length > 0 && (
        <div className="glass-card rounded-2xl p-4 border-l-2 border-gold/60">
          <div className="flex items-start gap-3">
            <Copy className="h-4 w-4 text-gold shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">Duplicate services found</p>
              {summary.duplicates.map(d => (
                <p key={d.category} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{d.category}:</span> {d.merchants.join(' + ')} — pick one
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter chips */}
      {counts.all > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {([
            ['all', `All (${counts.all})`],
            ['active', `Active (${counts.active})`],
            ['low_use', `Low use (${counts.low_use})`],
            ['unused', `Unused (${counts.unused})`],
            ['duplicate', `Duplicate (${counts.duplicate})`],
          ] as [typeof filter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === k
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Subscriptions list */}
      {summary.subscriptions.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Repeat className="mx-auto h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="font-medium text-foreground mb-1 text-sm">No subscriptions detected yet</p>
          <p className="text-xs text-muted-foreground">
            We need at least 2 recurring charges from the same merchant. Add more bills to surface subscriptions.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">No subscriptions in this filter.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(sub => {
            const Icon = CAT_ICONS[sub.category] || Box;
            const meta = STATUS_META[sub.status];
            const cancelLink = getCancelLink(sub.merchant);
            const renewal = new Date(sub.nextRenewalDate);
            const daysToRenewal = Math.ceil((renewal.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <div key={sub.rawKey} className="glass-card rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground truncate">{sub.merchant}</span>
                      <span className="text-sm font-bold tabular-nums text-foreground shrink-0">₹{sub.monthlyCost.toLocaleString('en-IN')}/mo</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {sub.category} · {sub.cadence} · {sub.occurrences}× charged
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {daysToRenewal > 0 ? `Renews in ${daysToRenewal}d` : `Renewed ${Math.abs(daysToRenewal)}d ago`}
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    Last: {sub.daysSinceLastUse}d ago
                  </div>
                </div>

                {(sub.status === 'unused' || sub.status === 'low_use' || sub.status === 'duplicate') ? (
                  <Button
                    size="sm"
                    onClick={() => handleCancel(sub)}
                    className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl"
                  >
                    {cancelLink ? <ExternalLink className="h-3.5 w-3.5 mr-2" /> : <AlertTriangle className="h-3.5 w-3.5 mr-2" />}
                    Cancel — Save ₹{(sub.monthlyCost * 12).toLocaleString('en-IN')}/yr
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-success py-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Looks healthy
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
