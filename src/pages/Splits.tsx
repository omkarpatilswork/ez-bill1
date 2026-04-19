import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, Users, TrendingUp, TrendingDown, Receipt } from 'lucide-react';

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
  paid_at: string;
}

interface FriendBalance {
  id: string;       // friend_id or name fallback
  name: string;
  owedToYou: number;     // they owe you (sum of their pending shares from your splits)
  youOwe: number;        // you owe them (not used in MVP — only when they create splits)
  paymentsReceived: number;
  net: number;           // positive = they owe you
  splitsCount: number;
}

export default function Splits() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [sRes, pRes] = await Promise.all([
        supabase.from('bill_splits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('split_payments').select('*').eq('user_id', user.id).order('paid_at', { ascending: false }),
      ]);
      setSplits((sRes.data as any) || []);
      setPayments((pRes.data as any) || []);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1">Splits</h1>
      </div>

      {/* Header summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">You're owed</p>
          </div>
          <p className="text-xl font-bold text-success tabular-nums">
            ₹{totalOwedToYou.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">You owe</p>
          </div>
          <p className="text-xl font-bold text-destructive tabular-nums">
            ₹{totalYouOwe.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Friends list */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Friends</p>
        {balances.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No splits yet</p>
            <p className="text-xs text-muted-foreground mb-4">Open a bill and tap "Split this bill" to get started.</p>
            <Button asChild size="sm"><Link to="/expenses">Browse Bills</Link></Button>
          </div>
        ) : (
          <div className="space-y-2">
            {balances.map(b => (
              <button key={b.id}
                onClick={() => navigate(`/splits/friend/${encodeURIComponent(b.id)}`)}
                className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
              >
                <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  {b.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.splitsCount} split{b.splitsCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  {Math.abs(b.net) < 0.5 ? (
                    <span className="text-xs text-muted-foreground">Settled</span>
                  ) : b.net > 0 ? (
                    <>
                      <p className="text-[10px] text-muted-foreground">owes you</p>
                      <p className="text-sm font-bold text-success tabular-nums">
                        ₹{b.net.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-muted-foreground">you owe</p>
                      <p className="text-sm font-bold text-destructive tabular-nums">
                        ₹{Math.abs(b.net).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </p>
                    </>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
