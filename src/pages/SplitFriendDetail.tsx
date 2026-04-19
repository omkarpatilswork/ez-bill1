import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Receipt, Check, IndianRupee, Plus } from 'lucide-react';

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

export default function SplitFriendDetail() {
  const { friendKey } = useParams<{ friendKey: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenseTitles, setExpenseTitles] = useState<Record<string, string>>({});
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [loading, setLoading] = useState(true);

  const decoded = decodeURIComponent(friendKey || '');
  const isNameKey = decoded.startsWith('name:');
  const friendId = isNameKey ? null : decoded;
  const fallbackName = isNameKey ? decoded.slice(5) : '';

  const reload = async () => {
    if (!user) return;
    let sQuery = supabase.from('bill_splits').select('*').eq('user_id', user.id).eq('is_self', false);
    let pQuery = supabase.from('split_payments').select('*').eq('user_id', user.id);
    if (friendId) {
      sQuery = sQuery.eq('friend_id', friendId);
      pQuery = pQuery.eq('friend_id', friendId);
    } else {
      sQuery = sQuery.is('friend_id', null).eq('friend_name', fallbackName);
      pQuery = pQuery.is('friend_id', null).eq('friend_name', fallbackName);
    }
    const [sRes, pRes] = await Promise.all([sQuery.order('created_at', { ascending: false }), pQuery.order('paid_at', { ascending: false })]);
    const splitData = (sRes.data as any[]) || [];
    setSplits(splitData);
    setPayments((pRes.data as any[]) || []);

    const ids = Array.from(new Set(splitData.map(s => s.expense_id)));
    if (ids.length > 0) {
      const { data: exps } = await supabase.from('expenses').select('id,title,merchant').in('id', ids);
      const map: Record<string, string> = {};
      (exps as any[] || []).forEach(e => { map[e.id] = e.merchant || e.title; });
      setExpenseTitles(map);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, [user, friendKey]);

  const friendName = splits[0]?.friend_name || payments[0]?.friend_name || fallbackName || 'Friend';
  const owed = splits.filter(s => s.status === 'pending').reduce((s, x) => s + Number(x.amount), 0);
  const paid = payments.filter(p => p.direction === 'received').reduce((s, x) => s + Number(x.amount), 0);
  const net = owed - paid;

  const handleMarkAllSettled = async () => {
    if (!user) return;
    const pending = splits.filter(s => s.status === 'pending');
    if (pending.length === 0) return;
    const ids = pending.map(s => s.id);
    await supabase.from('bill_splits').update({ status: 'settled' } as any).in('id', ids);
    if (net > 0) {
      await supabase.from('split_payments').insert({
        user_id: user.id,
        friend_id: friendId,
        friend_name: friendName,
        amount: net,
        direction: 'received',
        note: 'Marked all settled',
      } as any);
    }
    toast({ title: 'All splits marked settled ✅' });
    reload();
  };

  const handleRecordPayment = async () => {
    if (!user) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    await supabase.from('split_payments').insert({
      user_id: user.id,
      friend_id: friendId,
      friend_name: friendName,
      amount: amt,
      direction: 'received',
      note: payNote || '',
    } as any);
    setPayAmount(''); setPayNote(''); setShowPay(false);
    toast({ title: 'Payment recorded ✅' });
    reload();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate('/splits')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1 truncate">{friendName}</h1>
      </div>

      {/* Net card */}
      <div className="glass-card rounded-2xl p-5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Net balance</p>
        {Math.abs(net) < 0.5 ? (
          <p className="text-xl font-bold text-foreground">All settled ✓</p>
        ) : net > 0 ? (
          <p className="text-2xl font-bold text-success tabular-nums">
            ₹{net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            <span className="text-xs font-normal text-muted-foreground ml-2">owed to you</span>
          </p>
        ) : (
          <p className="text-2xl font-bold text-destructive tabular-nums">
            ₹{Math.abs(net).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            <span className="text-xs font-normal text-muted-foreground ml-2">you owe</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button size="sm" variant="outline" className="glass-button border-0" onClick={() => setShowPay(s => !s)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Record Payment
          </Button>
          <Button size="sm" onClick={handleMarkAllSettled} disabled={splits.every(s => s.status === 'settled')}>
            <Check className="h-3.5 w-3.5 mr-1" /> Mark All Settled
          </Button>
        </div>
        {showPay && (
          <div className="mt-3 space-y-2">
            <Input type="number" inputMode="decimal" placeholder="Amount" value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              className="bg-secondary/30 border-border/30" />
            <Input placeholder="Note (optional)" value={payNote}
              onChange={e => setPayNote(e.target.value)}
              className="bg-secondary/30 border-border/30" />
            <Button size="sm" className="w-full" onClick={handleRecordPayment}>Save Payment</Button>
          </div>
        )}
      </div>

      {/* Splits list */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Bills shared</p>
        {splits.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No shared bills yet.</p>
        ) : (
          <div className="space-y-2">
            {splits.map(s => (
              <Link key={s.id} to={`/expenses/${s.expense_id}`}
                className="block glass-card rounded-xl p-3 flex items-center gap-3 active:scale-[0.99]">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{expenseTitles[s.expense_id] || 'Bill'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {s.status === 'settled' ? 'Settled' : 'Pending'}
                  </p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${s.status === 'settled' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  ₹{Number(s.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Payments history */}
      {payments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">Payments</p>
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="glass-card rounded-xl p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <IndianRupee className="h-4 w-4 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.note || 'Payment received'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(p.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className="text-sm font-bold text-success tabular-nums">
                  +₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
