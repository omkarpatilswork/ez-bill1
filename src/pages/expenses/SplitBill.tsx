import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, UserPlus, Check, Users, Equal, ListChecks, X, ChevronDown, Settings2 } from 'lucide-react';
import { computeShares, validateCustomSplit, type SplitLineItem, type SplitParticipant, type SplitTotals } from '@/lib/split-engine';

interface Friend { id: string; name: string; phone?: string; email?: string; }

const LINE_ITEMS_MARKER = '::ITEMS::';
function parseStoredLineItems(desc: string | null | undefined): SplitLineItem[] {
  if (!desc) return [];
  const idx = desc.indexOf(LINE_ITEMS_MARKER);
  if (idx < 0) return [];
  try {
    const jsonStr = desc.slice(idx + LINE_ITEMS_MARKER.length);
    const endIdx = jsonStr.indexOf('::END_ITEMS::');
    return JSON.parse(endIdx >= 0 ? jsonStr.slice(0, endIdx) : jsonStr);
  } catch { return []; }
}
function parseField(d: string | null | undefined, k: string): string {
  if (!d) return '';
  const m = d.match(new RegExp(`${k}:\\s*([^|]+)`));
  return m ? m[1].trim() : '';
}

export default function SplitBill() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [expense, setExpense] = useState<any>(null);
  const [items, setItems] = useState<SplitLineItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [taxMode, setTaxMode] = useState<'proportional' | 'equal'>('proportional');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriend, setNewFriend] = useState({ name: '', phone: '', email: '' });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [tryConfirm, setTryConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const totals: SplitTotals = useMemo(() => {
    if (!expense) return { subtotal: 0, tax: 0, discount: 0, total: 0 };
    const total = Number(expense.amount) || 0;
    const tax = Number(parseField(expense.description, 'Tax')) || 0;
    const discount = Number(parseField(expense.description, 'Discount')) || 0;
    const subtotal = Number(parseField(expense.description, 'Subtotal')) || (total - tax + discount);
    return { subtotal, tax, discount, total };
  }, [expense]);

  // Whether tax/discount distribution is meaningful
  const hasTaxOrDiscount = totals.tax > 0.005 || totals.discount > 0.005;

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const [expRes, friendsRes, splitsRes] = await Promise.all([
        supabase.from('expenses').select('*').eq('id', id).single(),
        supabase.from('friends').select('*').eq('user_id', user.id).order('name'),
        supabase.from('bill_splits').select('*').eq('expense_id', id).eq('user_id', user.id),
      ]);
      const exp = expRes.data as any;
      setExpense(exp);
      const parsedItems = parseStoredLineItems(exp?.description);
      setItems(parsedItems);
      setFriends((friendsRes.data as any[]) || []);
      const existing = (splitsRes.data as any[]) || [];

      const selfP: SplitParticipant = {
        id: 'self', name: profile?.full_name?.split(' ')[0] || 'You', isSelf: true, items: [],
      };

      if (existing.length > 0) {
        const all: SplitParticipant[] = existing.map((s: any) => ({
          id: s.is_self ? 'self' : (s.friend_id || `name:${s.friend_name}`),
          name: s.friend_name,
          isSelf: !!s.is_self,
          items: Array.isArray(s.items) ? s.items : [],
        }));
        setParticipants(all);
        const allEqual = existing.every((s: any) => Math.abs(Number(s.amount) - Number(existing[0].amount)) < 0.01);
        setMode(allEqual && parsedItems.length === 0 ? 'equal' : (parsedItems.length > 0 ? 'custom' : 'equal'));
      } else {
        setParticipants([selfP]);
        // Default to custom when line items exist
        setMode(parsedItems.length > 0 ? 'custom' : 'equal');
      }
      setLoading(false);
    })();
  }, [id, user]);

  const toggleFriend = (f: Friend) => {
    setParticipants(prev => {
      if (prev.find(p => p.id === f.id)) return prev.filter(p => p.id !== f.id);
      return [...prev, { id: f.id, name: f.name, isSelf: false, items: [] }];
    });
  };

  const removeParticipant = (pid: string) => {
    if (pid === 'self') return; // Can't remove self
    setParticipants(prev => prev.filter(p => p.id !== pid));
  };

  const handleCreateFriend = async () => {
    if (!newFriend.name.trim() || !user) return;
    const { data, error } = await supabase.from('friends').insert({
      user_id: user.id,
      name: newFriend.name.trim(),
      phone: newFriend.phone.trim() || null,
      email: newFriend.email.trim() || null,
    } as any).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    const f = data as any;
    const friend = { id: f.id, name: f.name, phone: f.phone, email: f.email };
    setFriends(prev => [...prev, friend]);
    toggleFriend(friend);
    setNewFriend({ name: '', phone: '', email: '' });
    setShowAddFriend(false);
  };

  const toggleItem = (personId: string, itemIdx: number) => {
    setParticipants(prev => prev.map(p => {
      if (p.id !== personId) return p;
      const has = p.items.includes(itemIdx);
      return { ...p, items: has ? p.items.filter(i => i !== itemIdx) : [...p.items, itemIdx] };
    }));
  };

  const assignAll = (itemIdx: number) => {
    setParticipants(prev => prev.map(p => ({
      ...p,
      items: p.items.includes(itemIdx) ? p.items : [...p.items, itemIdx],
    })));
  };

  const shares = useMemo(
    () => computeShares(participants, items, totals, mode, taxMode),
    [participants, items, totals, mode, taxMode]
  );
  const validation = useMemo(
    () => mode === 'custom' && items.length > 0 ? validateCustomSplit(participants, items) : { valid: true, unassigned: [] as number[] },
    [mode, participants, items]
  );
  const assigned = shares.reduce((s, x) => s + x.amount, 0);

  const handleConfirm = async () => {
    if (!user || !id) return;
    if (participants.length < 2) {
      toast({ title: 'Add at least one friend', variant: 'destructive' }); return;
    }
    if (mode === 'custom' && !validation.valid) {
      setTryConfirm(true);
      toast({ title: 'Cannot save', description: validation.error, variant: 'destructive' }); return;
    }
    setSaving(true);
    await supabase.from('bill_splits').delete().eq('expense_id', id).eq('user_id', user.id);
    const rows = shares.map((s, idx) => {
      const p = participants[idx];
      return {
        expense_id: id,
        user_id: user.id,
        friend_id: p.isSelf ? null : (p.id.startsWith('name:') ? null : p.id),
        friend_name: p.isSelf ? 'You' : p.name,
        amount: s.amount,
        items: p.items,
        is_self: p.isSelf,
        status: 'pending',
      };
    });
    const { error } = await supabase.from('bill_splits').insert(rows as any);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Split confirmed ✅' });
      navigate(`/expenses/${id}`);
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
    </div>
  );

  const availableFriends = friends.filter(f => !participants.find(p => p.id === f.id));

  return (
    <div className="max-w-2xl mx-auto space-y-3 pb-44 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground truncate">{expense?.merchant || expense?.title || 'Split Bill'}</h1>
          <p className="text-[11px] text-muted-foreground">
            ₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })} total
            {items.length > 0 && ` · ${items.length} items`}
          </p>
        </div>
      </div>

      {/* Mode toggle - top */}
      <div className="glass-card rounded-2xl p-1 grid grid-cols-2 gap-1">
        <button onClick={() => setMode('equal')}
          className={`py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'equal' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
          }`}>
          <Equal className="h-3.5 w-3.5" /> Equal Split
        </button>
        <button onClick={() => setMode('custom')} disabled={items.length === 0}
          className={`py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 ${
            mode === 'custom' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
          }`}>
          <ListChecks className="h-3.5 w-3.5" /> Custom Split
        </button>
      </div>

      {/* PEOPLE - always visible at top */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> People ({participants.length})
          </p>
          <button onClick={() => setShowFriendPicker(v => !v)}
            className="text-[11px] text-primary font-semibold flex items-center gap-1 active:scale-95">
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {participants.map(p => (
            <div key={p.id} className={`group flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-medium ${
              p.isSelf ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
            }`}>
              <span>{p.isSelf ? `${p.name} (you)` : p.name}</span>
              {!p.isSelf && (
                <button onClick={() => removeParticipant(p.id)}
                  className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-background/30 active:scale-90">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {showFriendPicker && (
          <div className="space-y-2 pt-2 border-t border-border/30">
            {availableFriends.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableFriends.map(f => (
                  <button key={f.id} onClick={() => toggleFriend(f)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium glass-button border-0 text-muted-foreground hover:text-foreground active:scale-95">
                    + {f.name}
                  </button>
                ))}
              </div>
            )}
            {!showAddFriend ? (
              <button onClick={() => setShowAddFriend(true)}
                className="w-full px-3 py-2 rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground active:scale-[0.98] flex items-center justify-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Create new friend
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl bg-secondary/20">
                <Input placeholder="Name *" value={newFriend.name}
                  onChange={e => setNewFriend(p => ({ ...p, name: e.target.value }))}
                  className="h-9 bg-secondary/40 border-border/30 text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Phone" value={newFriend.phone}
                    onChange={e => setNewFriend(p => ({ ...p, phone: e.target.value }))}
                    className="h-9 bg-secondary/40 border-border/30 text-xs" />
                  <Input placeholder="Email" type="email" value={newFriend.email}
                    onChange={e => setNewFriend(p => ({ ...p, email: e.target.value }))}
                    className="h-9 bg-secondary/40 border-border/30 text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 text-xs" onClick={handleCreateFriend} disabled={!newFriend.name.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowAddFriend(false); setNewFriend({ name: '', phone: '', email: '' }); }}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CUSTOM: line items */}
      {mode === 'custom' && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, iIdx) => {
            const noOne = !participants.some(p => p.items.includes(iIdx));
            const showError = tryConfirm && noOne;
            return (
              <div key={iIdx} className={`glass-card rounded-xl p-3 transition-all ${showError ? 'ring-1 ring-destructive/60' : ''}`}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <p className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{item.name}</p>
                  <span className="text-sm font-bold text-foreground tabular-nums">₹{Number(item.total_price).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {participants.map(p => {
                    const sel = p.items.includes(iIdx);
                    return (
                      <button key={p.id} onClick={() => toggleItem(p.id, iIdx)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95 ${
                          sel ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60'
                        }`}>
                        {sel && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                        {p.isSelf ? 'You' : p.name.split(' ')[0]}
                      </button>
                    );
                  })}
                  {participants.length > 1 && (
                    <button onClick={() => assignAll(iIdx)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-border/50 text-muted-foreground hover:text-foreground active:scale-95">
                      All
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Advanced: tax/discount mode (only if applicable) */}
      {mode === 'custom' && hasTaxOrDiscount && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <button onClick={() => setShowAdvanced(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-muted-foreground active:bg-secondary/20">
            <span className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Advanced · Tax & discount split
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {showAdvanced && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                How to share the ₹{(totals.tax - totals.discount).toFixed(2)} of tax/discount.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['proportional', 'equal'] as const).map(m => (
                  <button key={m} onClick={() => setTaxMode(m)}
                    className={`py-2 rounded-lg text-[11px] font-medium capitalize ${
                      taxMode === m ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground'
                    }`}>{m}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live shares */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground">Each person pays</p>
          {mode === 'custom' && items.length > 0 && (
            <span className={`text-[10px] font-semibold tabular-nums ${validation.valid ? 'text-success' : 'text-muted-foreground'}`}>
              ₹{assigned.toFixed(2)} / ₹{totals.total.toFixed(2)}
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {shares.map((s, i) => (
            <div key={s.id + i} className="flex items-center justify-between text-sm py-1">
              <div className="flex items-center gap-2">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  s.isSelf ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                }`}>
                  {s.isSelf ? 'YOU' : s.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-foreground">{s.isSelf ? 'You' : s.name}</span>
              </div>
              <span className="font-bold text-gold tabular-nums">
                ₹{s.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer - confirm */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/85 backdrop-blur-xl border-t border-border/30 z-40">
        <div className="max-w-2xl mx-auto">
          <Button className="w-full h-11" onClick={handleConfirm}
            disabled={saving || participants.length < 2}>
            <Check className="h-4 w-4 mr-2" />
            {saving ? 'Saving…' :
              participants.length < 2 ? 'Add at least one friend' :
              'Confirm Split'}
          </Button>
        </div>
      </div>
    </div>
  );
}
