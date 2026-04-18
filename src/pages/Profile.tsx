import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, ArrowLeft, LogOut, Globe, Coins, Phone, Pencil, Save, Sun, Moon, Droplets, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES, CURRENCIES, getCurrencySymbol } from '@/lib/countries';
import { useTheme } from '@/hooks/useTheme';

const INCOME_OPTIONS = [
  { value: '0-25k', label: 'Under ₹25K' },
  { value: '25-50k', label: '₹25K – ₹50K' },
  { value: '50-100k', label: '₹50K – ₹1L' },
  { value: '100-200k', label: '₹1L – ₹2L' },
  { value: '200k+', label: '₹2L+' },
];
const AGE_OPTIONS = [
  { value: '18-24', label: '18 – 24' },
  { value: '25-34', label: '25 – 34' },
  { value: '35-44', label: '35 – 44' },
  { value: '45+', label: '45+' },
];
const CITY_OPTIONS = [
  { value: 'tier_1', label: 'Tier 1 (Mumbai, Delhi, Bangalore…)' },
  { value: 'tier_2', label: 'Tier 2 (Pune, Jaipur, Indore…)' },
  { value: 'tier_3', label: 'Tier 3 (Smaller cities)' },
];
const LIVING_OPTIONS = [
  { value: 'family', label: 'With family' },
  { value: 'shared', label: 'Bachelor (shared)' },
  { value: 'alone', label: 'Bachelor (alone)' },
];
const JOB_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'office', label: 'Office' },
  { value: 'travel', label: 'Travel-heavy' },
];
const GOAL_OPTIONS = [
  { value: 'save', label: 'Save aggressively' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'lifestyle', label: 'Lifestyle first' },
];

const labelOf = (opts: { value: string; label: string }[], val: string | null | undefined) =>
  opts.find(o => o.value === val)?.label || '—';

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('IN');
  const [currency, setCurrency] = useState('INR');

  // Money profile state
  const [editingMoney, setEditingMoney] = useState(false);
  const [savingMoney, setSavingMoney] = useState(false);
  const [income, setIncome] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [living, setLiving] = useState<string>('');
  const [job, setJob] = useState<string>('');
  const [goal, setGoal] = useState<string>('');
  const [rent, setRent] = useState<string>('');
  const [emi, setEmi] = useState<string>('');
  const moneyCompleted = (profile as any)?.money_profile_completed;

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || user?.user_metadata?.full_name || '');
      setPhone(profile.phone || '');
      setCountry(profile.country || 'IN');
      setCurrency(profile.default_currency || 'INR');
      const p = profile as any;
      setIncome(p.income_range || '');
      setAge(p.age_group || '');
      setCity(p.city_tier || '');
      setLiving(p.living_situation || '');
      setJob(p.job_type || '');
      setGoal(p.financial_goal || '');
      setRent(p.monthly_rent != null ? String(p.monthly_rent) : '');
      setEmi(p.monthly_emi != null ? String(p.monthly_emi) : '');
    }
  }, [profile, user]);

  const email = user?.email || '';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
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
      toast({ title: 'Profile updated ✅' });
      setEditing(false);
    }
    setSaving(false);
  };

  const handleSaveMoney = async () => {
    if (!user) return;
    if (!income || !age || !city || !living || !job || !goal) {
      toast({ title: 'Please complete all required fields', variant: 'destructive' });
      return;
    }
    setSavingMoney(true);
    const { error } = await supabase.from('profiles').update({
      income_range: income,
      age_group: age,
      city_tier: city,
      living_situation: living,
      job_type: job,
      financial_goal: goal,
      monthly_rent: rent ? Number(rent) : null,
      monthly_emi: emi ? Number(emi) : null,
      money_profile_completed: true,
    } as any).eq('id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Money profile updated 🎯', description: 'Your leak insights will reflect this.' });
      setEditingMoney(false);
    }
    setSavingMoney(false);
  };

  const countryName = COUNTRIES.find(c => c.code === country)?.name || '—';
  const currencyDisplay = `${getCurrencySymbol(currency)} ${currency}`;

  return (
    <div className="max-w-lg mx-auto space-y-5 animate-fade-in pb-8">
      {/* Mobile header */}
      <div className="flex items-center gap-3 md:hidden">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-button flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Account</h1>
      </div>
      {/* Desktop header */}
      <div className="hidden md:flex md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Account & Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="glass-button border-0 active:scale-95">
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        )}
      </div>

      {/* Avatar card */}
      <div className="glass-card rounded-2xl p-6 flex flex-col items-center gap-3">
        <div className="h-18 w-18 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/30">
          <User className="h-9 w-9 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">{displayName || 'User'}</h2>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" className="md:hidden text-xs text-muted-foreground" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit Profile
          </Button>
        )}
      </div>

      {/* Edit / Details */}
      {editing ? (
        <div className="glass-card rounded-2xl p-5 space-y-4 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground">Edit Profile</h3>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Display Name</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="glass-button border-0 h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone (optional)</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="glass-button border-0 h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={country} onValueChange={v => setCountry(v)}>
              <SelectTrigger className="glass-button border-0 h-10"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Default Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="glass-button border-0 h-10"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Individual bills can still use any currency.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 glass-button border-0 active:scale-95" onClick={() => setEditing(false)}>Cancel</Button>
            <Button className="flex-1 active:scale-95" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-5 space-y-0.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Details</h3>
          <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={email} />
          {phone && <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone" value={phone} />}
          <DetailRow icon={<Globe className="h-4 w-4" />} label="Country" value={countryName} />
          <DetailRow icon={<Coins className="h-4 w-4" />} label="Currency" value={currencyDisplay} />
        </div>
      )}

      {/* Money Profile */}
      <div className="rounded-2xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        {/* Header band */}
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center ring-1 ring-primary/30">
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Money Profile</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Powers your personalized leak insights</p>
            </div>
          </div>
          {!editingMoney && moneyCompleted && (
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-primary hover:bg-primary/10 active:scale-95" onClick={() => setEditingMoney(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          )}
        </div>

        <div className="px-5 pb-5">
        {!moneyCompleted && !editingMoney ? (
          <div className="text-center py-4 space-y-3 border-t border-border/40 pt-5">
            <p className="text-sm text-muted-foreground">Set up your money profile to unlock personalized leak insights.</p>
            <Button size="sm" onClick={() => navigate('/money-leaks')} className="active:scale-95">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Set up now
            </Button>
          </div>
        ) : editingMoney ? (
          <div className="space-y-4 animate-fade-in border-t border-border/40 pt-4">
            <MoneyField label="Monthly Income" value={income} onChange={setIncome} options={INCOME_OPTIONS} />
            <MoneyField label="Age Group" value={age} onChange={setAge} options={AGE_OPTIONS} />
            <MoneyField label="City Tier" value={city} onChange={setCity} options={CITY_OPTIONS} />
            <MoneyField label="Living Situation" value={living} onChange={setLiving} options={LIVING_OPTIONS} />
            <MoneyField label="Job Type" value={job} onChange={setJob} options={JOB_OPTIONS} />
            <MoneyField label="Financial Goal" value={goal} onChange={setGoal} options={GOAL_OPTIONS} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Monthly Rent (₹)</Label>
                <Input type="number" inputMode="numeric" value={rent} onChange={e => setRent(e.target.value)} placeholder="Optional" className="glass-button border-0 h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Monthly EMI (₹)</Label>
                <Input type="number" inputMode="numeric" value={emi} onChange={e => setEmi(e.target.value)} placeholder="Optional" className="glass-button border-0 h-10" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 glass-button border-0 active:scale-95" onClick={() => setEditingMoney(false)}>Cancel</Button>
              <Button className="flex-1 active:scale-95" onClick={handleSaveMoney} disabled={savingMoney}>
                <Save className="h-4 w-4 mr-1.5" /> {savingMoney ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Persona summary chip */}
            <div className="flex flex-wrap gap-1.5">
              <PersonaChip emoji="🎯" text={labelOf(GOAL_OPTIONS, goal)} tone="primary" />
              <PersonaChip emoji="🏙️" text={labelOf(CITY_OPTIONS, city).split(' (')[0]} />
              <PersonaChip emoji="💼" text={labelOf(JOB_OPTIONS, job)} />
              <PersonaChip emoji="🏠" text={labelOf(LIVING_OPTIONS, living)} />
            </div>

            {/* Featured stat tiles */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile
                emoji="💸"
                label="Monthly Income"
                value={labelOf(INCOME_OPTIONS, income)}
                accent
              />
              <StatTile
                emoji="🎂"
                label="Age Group"
                value={labelOf(AGE_OPTIONS, age)}
              />
              {rent && (
                <StatTile
                  emoji="🏡"
                  label="Rent"
                  value={`₹${Number(rent).toLocaleString('en-IN')}`}
                />
              )}
              {emi && (
                <StatTile
                  emoji="💳"
                  label="EMI"
                  value={`₹${Number(emi).toLocaleString('en-IN')}`}
                />
              )}
            </div>

            {/* Footer hint */}
            <button
              onClick={() => setEditingMoney(true)}
              className="w-full text-[11px] text-muted-foreground hover:text-primary transition-colors pt-1 flex items-center justify-center gap-1"
            >
              <Pencil className="h-3 w-3" /> Tap edit to update any field
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Appearance */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Appearance</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-accent" />}
            <div>
              <p className="text-sm font-medium text-foreground">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
              <p className="text-xs text-muted-foreground">Switch app appearance</p>
            </div>
          </div>
          <Switch checked={theme === 'light'} onCheckedChange={toggleTheme} />
        </div>
      </div>

      {/* Sign out */}
      <div className="glass-card rounded-2xl p-5">
        <Button variant="destructive" className="w-full active:scale-[0.97]" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="text-muted-foreground shrink-0 w-5 flex justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function MoneyField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="glass-button border-0 h-10"><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function PersonaChip({ emoji, text, tone }: { emoji: string; text: string; tone?: 'primary' }) {
  if (!text || text === '—') return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border ${
      tone === 'primary'
        ? 'bg-primary/15 border-primary/30 text-primary'
        : 'bg-muted/40 border-border/60 text-foreground/80'
    }`}>
      <span>{emoji}</span>
      <span className="truncate max-w-[120px]">{text}</span>
    </span>
  );
}

function StatTile({ emoji, label, value, accent }: { emoji: string; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${
      accent
        ? 'bg-accent/10 border-accent/30'
        : 'bg-card/60 border-border/50'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{emoji}</span>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      </div>
      <p className={`text-sm font-semibold truncate ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
