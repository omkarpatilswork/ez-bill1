import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, ArrowLeft, LogOut, Globe, Coins, Phone, Pencil, Save, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES, CURRENCIES, getCurrencySymbol } from '@/lib/countries';
import { useTheme } from '@/hooks/useTheme';

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

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || user?.user_metadata?.full_name || '');
      setPhone(profile.phone || '');
      setCountry(profile.country || 'IN');
      setCurrency(profile.default_currency || 'INR');
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
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
