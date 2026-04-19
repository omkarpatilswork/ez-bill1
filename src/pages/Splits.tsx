import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, ChevronRight, Users, Receipt, Plus, X,
  TrendingUp, TrendingDown, Activity, UserPlus, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

interface SplitRow {
  id: string;
  expense_id: string;
  friend_id: string | null;
  friend_name: string;
  amount: number;
  is_self: boolean;
  status: string;
  created_at: string;
}

interface PaymentRow {
  id: string;
  friend_id: string | null;
  friend_name: string;
  amount: number;
  direction: string;
  note: string | null;
  paid_at: string;
}

interface ExpenseLite {
  id: string;
  title: string;
  amount: number;
  merchant: string | null;
  expense_date: string;
  created_at: string;
}

interface FriendBalance {
  id: string;
  name: string;
  owedToYou: number;
  youOwe: number;
  paymentsReceived: number;
  net: number;
  splitsCount: number;
}

type ActivityItem =
  | { kind: 'split'; id: string; date: string; expense_id: string; expense_title: string; friend_name: string; amount: number }
  | { kind: 'payment'; id: string; date: string; friend_name: string; amount: number; direction: string; note: string | null };

const PALETTE = [
  'hsl(152, 45%, 40%)', 'hsl(43, 80%, 50%)', 'hsl(199, 70%, 45%)',
  'hsl(280, 50%, 55%)', 'hsl(0, 63%, 50%)', 'hsl(25, 80%, 50%)',
];
function colorFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}
function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Splits() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<Record<string, ExpenseLite>>({});
  const [recentExpenses, setRecentExpenses] = useState<ExpenseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'friends' | 'activity'>('friends');
  const [billPickerOpen, setBillPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [sRes, pRes, eRes] = await Promise.all([
        supabase.from('bill_splits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('split_payments').select('*').eq('user_id', user.id).order('paid_at', { ascending: false }),
        supabase.from('expenses').select('id,title,amount,merchant,expense_date,created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      ]);
      setSplits((sRes.data as any) || []);
      setPayments((pRes.data as any) || []);
      const exps = (eRes.data as any[]) || [];
      const map: Record<string, ExpenseLite> = {};
      exps.forEach(e => { map[e.id] = e; });
      setExpenses(map);
      setRecentExpenses(exps);
      setLoading(false);
    })();
  }, [user]);

  const balances = useMemo<FriendBalance[]>(() => {
    const map = new Map<string, FriendBalance>();
    splits.filter(s => !s.is_self).forEach(s => {
      const key = s.friend_id || `name:${s.friend_name}`;
      const b = map.get(key) || {
        id: key, name: s.friend_name, owedToYou: 0, youOwe: 0,
        paymentsReceived: 0, net: 0, splitsCount: 0,
      };
      b.owedToYou += Number(s.amount);
      b.splitsCount += 1;
      map.set(key, b);
    });
    payments.forEach(p => {
      const key = p.friend_id || `name:${p.friend_name}`;
      const b = map.get(key);
      if (!b) return;
      if (p.direction === 'received') b.paymentsReceived += Number(p.amount);
    });
    const out: FriendBalance[] = [];
    map.forEach(b => {
      b.net = b.owedToYou - b.paymentsReceived - b.youOwe;
      out.push(b);
    });
    return out.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [splits, payments]);

  const totalOwedToYou = balances.reduce((s, b) => s + Math.max(0, b.net), 0);
  const totalYouOwe = balances.reduce((s, b) => s + Math.max(0, -b.net), 0);
  const netBalance = totalOwedToYou - totalYouOwe;

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    splits.filter(s => !s.is_self).forEach(s => {
      const exp = expenses[s.expense_id];
      items.push({
        kind: 'split',
        id: s.id,
        date: s.created_at,
        expense_id: s.expense_id,
        expense_title: exp?.title || 'Bill',
        friend_name: s.friend_name,
        amount: Number(s.amount),
      });
    });
    payments.forEach(p => {
      items.push({
        kind: 'payment',
        id: p.id,
        date: p.paid_at,
        friend_name: p.friend_name,
        amount: Number(p.amount),
        direction: p.direction,
        note: p.note,
      });
    });
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);
  }, [splits, payments, expenses]);

  // Bills already split (to surface in recent list with badge)
  const splitExpenseIds = useMemo(() => new Set(splits.map(s => s.expense_id)), [splits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 px-1 pt-1 pb-3">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1">Splits</h1>
        <button
          onClick={() => setBillPickerOpen(true)}
          className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" />
          Split a bill
        </button>
      </div>

      {/* HERO: overall balance */}
      <div className="glass-card rounded-2xl p-5 mb-3 relative overflow-hidden">
        <div className="liquid-shimmer absolute inset-0 z-0" />
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Overall balance
          </p>
          {Math.abs(netBalance) < 0.5 ? (
            <p className="text-2xl font-bold text-foreground tabular-nums">You're all settled up</p>
          ) : netBalance > 0 ? (
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">You are owed overall</p>
              <p className="text-3xl font-bold text-success tabular-nums">
                ₹{netBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">You owe overall</p>
              <p className="text-3xl font-bold text-destructive tabular-nums">
                ₹{Math.abs(netBalance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="rounded-xl p-3"
              style={{ background: 'hsla(152, 45%, 25%, 0.15)', border: '1px solid hsla(152, 45%, 40%, 0.18)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownLeft className="h-3 w-3 text-success" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">You're owed</p>
              </div>
              <p className="text-base font-bold text-success tabular-nums">
                ₹{totalOwedToYou.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-xl p-3"
              style={{ background: 'hsla(0, 50%, 25%, 0.15)', border: '1px solid hsla(0, 50%, 50%, 0.18)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight className="h-3 w-3 text-destructive" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">You owe</p>
              </div>
              <p className="text-base font-bold text-destructive tabular-nums">
                ₹{totalYouOwe.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-3"
        style={{ background: 'hsla(160, 12%, 14%, 0.5)', border: '1px solid hsla(160, 10%, 40%, 0.1)' }}>
        {[
          { id: 'friends' as const, label: 'Friends', icon: Users, count: balances.length },
          { id: 'activity' as const, label: 'Activity', icon: Activity, count: activity.length },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-primary-foreground/20' : 'bg-muted/40'
                }`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* FRIENDS TAB */}
      {tab === 'friends' && (
        <div className="space-y-3">
          {balances.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">No splits yet</p>
              <p className="text-xs text-muted-foreground mb-4">Split your first bill with friends</p>
              <Button size="sm" className="rounded-xl" onClick={() => setBillPickerOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Split a bill
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {balances.map(b => {
                const settled = Math.abs(b.net) < 0.5;
                const owesYou = b.net > 0;
                return (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/splits/friend/${encodeURIComponent(b.id)}`)}
                    className="w-full glass-card-hover rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                  >
                    <div
                      className="h-11 w-11 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                      style={{ background: colorFromName(b.name) }}
                    >
                      {initials(b.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                      {settled ? (
                        <p className="text-[11px] text-muted-foreground">All settled up</p>
                      ) : owesYou ? (
                        <p className="text-[11px] text-muted-foreground">
                          owes you · {b.splitsCount} split{b.splitsCount === 1 ? '' : 's'}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          you owe · {b.splitsCount} split{b.splitsCount === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {settled ? (
                        <span className="text-[11px] text-muted-foreground">settled</span>
                      ) : (
                        <p className={`text-base font-bold tabular-nums ${owesYou ? 'text-success' : 'text-destructive'}`}>
                          ₹{Math.abs(b.net).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Recent bills surface — quick entry to split or revisit */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-foreground">Recent bills</p>
              <Link to="/expenses" className="text-[11px] text-gold font-medium flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {recentExpenses.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">No bills yet</p>
            ) : (
              <div className="space-y-1.5">
                {recentExpenses.slice(0, 5).map(exp => {
                  const alreadySplit = splitExpenseIds.has(exp.id);
                  return (
                    <button
                      key={exp.id}
                      onClick={() => navigate(`/expenses/${exp.id}/split`)}
                      className="w-full glass-card-hover rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                    >
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'hsla(152, 45%, 25%, 0.18)' }}>
                        <Receipt className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{exp.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground tabular-nums">
                          ₹{Number(exp.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                        {alreadySplit ? (
                          <span className="text-[10px] text-success font-semibold">Split</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Tap to split</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACTIVITY TAB */}
      {tab === 'activity' && (
        <div className="space-y-1.5">
          {activity.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Activity className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">No activity yet</p>
              <p className="text-xs text-muted-foreground">Splits and payments will appear here</p>
            </div>
          ) : (
            activity.map(item => {
              if (item.kind === 'split') {
                return (
                  <button
                    key={`s-${item.id}`}
                    onClick={() => navigate(`/expenses/${item.expense_id}`)}
                    className="w-full glass-card-hover rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                  >
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
                      style={{ background: colorFromName(item.friend_name) }}
                    >
                      {initials(item.friend_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">
                        <span className="font-semibold">{item.friend_name}</span>
                        <span className="text-muted-foreground"> on </span>
                        <span className="font-medium">{item.expense_title}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(item.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">owes you</p>
                      <p className="text-sm font-bold text-success tabular-nums">
                        ₹{item.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </button>
                );
              }
              return (
                <div
                  key={`p-${item.id}`}
                  className="glass-card rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'hsla(152, 45%, 25%, 0.2)' }}>
                    <ArrowDownLeft className="h-4 w-4 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">
                      <span className="font-semibold">{item.friend_name}</span>
                      <span className="text-muted-foreground"> paid you</span>
                      {item.note ? <span className="text-muted-foreground"> · {item.note}</span> : null}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(item.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-success tabular-nums">
                      +₹{item.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Bill picker modal */}
      {billPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'hsla(160, 10%, 6%, 0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setBillPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-xl max-h-[75vh] flex flex-col animate-slide-up glass-card border-border/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border/20">
              <h3 className="text-base font-bold text-foreground">Pick a bill to split</h3>
              <button
                onClick={() => setBillPickerOpen(false)}
                className="glass-button rounded-full h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {recentExpenses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">No bills yet</p>
                  <Button asChild size="sm" className="rounded-xl">
                    <Link to="/expenses/new"><Plus className="h-4 w-4 mr-1.5" /> Create a bill</Link>
                  </Button>
                </div>
              ) : (
                recentExpenses.map(exp => {
                  const alreadySplit = splitExpenseIds.has(exp.id);
                  return (
                    <button key={exp.id}
                      onClick={() => {
                        setBillPickerOpen(false);
                        navigate(`/expenses/${exp.id}/split`);
                      }}
                      className="w-full text-left glass-card-hover rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-foreground truncate mr-2">{exp.title}</span>
                        <span className="font-bold text-sm tabular-nums text-foreground">
                          ₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground truncate">
                          {exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        {alreadySplit && (
                          <span className="text-[10px] text-success font-semibold ml-2 shrink-0">Already split</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-border/20">
              <Button asChild variant="outline" size="sm" className="w-full rounded-xl">
                <Link to="/expenses/new" onClick={() => setBillPickerOpen(false)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Create new bill
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
