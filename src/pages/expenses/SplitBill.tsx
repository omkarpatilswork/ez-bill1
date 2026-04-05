import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, UserPlus, X, Users, Save, IndianRupee
} from 'lucide-react';

interface LineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Friend {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface SplitPerson {
  id: string; // friend id or 'self'
  name: string;
  amount: number;
  items: number[]; // indices of line items assigned
}

const LINE_ITEMS_MARKER = '::ITEMS::';

function parseStoredLineItems(desc: string | null | undefined): LineItem[] {
  if (!desc) return [];
  const idx = desc.indexOf(LINE_ITEMS_MARKER);
  if (idx < 0) return [];
  try {
    const jsonStr = desc.slice(idx + LINE_ITEMS_MARKER.length);
    const endIdx = jsonStr.indexOf('::END_ITEMS::');
    return JSON.parse(endIdx >= 0 ? jsonStr.slice(0, endIdx) : jsonStr);
  } catch { return []; }
}

export default function SplitBill() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [expense, setExpense] = useState<any>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [splits, setSplits] = useState<SplitPerson[]>([]);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriend, setNewFriend] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const totalAmount = expense ? Number(expense.amount) : 0;

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
      setLineItems(parseStoredLineItems(exp?.description));
      setFriends((friendsRes.data as any[]) || []);

      const existingSplits = (splitsRes.data as any[]) || [];
      if (existingSplits.length > 0) {
        setSplits(existingSplits.map((s: any) => ({
          id: s.is_self ? 'self' : (s.friend_id || s.friend_name),
          name: s.friend_name,
          amount: Number(s.amount),
          items: s.items || [],
        })));
        // Detect mode
        const allEqual = existingSplits.every((s: any) => Math.abs(Number(s.amount) - Number(existingSplits[0].amount)) < 0.01);
        setSplitMode(allEqual ? 'equal' : 'custom');
      } else {
        // Default: just self
        setSplits([{
          id: 'self',
          name: profile?.full_name || 'You',
          amount: totalAmount,
          items: [],
        }]);
      }
      setLoading(false);
    })();
  }, [id, user]);

  // Recalc equal splits when people change
  useEffect(() => {
    if (splitMode === 'equal' && splits.length > 0 && totalAmount > 0) {
      const share = Math.round((totalAmount / splits.length) * 100) / 100;
      setSplits(prev => prev.map(s => ({ ...s, amount: share })));
    }
  }, [splits.length, splitMode, totalAmount]);

  const addFriendToSplit = (friend: Friend) => {
    if (splits.find(s => s.id === friend.id)) return;
    const newSplits = [...splits, { id: friend.id, name: friend.name, amount: 0, items: [] }];
    setSplits(newSplits);
  };

  const removeFriendFromSplit = (friendId: string) => {
    if (friendId === 'self') return;
    setSplits(prev => prev.filter(s => s.id !== friendId));
  };

  const handleCreateFriend = async () => {
    if (!newFriend.name.trim() || !user) return;
    const { data, error } = await supabase.from('friends').insert({
      user_id: user.id,
      name: newFriend.name.trim(),
      phone: newFriend.phone.trim() || null,
      email: newFriend.email.trim() || null,
    } as any).select().single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    const f = data as any;
    setFriends(prev => [...prev, { id: f.id, name: f.name, phone: f.phone, email: f.email }]);
    addFriendToSplit({ id: f.id, name: f.name, phone: f.phone, email: f.email });
    setNewFriend({ name: '', phone: '', email: '' });
    setShowAddFriend(false);
  };

  // Toggle a line item assignment to a person (custom split)
  const toggleItemAssignment = (personIdx: number, itemIdx: number) => {
    setSplits(prev => {
      const updated = [...prev];
      const person = { ...updated[personIdx] };
      const items = [...person.items];
      const existingIdx = items.indexOf(itemIdx);
      if (existingIdx >= 0) {
        items.splice(existingIdx, 1);
      } else {
        // Remove from others
        updated.forEach((s, i) => {
          if (i !== personIdx) {
            updated[i] = { ...s, items: s.items.filter(x => x !== itemIdx) };
          }
        });
        items.push(itemIdx);
      }
      person.items = items;
      // Recalc amount from assigned items
      person.amount = items.reduce((sum, idx) => sum + (lineItems[idx]?.total_price || 0), 0);
      updated[personIdx] = person;
      return updated;
    });
  };

  const handleSave = async () => {
    if (!user || !id) return;
    setSaving(true);
    // Delete existing splits
    await supabase.from('bill_splits').delete().eq('expense_id', id).eq('user_id', user.id);
    // Insert new splits
    const rows = splits.map(s => ({
      expense_id: id,
      user_id: user.id,
      friend_id: s.id === 'self' ? null : s.id,
      friend_name: s.name,
      amount: s.amount,
      items: s.items,
      is_self: s.id === 'self',
    }));
    const { error } = await supabase.from('bill_splits').insert(rows as any);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Split saved ✅' });
      navigate(`/expenses/${id}`);
    }
    setSaving(false);
  };

  const availableFriends = friends.filter(f => !splits.find(s => s.id === f.id));
  const yourShare = splits.find(s => s.id === 'self')?.amount || 0;
  const friendsShare = splits.filter(s => s.id !== 'self').reduce((s, p) => s + p.amount, 0);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground truncate flex-1">
          {expense?.merchant || expense?.title || 'Split Bill'}
        </h1>
      </div>

      {/* Tabs: Details / Split / Tags */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
        {['Details', 'Split', 'Tags'].map(tab => (
          <button key={tab}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'Split' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              if (tab === 'Details') navigate(`/expenses/${id}`);
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Split Mode Selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Split with friends</p>
        <Select value={splitMode} onValueChange={v => setSplitMode(v as any)}>
          <SelectTrigger className="w-[140px] h-9 bg-secondary/50 border-border/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equal">Equal Split</SelectItem>
            <SelectItem value="custom">Custom Split</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Split People */}
      <div className="space-y-2">
        {splits.map((person, pIdx) => (
          <Card key={person.id} className={`border-0 bg-card/80 backdrop-blur ${person.id === 'self' ? '' : 'border border-border/20'}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  person.id === 'self' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                }`}>
                  {person.id === 'self' ? 'You' : person.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground flex-1 truncate">{person.name}</span>
                <span className="text-sm font-bold text-gold tabular-nums">
                  ₹{person.amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                {person.id !== 'self' && (
                  <button onClick={() => removeFriendFromSplit(person.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Custom: Line item assignment */}
              {splitMode === 'custom' && lineItems.length > 0 && (
                <div className="mt-3 space-y-1">
                  {lineItems.map((item, iIdx) => {
                    const assigned = person.items.includes(iIdx);
                    return (
                      <button key={iIdx}
                        onClick={() => toggleItemAssignment(pIdx, iIdx)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                          assigned ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                        }`}>
                        <span className="truncate">{item.name}</span>
                        <span className="font-semibold tabular-nums ml-2">₹{item.total_price?.toLocaleString('en-IN')}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom: manual amount input if no line items */}
              {splitMode === 'custom' && lineItems.length === 0 && (
                <div className="mt-2">
                  <Input type="number" step="0.01" value={person.amount || ''}
                    placeholder="Amount"
                    className="h-8 text-sm bg-secondary/30 border-border/30"
                    onChange={e => {
                      const val = Number(e.target.value) || 0;
                      setSplits(prev => prev.map((s, i) => i === pIdx ? { ...s, amount: val } : s));
                    }} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add friends */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Add friends</p>
        <div className="flex flex-wrap gap-2">
          {availableFriends.map(f => (
            <button key={f.id} onClick={() => addFriendToSplit(f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <UserPlus className="h-3 w-3" /> {f.name}
            </button>
          ))}
          <button onClick={() => setShowAddFriend(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <UserPlus className="h-3 w-3" /> New Friend
          </button>
        </div>
      </div>

      {/* Add new friend form */}
      {showAddFriend && (
        <Card className="border-0 bg-card/80 backdrop-blur">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Add New Friend</p>
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
              <Button size="sm" onClick={handleCreateFriend} disabled={!newFriend.name.trim()}>
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddFriend(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Split Summary */}
      {splits.length > 1 && (
        <Card className="border-0 bg-card/80 backdrop-blur">
          <CardContent className="pt-4 pb-4 space-y-2">
            <p className="text-sm font-bold text-foreground">Split Summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="text-foreground font-semibold">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Share</span>
              <span className="text-primary font-semibold">₹{yourShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Friends' Share</span>
              <span className="text-foreground font-semibold">₹{friendsShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2">
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${totalAmount > 0 ? (yourShare / totalAmount) * 100 : 50}%` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-primary font-medium">You</span>
                <span className="text-[10px] text-muted-foreground font-medium">Friends</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <Button className="w-full min-h-[48px] text-sm font-semibold" onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}
