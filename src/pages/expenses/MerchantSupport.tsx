import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Phone, Globe, Mail, MapPin, Star, ExternalLink,
  Store, Clock, RotateCcw, Shield, ShieldCheck, ShieldAlert,
  AlertTriangle, Search, Package, Calendar, ChevronRight,
  Headphones, HelpCircle, Truck, Tag, Info, Bell, BellOff
} from 'lucide-react';
import {
  getReminder, setReminder, removeReminder, ensureNotificationPermission,
  reminderEndDate, reminderTriggerDate, type ReturnReminder,
} from '@/lib/return-reminders';

interface SupportData {
  merchant: {
    name: string;
    normalized_name: string;
    logo_url: string | null;
    category: string;
  };
  contact: {
    phone: string | null;
    phone_confidence: 'high' | 'medium' | 'low';
    email: string | null;
    email_confidence: 'high' | 'medium' | 'low';
    working_hours: string | null;
  };
  website: {
    official_url: string | null;
    support_url: string | null;
    help_center_url: string | null;
    track_order_url: string | null;
  };
  location: {
    address: string | null;
    address_confidence: 'high' | 'medium' | 'low';
    google_maps_url: string | null;
  };
  returns_warranty: {
    return_eligible: boolean | null;
    return_window_days: number | null;
    exchange_policy: string | null;
    warranty_duration: string | null;
    warranty_conditions: string | null;
    policy_url: string | null;
    tags: string[];
  };
  confidence_scores: {
    overall: 'high' | 'medium' | 'low';
    sources: string[];
  };
}

interface BillContext {
  merchant: string;
  address: string;
  purchase_date: string;
  items: any[];
  category: string;
  amount: number;
  currency: string;
}

const LINE_ITEMS_MARKER = '::ITEMS::';
function parseStoredLineItems(desc: string | null | undefined): any[] {
  if (!desc) return [];
  const idx = desc.indexOf(LINE_ITEMS_MARKER);
  if (idx < 0) return [];
  try {
    const jsonStr = desc.slice(idx + LINE_ITEMS_MARKER.length);
    const endIdx = jsonStr.indexOf('::END_ITEMS::');
    return JSON.parse(endIdx >= 0 ? jsonStr.slice(0, endIdx) : jsonStr);
  } catch { return []; }
}

function parseField(description: string | null | undefined, key: string): string {
  if (!description) return '';
  const match = description.match(new RegExp(`${key}:\\s*([^|]+)`));
  return match ? match[1].trim() : '';
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  if (level === 'high') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
      <ShieldCheck className="h-2.5 w-2.5" /> Verified
    </span>
  );
  if (level === 'medium') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
      <Shield className="h-2.5 w-2.5" /> Trusted source
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full">
      <ShieldAlert className="h-2.5 w-2.5" /> Estimated
    </span>
  );
}

function SectionSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-3 animate-pulse">
      <Skeleton className="h-3 w-20 bg-white/5" />
      <Skeleton className="h-10 w-full bg-white/5 rounded-lg" />
      <Skeleton className="h-10 w-full bg-white/5 rounded-lg" />
    </div>
  );
}

const categoryIcons: Record<string, string> = {
  electronics: '🔌', apparel: '👕', grocery: '🛒', restaurant: '🍽️',
  fuel: '⛽', pharmacy: '💊', travel: '✈️', entertainment: '🎬',
  utilities: '💡', services: '🔧', other: '🏪',
};

export default function MerchantSupport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [billContext, setBillContext] = useState<BillContext | null>(null);
  const [supportData, setSupportData] = useState<SupportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminderState] = useState<ReturnReminder | null>(null);
  const [notifyDays, setNotifyDays] = useState<number>(2);

  // Load existing reminder for this bill
  useEffect(() => {
    if (!id) return;
    const r = getReminder(id);
    if (r) {
      setReminderState(r);
      setNotifyDays(r.notify_days_before);
    }
  }, [id]);

  // Step 1: Load bill data
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('expenses')
        .select('merchant, description, expense_date, amount, currency, category_id')
        .eq('id', id)
        .single();

      if (fetchError || !data) {
        setError('Could not load bill data.');
        setLoading(false);
        return;
      }

      const d = data as any;
      const items = parseStoredLineItems(d.description);
      const address = parseField(d.description, 'Address') || '';
      const category = parseField(d.description, 'Category') || '';

      setBillContext({
        merchant: d.merchant || '',
        address,
        purchase_date: d.expense_date || '',
        items,
        category,
        amount: d.amount || 0,
        currency: d.currency || 'INR',
      });
    })();
  }, [id]);

  // Step 2: Enrich merchant data
  useEffect(() => {
    if (!billContext || !billContext.merchant) {
      if (billContext) {
        setLoading(false);
        setError('No merchant found on this bill.');
      }
      return;
    }

    setEnriching(true);
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('merchant-support', {
          body: {
            merchant_name: billContext.merchant,
            merchant_address: billContext.address,
            purchase_date: billContext.purchase_date,
            items: billContext.items,
            category: billContext.category,
          },
        });

        if (fnError) throw fnError;
        if (!data) throw new Error('No support data returned.');

        const nextSupportData = data as SupportData;
        setSupportData(nextSupportData);

        const fallbackSource = nextSupportData.confidence_scores?.sources?.find((source) =>
          source.startsWith('system fallback:'),
        );

        if (fallbackSource) {
          const description = fallbackSource.includes('credits exhausted')
            ? 'AI enrichment is unavailable right now, so basic bill details are shown instead.'
            : fallbackSource.includes('rate limited')
              ? 'Live enrichment is busy right now, so basic bill details are shown instead.'
              : 'Some support info is temporarily unavailable, so we loaded the safest available details.';

          toast({
            title: 'Limited support info',
            description,
          });
        }
      } catch (e) {
        console.error('Enrichment error:', e);
        // Provide minimal fallback
        setSupportData({
          merchant: {
            name: billContext.merchant,
            normalized_name: billContext.merchant,
            logo_url: null,
            category: 'other',
          },
          contact: { phone: null, phone_confidence: 'low', email: null, email_confidence: 'low', working_hours: null },
          website: { official_url: null, support_url: null, help_center_url: null, track_order_url: null },
          location: {
            address: billContext.address || null,
            address_confidence: billContext.address ? 'high' : 'low',
            google_maps_url: `https://www.google.com/maps/search/${encodeURIComponent(billContext.merchant)}`,
          },
          returns_warranty: { return_eligible: null, return_window_days: null, exchange_policy: null, warranty_duration: null, warranty_conditions: null, policy_url: null, tags: [] },
          confidence_scores: { overall: 'low', sources: ['fallback'] },
        });
        toast({ title: 'Partial data loaded', description: 'Some support info may be unavailable.', variant: 'destructive' });
      } finally {
        setLoading(false);
        setEnriching(false);
      }
    })();
  }, [billContext]);

  // Compute warranty status
  const getWarrantyStatus = () => {
    if (!supportData?.returns_warranty || !billContext) return null;
    const { return_window_days, warranty_duration } = supportData.returns_warranty;
    const purchaseDate = new Date(billContext.purchase_date);
    const now = new Date();
    const daysSincePurchase = Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));

    const flags: { text: string; type: 'success' | 'warning' | 'danger' }[] = [];

    if (return_window_days !== null) {
      if (daysSincePurchase <= return_window_days) {
        flags.push({ text: `Return window open (${return_window_days - daysSincePurchase} days left)`, type: 'success' });
      } else {
        flags.push({ text: 'Return window expired', type: 'danger' });
      }
    }

    if (warranty_duration) {
      const yearsMatch = warranty_duration.match(/(\d+)\s*year/i);
      const monthsMatch = warranty_duration.match(/(\d+)\s*month/i);
      let warrantyDays = 0;
      if (yearsMatch) warrantyDays += parseInt(yearsMatch[1]) * 365;
      if (monthsMatch) warrantyDays += parseInt(monthsMatch[1]) * 30;

      if (warrantyDays > 0) {
        const warrantyEnd = new Date(purchaseDate);
        warrantyEnd.setDate(warrantyEnd.getDate() + warrantyDays);
        if (now < warrantyEnd) {
          const remainingDays = Math.floor((warrantyEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          flags.push({ text: `Warranty active till ${warrantyEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, type: 'success' });
        } else {
          flags.push({ text: 'Warranty expired', type: 'danger' });
        }
      }
    }

    return flags;
  };

  const warrantyFlags = supportData ? getWarrantyStatus() : null;
  const hasContact = supportData && (supportData.contact.phone || supportData.contact.email);
  const hasWebLinks = supportData && (supportData.website.official_url || supportData.website.support_url || supportData.website.help_center_url || supportData.website.track_order_url);
  const hasReturns = supportData && (supportData.returns_warranty.return_eligible !== null || supportData.returns_warranty.warranty_duration || supportData.returns_warranty.exchange_policy);
  const hasLocation = supportData && (supportData.location.address || supportData.location.google_maps_url);
  const returnWindowDays = supportData?.returns_warranty.return_window_days ?? null;
  const canSetReminder = !!(id && billContext?.purchase_date && returnWindowDays && returnWindowDays > 0);

  async function handleToggleReminder() {
    if (!id || !billContext || !returnWindowDays) return;
    if (reminder) {
      removeReminder(id);
      setReminderState(null);
      toast({ title: 'Reminder removed' });
      return;
    }
    const perm = await ensureNotificationPermission();
    const next: ReturnReminder = {
      expense_id: id,
      merchant: supportData?.merchant.normalized_name || billContext.merchant || 'Bill',
      purchase_date: billContext.purchase_date,
      return_window_days: returnWindowDays,
      notify_days_before: Math.min(notifyDays, Math.max(returnWindowDays - 1, 1)),
      created_at: new Date().toISOString(),
    };
    setReminder(next);
    setReminderState(next);
    const triggerOn = reminderTriggerDate(next).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    toast({
      title: 'Reminder set',
      description: perm === 'granted'
        ? `We'll notify you on ${triggerOn} before the return window ends.`
        : `Saved. Allow notifications in your browser to be alerted on ${triggerOn}.`,
    });
  }

  function handleChangeNotifyDays(v: number) {
    setNotifyDays(v);
    if (reminder && id) {
      const updated = { ...reminder, notify_days_before: v };
      setReminder(updated);
      setReminderState(updated);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 active:scale-[0.95]" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground">Support Hub</h1>
          <p className="text-xs text-muted-foreground truncate">Everything you need for this purchase</p>
        </div>
        {supportData?.confidence_scores && (
          <ConfidenceBadge level={supportData.confidence_scores.overall} />
        )}
      </div>

      {/* ─── Merchant Card ─── */}
      {loading ? (
        <div className="glass-card rounded-2xl p-5 space-y-3 animate-pulse">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-2xl bg-white/5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40 bg-white/5" />
              <Skeleton className="h-3 w-24 bg-white/5" />
            </div>
          </div>
        </div>
      ) : supportData ? (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-2xl">
              {categoryIcons[supportData.merchant.category] || '🏪'}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-foreground truncate">
                {supportData.merchant.normalized_name || supportData.merchant.name}
              </h2>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                {supportData.merchant.category.replace(/_/g, ' ')}
              </p>
              {billContext && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Purchased on {new Date(billContext.purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
            {enriching && (
              <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin shrink-0" />
            )}
          </div>

          {/* Quick actions row */}
          <div className="flex gap-2 mt-4">
            {supportData.contact.phone && (
              <a href={`tel:${supportData.contact.phone}`} className="flex-1">
                <Button variant="outline" className="w-full h-10 glass-button border-0 text-xs active:scale-[0.97]">
                  <Phone className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> Call
                </Button>
              </a>
            )}
            {supportData.website.official_url && (
              <a href={supportData.website.official_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" className="w-full h-10 glass-button border-0 text-xs active:scale-[0.97]">
                  <Globe className="h-3.5 w-3.5 mr-1.5 text-blue-400" /> Website
                </Button>
              </a>
            )}
            {supportData.location.google_maps_url && (
              <a href={supportData.location.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" className="w-full h-10 glass-button border-0 text-xs active:scale-[0.97]">
                  <MapPin className="h-3.5 w-3.5 mr-1.5 text-red-400" /> Maps
                </Button>
              </a>
            )}
          </div>
        </div>
      ) : null}

      {/* ─── Contact Section ─── */}
      {loading ? <SectionSkeleton /> : hasContact ? (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Contact
            </p>
          </div>

          {supportData!.contact.phone && (
            <a href={`tel:${supportData!.contact.phone}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all active:scale-[0.98]">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Phone className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground block">{supportData!.contact.phone}</span>
                <span className="text-[10px] text-muted-foreground">Customer Support</span>
              </div>
              <ConfidenceBadge level={supportData!.contact.phone_confidence} />
            </a>
          )}

          {supportData!.contact.email && (
            <a href={`mailto:${supportData!.contact.email}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all active:scale-[0.98]">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground block truncate">{supportData!.contact.email}</span>
                <span className="text-[10px] text-muted-foreground">Email Support</span>
              </div>
              <ConfidenceBadge level={supportData!.contact.email_confidence} />
            </a>
          )}

          {supportData!.contact.working_hours && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{supportData!.contact.working_hours}</span>
            </div>
          )}
        </div>
      ) : !loading && (
        <div className="glass-card rounded-2xl p-5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5 mb-2">
            <Phone className="h-3 w-3" /> Contact
          </p>
          <p className="text-sm text-muted-foreground italic">No verified contact info found for this merchant.</p>
        </div>
      )}

      {/* ─── Help & Support Links ─── */}
      {loading ? <SectionSkeleton /> : hasWebLinks ? (
        <div className="glass-card rounded-2xl p-5 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5 mb-1">
            <Headphones className="h-3 w-3" /> Help & Support
          </p>

          {supportData!.website.support_url && (
            <a href={supportData!.website.support_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all active:scale-[0.98]">
              <Headphones className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1">Contact Support</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}

          {supportData!.website.help_center_url && (
            <a href={supportData!.website.help_center_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all active:scale-[0.98]">
              <HelpCircle className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1">Help Center</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}

          {supportData!.website.track_order_url && (
            <a href={supportData!.website.track_order_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all active:scale-[0.98]">
              <Truck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1">Track Order / Raise Request</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}
        </div>
      ) : null}

      {/* ─── Returns & Warranty ─── */}
      {loading ? <SectionSkeleton /> : hasReturns ? (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5">
            <RotateCcw className="h-3 w-3" /> Returns & Warranty
          </p>

          {/* Status flags */}
          {warrantyFlags && warrantyFlags.length > 0 && (
            <div className="space-y-2">
              {warrantyFlags.map((flag, i) => (
                <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${
                  flag.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                  flag.type === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {flag.type === 'success' ? <ShieldCheck className="h-3.5 w-3.5" /> :
                   flag.type === 'warning' ? <AlertTriangle className="h-3.5 w-3.5" /> :
                   <AlertTriangle className="h-3.5 w-3.5" />}
                  {flag.text}
                </div>
              ))}
            </div>
          )}

          {/* Return eligibility */}
          {supportData!.returns_warranty.return_eligible !== null && (
            <div className="p-3 rounded-xl bg-secondary/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Return Eligible</p>
                <span className={`text-xs font-bold ${supportData!.returns_warranty.return_eligible ? 'text-emerald-400' : 'text-red-400'}`}>
                  {supportData!.returns_warranty.return_eligible ? 'Yes' : 'No'}
                </span>
              </div>
              {supportData!.returns_warranty.return_window_days && (
                <p className="text-xs text-muted-foreground mt-1">
                  Return window: {supportData!.returns_warranty.return_window_days} days from purchase
                </p>
              )}
            </div>
          )}

          {/* Exchange policy */}
          {supportData!.returns_warranty.exchange_policy && (
            <div className="p-3 rounded-xl bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground mb-1">Exchange Policy</p>
              <p className="text-sm text-foreground">{supportData!.returns_warranty.exchange_policy}</p>
            </div>
          )}

          {/* Warranty */}
          {supportData!.returns_warranty.warranty_duration && (
            <div className="p-3 rounded-xl bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground mb-1">Warranty</p>
              <p className="text-sm text-foreground">{supportData!.returns_warranty.warranty_duration}</p>
              {supportData!.returns_warranty.warranty_conditions && (
                <p className="text-xs text-muted-foreground mt-1">{supportData!.returns_warranty.warranty_conditions}</p>
              )}
            </div>
          )}

          {/* Tags */}
          {supportData!.returns_warranty.tags && supportData!.returns_warranty.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {supportData!.returns_warranty.tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
                  <Tag className="h-2.5 w-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Policy link */}
          {supportData!.returns_warranty.policy_url && (
            <a href={supportData!.returns_warranty.policy_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-primary hover:underline mt-1">
              View full return & warranty policy <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Return-window reminder toggle */}
          {canSetReminder && (
            <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${reminder ? 'bg-amber-500/15' : 'bg-secondary/40'}`}>
                  {reminder ? <Bell className="h-4 w-4 text-amber-400" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Notify before window ends</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {reminder
                      ? `Alert on ${reminderTriggerDate(reminder).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — window closes ${reminderEndDate(reminder).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`
                      : `Get a heads-up a few days before the ${returnWindowDays}-day return window closes.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={reminder ? 'outline' : 'default'}
                  className="h-8 text-xs shrink-0 active:scale-[0.97]"
                  onClick={handleToggleReminder}
                >
                  {reminder ? 'Off' : 'Turn on'}
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap pl-12">
                <span className="text-[11px] text-muted-foreground">Remind me</span>
                {[1, 2, 3, 7].filter(d => d < (returnWindowDays || 0)).map(d => (
                  <button
                    key={d}
                    onClick={() => handleChangeNotifyDays(d)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      notifyDays === d
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {d}d before
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : !loading && (
        <div className="glass-card rounded-2xl p-5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5 mb-2">
            <RotateCcw className="h-3 w-3" /> Returns & Warranty
          </p>
          <p className="text-sm text-muted-foreground italic">No return/warranty info available for this merchant.</p>
        </div>
      )}

      {/* ─── Location section removed per user request ─── */}

      {/* ─── Bill Insights section removed per user request ─── */}

      {/* ─── Data Sources ─── */}
      {!loading && supportData?.confidence_scores.sources && supportData.confidence_scores.sources.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>Sources: {supportData.confidence_scores.sources.join(' · ')}</span>
          </div>
        </div>
      )}

      {/* ─── Google Search section removed per user request ─── */}

      {/* ─── Error State ─── */}
      {error && !supportData && (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" className="glass-button border-0 text-xs active:scale-[0.97]" onClick={() => navigate(-1)}>
              Go Back
            </Button>
            <a href={`https://www.google.com/search?q=${encodeURIComponent((billContext?.merchant || 'merchant') + ' support India')}`}
              target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="glass-button border-0 text-xs active:scale-[0.97]">
                <Search className="h-3.5 w-3.5 mr-1.5" /> Search Manually
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
