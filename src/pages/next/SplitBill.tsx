import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, X } from 'lucide-react';
import SEO from '@/components/SEO';
import { EmptyState, INPUT, Sheet } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatAmount, parseBillDescription } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';
import { computeShares, validateCustomSplit, type SplitParticipant } from '@/lib/split-engine';
import { cn } from '@/lib/utils';

interface Friend { id: string; name: string }
const SEGMENT = 'h-10 flex-1 rounded-full text-[14px] font-medium';

/**
 * Split a bill: who shared it, and either equal shares or line by line.
 * The shares always add up to the bill's total; that sum is shown, not assumed.
 */
export default function SplitBill() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [people, setPeople] = useState<SplitParticipant[]>([]);
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [taxMode, setTaxMode] = useState<'proportional' | 'equal'>('proportional');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ['split-setup', id, user?.id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const [bill, friends, existing] = await Promise.all([
        supabase.from('expenses').select('*').eq('id', id!).maybeSingle(),
        supabase.from('friends').select('id, name').eq('user_id', user!.id).order('name'),
        supabase.from('bill_splits').select('*').eq('expense_id', id!).eq('user_id', user!.id),
      ]);
      if (bill.error) throw bill.error;
      return { bill: bill.data, friends: (friends.data || []) as Friend[], existing: (existing.data || []) as { friend_id: string | null; friend_name: string; is_self: boolean | null; items: unknown }[] };
    },
  });
  const bill = query.data?.bill;
  const parsed = useMemo(() => parseBillDescription(bill?.description), [bill?.description]);
  const items = parsed.items;
  const total = Number(bill?.amount) || 0;
  const totals = useMemo(() => ({ total, tax: parsed.tax || 0, discount: parsed.discount || 0, subtotal: parsed.subtotal || total - (parsed.tax || 0) + (parsed.discount || 0) }), [total, parsed]);
  const symbol = getCurrencySymbol(bill?.currency || 'INR');
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    if (!query.data) return;
    setFriends(query.data.friends);
    const me: SplitParticipant = { id: 'self', name: 'You', isSelf: true, items: [] };
    const saved = query.data.existing.map((s): SplitParticipant => ({
      id: s.is_self ? 'self' : s.friend_id || `name:${s.friend_name}`, name: s.is_self ? me.name : s.friend_name, isSelf: !!s.is_self, items: Array.isArray(s.items) ? (s.items as number[]) : [],
    }));
    setPeople(saved.length ? saved : [me]);
    setMode(saved.some((p) => p.items.length) ? 'custom' : 'equal');
  }, [query.data]);

  const shares = useMemo(() => computeShares(people, items, totals, mode, taxMode), [people, items, totals, mode, taxMode]);
  const check = mode === 'custom' && items.length ? validateCustomSplit(people, items) : { valid: true, unassigned: [] as number[] };
  const sum = Math.round(shares.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  const addsUp = Math.abs(sum - total) < 0.05;

  const addPerson = (f: Friend) => { setPeople((p) => (p.some((x) => x.id === f.id) ? p : [...p, { id: f.id, name: f.name, isSelf: false, items: mode === 'custom' ? items.map((_, i) => i) : [] }])); setAdding(false); };
  const createPerson = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !user) return;
    const { data, error } = await supabase.from('friends').insert({ user_id: user.id, name } as never).select('id, name').single();
    if (error || !data) { toast({ title: 'That person was not added', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    const friend = data as unknown as Friend;
    setFriends((f) => [...f, friend]);
    setNewName('');
    addPerson(friend);
  };
  // Line by line starts from everyone on every line (the equal split), so there is only un-ticking to do.
  const pickMode = (m: 'equal' | 'custom') => {
    if (m === 'custom' && !people.some((p) => p.items.length)) setPeople((p) => p.map((x) => ({ ...x, items: items.map((_, i) => i) })));
    setMode(m);
  };
  const toggle = (personId: string, line: number) => setPeople((p) => p.map((x) => (x.id !== personId ? x : { ...x, items: x.items.includes(line) ? x.items.filter((i) => i !== line) : [...x.items, line] })));
  const everyone = (line: number) => setPeople((p) => p.map((x) => (x.items.includes(line) ? x : { ...x, items: [...x.items, line] })));

  const save = async () => {
    if (!user || !id || saving) return;
    setSaving(true);
    await supabase.from('bill_splits').delete().eq('expense_id', id).eq('user_id', user.id);
    const { error } = await supabase.from('bill_splits').insert(shares.map((s, i) => ({
      expense_id: id, user_id: user.id, friend_id: people[i].isSelf || people[i].id.startsWith('name:') ? null : people[i].id,
      friend_name: people[i].isSelf ? 'You' : people[i].name, amount: s.amount, items: mode === 'custom' ? people[i].items : [], is_self: people[i].isSelf, status: 'pending',
    })) as never);
    setSaving(false);
    if (error) { toast({ title: 'The split was not saved', description: 'Try again in a moment.', variant: 'destructive' }); return; }
    queryClient.invalidateQueries({ queryKey: ['split-ledger', user.id] });
    queryClient.invalidateQueries({ queryKey: ['bill', id] });
    toast({ title: 'Split saved', description: `${people.length} people · ${formatAmount(total, { symbol })}` });
    navigate(`/expenses/${id}`);
  };

  const problem = people.length < 2 ? 'Add at least one other person.' : !check.valid ? `${check.unassigned.length} ${check.unassigned.length === 1 ? 'line has' : 'lines have'} nobody on ${check.unassigned.length === 1 ? 'it' : 'them'}.` : !addsUp ? 'The shares do not add up to the total.' : null;
  const available = friends.filter((f) => !people.some((p) => p.id === f.id));

  return (
    <>
      <SEO title="Split the bill" description="Share a bill equally or line by line." path="/splits" />
      <div className="max-w-[760px] pb-8">
        <Link to={`/expenses/${id}`} className="mt-5 inline-flex items-center gap-1 text-[14px] font-medium text-dim hover:text-fg lg:mt-8"><ChevronLeft className="h-4 w-4" /> Back to the bill</Link>

        {query.isError || (query.isSuccess && !bill) ? (
          <EmptyState title="That bill was not found." body="It may have been deleted."><Link to="/expenses" className="ez-btn ez-btn--ghost">All bills</Link></EmptyState>
        ) : !query.isSuccess ? (
          <div className="mt-6 h-72 rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" />
        ) : (
          <>
            <header className="mt-4">
              <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Split the bill</h1>
              <p className="mt-2 text-[15px] text-dim">{bill!.merchant || bill!.title} · <span className="ez-num text-fg">{formatAmount(total, { symbol, paise: true })}</span></p>
            </header>

            <section className="mt-8">
              <h2 className="ez-label !text-dim">Who shared it</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {people.map((p) => (
                  <span key={p.id} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface-2 pl-4 pr-1.5 text-[14.5px] text-fg">
                    {p.name}
                    {p.isSelf ? <span className="w-2.5" /> : (
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople((all) => all.filter((x) => x.id !== p.id))} className="grid h-7 w-7 place-items-center rounded-full text-faint hover:bg-surface-3 hover:text-fg"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </span>
                ))}
                <button type="button" onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line px-4 text-[14.5px] font-medium text-dim hover:border-brand hover:text-fg"><Plus className="h-4 w-4" /> Add a person</button>
              </div>
            </section>

            {items.length > 0 && (
              <div className="mt-7 flex max-w-[360px] gap-1 rounded-full border border-line-soft bg-surface-2 p-1" role="tablist" aria-label="How to split">
                {(['equal', 'custom'] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => pickMode(m)} className={cn(SEGMENT, mode === m ? 'bg-surface-3 text-fg' : 'text-dim hover:text-fg')}>{m === 'equal' ? 'Equally' : 'Line by line'}</button>
                ))}
              </div>
            )}

            {mode === 'custom' && items.length > 0 && (
              <section className="mt-6">
                <h2 className="ez-label !text-dim">Who had what</h2>
                <ul className="ez-card mt-3 divide-y divide-line-soft">
                  {items.map((item, line) => (
                    <li key={line} className="px-4 py-3.5 lg:px-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[15.5px] font-semibold text-fg">{item.quantity > 1 && <span className="ez-num pr-1.5 font-normal text-dim">{item.quantity}</span>}{item.name}</span>
                        <span className="ez-num shrink-0 text-[14.5px] text-fg">{formatAmount(item.total_price, { symbol, paise: true })}</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {people.map((p) => (
                          <button key={p.id} type="button" aria-pressed={p.items.includes(line)} onClick={() => toggle(p.id, line)}
                            className={cn('h-8 rounded-full border px-3 text-[13px] font-medium', p.items.includes(line) ? 'border-brand bg-brand/10 text-fg' : 'border-line-soft text-dim hover:text-fg')}>{p.name}</button>
                        ))}
                        {people.length > 1 && <button type="button" onClick={() => everyone(line)} className="h-8 rounded-full px-3 text-[13px] font-medium text-dim underline decoration-line underline-offset-4 hover:text-fg">Everyone</button>}
                      </div>
                    </li>
                  ))}
                </ul>
                {(totals.tax > 0 || totals.discount > 0) && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] text-dim">
                    Tax and discount are shared
                    <div className="flex gap-1 rounded-full border border-line-soft bg-surface-2 p-1">
                      {(['proportional', 'equal'] as const).map((m) => (
                        <button key={m} type="button" aria-pressed={taxMode === m} onClick={() => setTaxMode(m)} className={cn('h-8 rounded-full px-3.5 text-[13px] font-medium', taxMode === m ? 'bg-surface-3 text-fg' : 'text-dim hover:text-fg')}>{m === 'proportional' ? 'by what each had' : 'equally'}</button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="mt-8">
              <h2 className="ez-label !text-dim">Each pays</h2>
              <ul className="ez-card mt-3 divide-y divide-line-soft">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
                    <span className="text-[15.5px] text-fg">{s.name}</span>
                    <span className="ez-num text-[15.5px] text-fg">{formatAmount(s.amount, { symbol, paise: true })}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-4 px-4 py-3 text-[13.5px] text-dim lg:px-5">
                  <span>{addsUp ? 'Adds up to the total' : 'Shared so far'}</span>
                  <span className={cn('ez-num', !addsUp && 'text-gilt')}>{formatAmount(sum, { symbol, paise: true })}{!addsUp && ` of ${formatAmount(total, { symbol, paise: true })}`}</span>
                </li>
              </ul>
            </section>

            {problem && <p className="mt-5 text-right text-[13.5px] text-dim">{problem}</p>}
            <div className="mt-4 flex justify-end gap-2.5">
              <Link to={`/expenses/${id}`} className="ez-btn ez-btn--ghost">Cancel</Link>
              <button type="button" disabled={!!problem || saving} onClick={save} className="ez-btn ez-btn--primary disabled:opacity-40">{saving ? 'Saving' : 'Save split'}</button>
            </div>
          </>
        )}
      </div>

      <Sheet open={adding} onOpenChange={setAdding} label="Split the bill" title="Add a person">
        {available.length > 0 && (
          <ul className="mb-4 divide-y divide-line-soft overflow-hidden rounded-[18px] border border-line-soft bg-surface">
            {available.map((f) => <li key={f.id}><button type="button" onClick={() => addPerson(f)} className="w-full px-4 py-3 text-left text-[15.5px] font-medium text-fg hover:bg-surface-3">{f.name}</button></li>)}
          </ul>
        )}
        <form onSubmit={createPerson} className="flex gap-2">
          <input aria-label="Name of someone new" className={INPUT} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={available.length ? 'Someone new' : 'Their name'} autoComplete="off" />
          <button type="submit" disabled={!newName.trim()} className="ez-btn ez-btn--primary shrink-0 disabled:opacity-40">Add</button>
        </form>
      </Sheet>
    </>
  );
}
