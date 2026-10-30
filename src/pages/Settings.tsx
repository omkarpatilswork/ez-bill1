import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  User, ArrowLeft, Coins, Phone, Pencil, Save, Globe, Wallet,
  Droplets, Plus, Trash2, IndianRupee, CalendarDays, PiggyBank, Bell,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES, CURRENCIES, getCurrencySymbol } from '@/lib/countries';
import { incomeMidpoint } from '@/lib/leak-engine';

const INCOME_OPTIONS = [
  { value: '0-25k', label: 'Under ₹25K' },
  { value: '25-50k', label: '₹25K – ₹50K' },
  { value: '50-100k', label: '₹50K – ₹1L' },
  { value: '100-200k', label: '₹1L – ₹2L' },
  { value: '200k+', label: '₹2L+' },
];
const GOAL_OPTIONS = [
  { value: 'save', label: 'Save aggressively' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'lifestyle', label: 'Lifestyle first' },
];

interface Category {
  id: string;
  name: string;
  description: string | null;
}

export default function Settings() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ---------- Profile details ---------- */
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('IN');
  const [currency, setCurrency] = useState('INR');
  const [savingProfile, setSavingProfile] = useState(false);

  /* ---------- Income & budget rules ---------- */
  const [income, setIncome] = useState('');
  const [goal, setGoal] = useState('');
  const [rent, setRent] = useState('');
  const [emi, setEmi] = useState('');
  const [salaryDay, setSalaryDay] = useState('');
  const [survivalBalance, setSurvivalBalance] = useState('');
  const [leakAlerts, setLeakAlerts] = useState(true);
  const [savingMoney, setSavingMoney] = useState(false);

  /* ---------- Categories ---------- */
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || user?.user_metadata?.full_name || '');
      setPhone(profile.phone || '');
      setCountry(profile.country || 'IN');
      setCurrency(profile.default_currency || 'INR');
      const p = profile as any;
      setIncome(p.income_range || '');
      setGoal(p.financial_goal || '');
      setRent(p.monthly_rent != null ? String(p.monthly_rent) : '');
      setEmi(p.monthly_emi != null ? String(p.monthly_emi) : '');
      setSalaryDay(p.salary_day != null ? String(p.salary_day) : '');
      setSurvivalBalance(p.survival_balance != null ? String(p.survival_balance) : '');
      setLeakAlerts(p.leak_alerts_enabled !== false);
    }
  }, [profile, user]);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase.from('expense_categories').select('*').order('name');
    setCategories((data as unknown as Category[]) || []);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      full_name: displayName.trim(),
      phone: phone.trim() || null,
      country,
      default_currency: currency,
    } as any).eq('id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Profile saved ✅' });
    }
    setSavingProfile(false);
  };

  const handleSaveMoney = async () => {
    if (!user) return;
    if (!income || !goal) {
      toast({ title: 'Pick an income and a goal first', variant: 'destructive' });
      return;
    }
    const day = Number(salaryDay);
    if (salaryDay && (day < 1 || day > 31)) {
      toast({ title: 'Salary day must be between 1 and 31', variant: 'destructive' });
      return;
    }
    setSavingMoney(true);
    const { error } = await supabase.from('profiles').update({
      income_range: income,
      financial_goal: goal,
      monthly_rent: rent ? Number(rent) : null,
      monthly_emi: emi ? Number(emi) : null,
      salary_day: salaryDay ? day : null,
      survival_balance: survivalBalance ? Number(survivalBalance) : null,
      leak_alerts_enabled: leakAlerts,
      money_profile_completed: true,
    } as any).eq('id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Budget rules saved 🎯', description: 'Money Leaks and Monthly Summary now use these numbers.' });
    }
    setSavingMoney(false);
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setAddingCat(true);
    const { data, error } = await supabase.from('expense_categories').insert({
      name,
      description: newCatDesc.trim() || null,
    } as any).select().single();
    if (error) {
      toast({ title: 'Could not add category', description: error.message, variant: 'destructive' });
    } else {
      setCategories(prev => [...(prev as any), data].sort((a: any, b: any) => a.name.localeCompare(b.name)));
      setNewCatName('');
      setNewCatDesc('');
      toast({ title: `"${name}" added ✅` });
    }
    setAddingCat(false);
  };

  const handleDeleteCategory = async (cat: Category) => {
    const { error } = await supabase.from('expense_categories').delete().eq('id', cat.id);
    if (error) {
      toast({ title: 'Could not delete category', description: error.message, variant: 'destructive' });
    } else {
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      toast({ title: `"${cat.name}" removed` });
    }
    setConfirmDeleteId(null);
  };

  const estIncome = incomeMidpoint((income || null) as any);

  return (
    <div className="max-w-lg mx-auto space-y-5 animate-fade-in pb-8">
      {/* Mobile header */}
      <div className="flex items-center gap-3 md:hidden">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-button flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
      </div>
      {/* Desktop header */}
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Income, budget rules, categories & profile</p>
      </div>

      {/* ---------- Profile details ---------- */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <SectionHeader icon={<User className="h-4 w-4" />} title="Profile details" hint="Shown across the app" />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Display name</Label>
          <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="glass-button border-0 h-10" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Phone (optional)</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="glass-button border-0 h-10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="glass-button border-0 h-10"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="glass-button border-0 h-10"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button className="w-full active:scale-[0.98]" onClick={handleSaveProfile} disabled={savingProfile}>
          <Save className="h-4 w-4 mr-1.5" /> {savingProfile ? 'Saving…' : 'Save profile'}
        </Button>
      </section>

      {/* ---------- Income ---------- */}
      <section className="rounded-2xl overflow-hidden border border-accent/20 bg-gradient-to-br from-accent/10 via-card to-card">
        <div className="p-5 space-y-4">
          <SectionHeader
            icon={<IndianRupee className="h-4 w-4 text-accent" />}
            title="Monthly income"
            hint="Powers your monthly net and budget math"
          />
          <Select value={income} onValueChange={setIncome}>
            <SelectTrigger className="glass-button border-0 h-11"><SelectValue placeholder="Select income range…" /></SelectTrigger>
            <SelectContent>
              {INCOME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {income && (
            <div className="flex items-center justify-between rounded-xl bg-card/60 border border-border/50 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Estimated income</p>
                <p className="text-lg font-semibold text-accent">₹{estIncome.toLocaleString('en-IN')}<span className="text-xs text-muted-foreground font-normal"> / month</span></p>
              </div>
              <span className="text-[10px] text-muted-foreground bg-muted/40 border border-border/50 rounded-full px-2 py-1">Est. from profile</span>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Budget rules ---------- */}
      <section className="rounded-2xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <div className="p-5 space-y-4">
          <SectionHeader
            icon={<Droplets className="h-4 w-4 text-primary" />}
            title="Budget rules"
            hint="Drives Money Leaks ideal budgets & pacing"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Financial goal</Label>
            <Select value={goal} onValueChange={setGoal}>
              <SelectTrigger className="glass-button border-0 h-10"><SelectValue placeholder="Select goal…" /></SelectTrigger>
              <SelectContent>
                {GOAL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Monthly rent (₹)</Label>
              <Input type="number" inputMode="numeric" value={rent} onChange={e => setRent(e.target.value)} placeholder="Optional" className="glass-button border-0 h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Coins className="h-3 w-3" /> Monthly EMI (₹)</Label>
              <Input type="number" inputMode="numeric" value={emi} onChange={e => setEmi(e.target.value)} placeholder="Optional" className="glass-button border-0 h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Salary day</Label>
              <Input type="number" inputMode="numeric" min={1} max={31} value={salaryDay} onChange={e => setSalaryDay(e.target.value)} placeholder="1–31" className="glass-button border-0 h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><PiggyBank className="h-3 w-3" /> Survival balance (₹)</Label>
              <Input type="number" inputMode="numeric" value={survivalBalance} onChange={e => setSurvivalBalance(e.target.value)} placeholder="Optional" className="glass-button border-0 h-10" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Rent + EMI are set aside before discretionary budgets. Salary day anchors mid-month pacing; survival balance is kept out of leak checks.</p>
          <div className="flex items-center justify-between rounded-xl bg-card/60 border border-border/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Leak alerts</p>
                <p className="text-xs text-muted-foreground">Notify when spending crosses a budget</p>
              </div>
            </div>
            <Switch checked={leakAlerts} onCheckedChange={setLeakAlerts} />
          </div>
          <Button className="w-full active:scale-[0.98]" onClick={handleSaveMoney} disabled={savingMoney}>
            <Save className="h-4 w-4 mr-1.5" /> {savingMoney ? 'Saving…' : 'Save budget rules'}
          </Button>
        </div>
      </section>

      {/* ---------- Categories ---------- */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <SectionHeader icon={<Pencil className="h-4 w-4" />} title="Bill categories" hint={`${categories.length} available when adding a bill`} />
        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-muted/40 border border-border/60 text-foreground/85 group"
              title={cat.description || cat.name}
            >
              {cat.name}
              {confirmDeleteId === cat.id ? (
                <button
                  onClick={() => handleDeleteCategory(cat)}
                  className="text-destructive hover:text-destructive/80 font-semibold text-[10px] uppercase"
                >
                  Confirm?
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(cat.id)}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                  aria-label={`Delete ${cat.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {categories.length === 0 && <p className="text-xs text-muted-foreground">No categories yet — add one below.</p>}
        </div>
        <div className="space-y-2 rounded-xl bg-card/60 border border-border/50 p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="New category name (e.g. Health)"
              className="glass-button border-0 h-9"
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
            />
            <Button size="sm" className="h-9 active:scale-95" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
          <Input
            value={newCatDesc}
            onChange={e => setNewCatDesc(e.target.value)}
            placeholder="Short description (optional)"
            className="glass-button border-0 h-9 text-xs"
          />
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center ring-1 ring-primary/25 shrink-0">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      </div>
    </div>
  );
}
