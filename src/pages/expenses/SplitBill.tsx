import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, UserPlus, Check, AlertCircle, Users, Equal, ListChecks } from 'lucide-react';
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

type Step = 'friends' | 'assign' | 'confirm';

export default function SplitBill() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [expense, setExpense] = useState<any>(null);
  const [items, setItems] = useState<SplitLineItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [step, setStep] = useState<Step>('friends');
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [taxMode, setTaxMode] = useState<'proportional' | 'equal'>('proportional');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriend, setNewFriend] = useState({ name: '', phone: '', email: '' });
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
      setItems(parseStoredLineItems(exp?.description));
      setFriends((friendsRes.data as any[]) || []);
      const existing = (splitsRes.data as any[]) || [];

      // Always include self
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
        setMode(allEqual ? 'equal' : 'custom');
        setStep('confirm');
      } else {
        setParticipants([selfP]);
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

  const shares = useMemo(
    () => computeShares(participants, items, totals, mode, taxMode),
    [participants, items, totals, mode, taxMode]
  );
  const validation = useMemo(
    () => mode === 'custom' && items.length > 0 ? validateCustomSplit(participants, items) : { valid: true, unassigned: [] as number[] },
    [mode, participants, items]
  );
  const assigned = shares.reduce((s, x) => s + x.amount, 0);
  const remaining = Math.round((totals.total - assigned) * 100) / 100;

  const handleConfirm = async () => {
    if (!user || !id) return;
    if (participants.length === 0) {
      toast({ title: 'Add at least one person', variant: 'destructive' }); return;
    }
    if (mode === 'custom' && !validation.valid) {
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

  // Step nav
  const StepDot = ({ active, done, label, n }: { active: boolean; done: boolean; label: string; n: number }) => (
    <div className="flex flex-col items-center flex-1">
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
        done ? 'bg-success text-success-foreground' :
        active ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground'
      }`}>
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </div>
      <span className={`text-[10px] mt-1 ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-32 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground truncate">{expense?.merchant || expense?.title || 'Split Bill'}</h1>
          <p className="text-[11px] text-muted-foreground">
            ₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })} total
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 px-2">
        <StepDot n={1} label="People" active={step === 'friends'} done={step !== 'friends'} />
        <div className="h-px flex-1 bg-border/40" />
        <StepDot n={2} label="Assign" active={step === 'assign'} done={step === 'confirm'} />
        <div className="h-px flex-1 bg-border/40" />
        <StepDot n={3} label="Confirm" active={step === 'confirm'} done={false} />
      </div>

      {/* STEP 1: FRIENDS */}
      {step === 'friends' && (
        <div className="space-y-3">
          <div className="glass-card rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Selected ({participants.length})</p>
            <div className="flex flex-wrap gap-2">
              {participants.map(p => (
                <div key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  p.isSelf ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                }`}>
                  {p.isSelf ? `${p.name} (you)` : p.name}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Tap to add friends</p>
            <div className="flex flex-wrap gap-2">
              {friends.map(f => {
                const sel = !!participants.find(p => p.id === f.id);
                return (
                  <button key={f.id} onClick={() => toggleFriend(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                      sel ? 'bg-primary text-primary-foreground' : 'glass-button border-0 text-muted-foreground hover:text-foreground'
                    }`}>
                    {sel && <Check className="h-3 w-3 inline mr-1" />}{f.name}
                  </button>
                );
              })}
              <button onClick={() => setShowAddFriend(true)}
                className="px-3 py-1.5 rounded-full border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground active:scale-95">
                <UserPlus className="h-3 w-3 inline mr-1" /> New
              </button>
            </div>
          </div>

          {showAddFriend && (
            <div className="glass-card rounded-2xl p-4 space-y-2">
              <Input placeholder="Name *" value={newFriend.name}
                onChange={e => setNewFriend(p => ({ ...p, name: e.target.value }))}
                className="h-10 bg-secondary/30 border-border/30" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Phone" value={newFriend.phone}
                  onChange={e => setNewFriend(p => ({ ...p, phone: e.target.value }))}
                  className="h-10 bg-secondary/30 border-border/30" />
                <Input placeholder="Email" type="email" value={newFriend.email}
                  onChange={e => setNewFriend(p => ({ ...p, email: e.target.value }))}
                  className="h-10 bg-secondary/30 border-border/30" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateFriend} disabled={!newFriend.name.trim()}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddFriend(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: ASSIGN */}
      {step === 'assign' && (
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('equal')}
              className={`p-3 rounded-2xl text-left transition-all active:scale-[0.98] ${
                mode === 'equal' ? 'bg-primary/15 border border-primary/40' : 'glass-card border-0'
              }`}>
              <Equal className={`h-4 w-4 mb-1 ${mode === 'equal' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold text-foreground">Equal Split</p>
              <p className="text-[10px] text-muted-foreground">Divide total equally</p>
            </button>
            <button onClick={() => setMode('custom')} disabled={items.length === 0}
              className={`p-3 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                mode === 'custom' ? 'bg-primary/15 border border-primary/40' : 'glass-card border-0'
              }`}>
              <ListChecks className={`h-4 w-4 mb-1 ${mode === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold text-foreground">Custom Split</p>
              <p className="text-[10px] text-muted-foreground">{items.length === 0 ? 'No line items' : 'Pick items per person'}</p>
            </button>
          </div>

          {mode === 'custom' && items.length > 0 && (
            <>
              {/* Header validation */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Assigned</span>
                  <span className={`font-bold tabular-nums ${Math.abs(remaining) < 0.5 ? 'text-success' : 'text-gold'}`}>
                    ₹{assigned.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / ₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {(totals.tax > 0 || totals.discount > 0) && (
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Tax & discount split</span>
                    <div className="flex gap-1">
                      {(['proportional', 'equal'] as const).map(m => (
                        <button key={m} onClick={() => setTaxMode(m)}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium ${
                            taxMode === m ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground'
                          }`}>{m}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Line items with chip per participant */}
              <div className="space-y-2">
                {items.map((item, iIdx) => {
                  const noOne = !participants.some(p => p.items.includes(iIdx));
                  return (
                    <div key={iIdx} className={`glass-card rounded-xl p-3 ${noOne ? 'ring-1 ring-destructive/40' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-foreground flex-1 min-w-0 truncate pr-2">{item.name}</p>
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
                      </div>
                      {noOne && (
                        <p className="text-[10px] text-destructive mt-1.5 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Assign at least one person
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Live shares */}
          <div className="glass-card rounded-2xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-foreground mb-1">Live shares</p>
            {shares.map((s, i) => (
              <div key={s.id + i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{s.isSelf ? 'You' : s.name}</span>
                <span className="font-bold text-gold tabular-nums">
                  ₹{s.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: CONFIRM */}
      {step === 'confirm' && (
        <div className="space-y-3">
          <div className="glass-card rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Final breakdown</p>
            {shares.map((s, i) => (
              <div key={s.id + i} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    s.isSelf ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                  }`}>
                    {s.isSelf ? 'YOU' : s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground">{s.isSelf ? 'You' : s.name}</span>
                </div>
                <span className="text-base font-bold text-gold tabular-nums">
                  ₹{s.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/30">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-base font-bold text-foreground tabular-nums">
                ₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/85 backdrop-blur-xl border-t border-border/30 z-40">
        <div className="max-w-2xl mx-auto flex gap-2">
          {step !== 'friends' && (
            <Button variant="outline" className="flex-1 glass-button border-0"
              onClick={() => setStep(step === 'confirm' ? 'assign' : 'friends')}>
              Back
            </Button>
          )}
          {step === 'friends' && (
            <Button className="flex-1" disabled={participants.length < 2}
              onClick={() => setStep('assign')}>
              Continue
            </Button>
          )}
          {step === 'assign' && (
            <Button className="flex-1"
              disabled={mode === 'custom' && !validation.valid}
              onClick={() => setStep('confirm')}>
              {mode === 'custom' && !validation.valid ? validation.error : 'Review'}
            </Button>
          )}
          {step === 'confirm' && (
            <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
              <Check className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Confirm Split'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
