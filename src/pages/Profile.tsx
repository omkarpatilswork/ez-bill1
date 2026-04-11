import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, Building2, ArrowLeft, LogOut, Globe, Coins, Phone, Pencil, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES, CURRENCIES, getCurrencySymbol } from '@/lib/countries';

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || profile?.full_name || user?.user_metadata?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [country, setCountry] = useState(profile?.country || 'IN');
  const [currency, setCurrency] = useState(profile?.default_currency || 'INR');

  const email = user?.email || '';
  const department = profile?.department || '—';

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

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 md:hidden">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Account</h1>
      </div>
      <div className="hidden md:flex md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Account & Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        )}
      </div>

      <div className="glass-card rounded-2xl p-6 flex flex-col items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">{displayName || 'User'}</h2>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
          </Button>
        )}
      </div>

      {editing ? (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Edit Profile</h3>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-2">
            <Label>Phone (optional)</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={country} onValueChange={v => { setCountry(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Individual bills can still use any currency.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Details</h3>
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm text-foreground">{email}</p>
            </div>
          </div>
          {phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm text-foreground">{phone}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Country</p>
              <p className="text-sm text-foreground">{COUNTRIES.find(c => c.code === country)?.name || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Coins className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Default Currency</p>
              <p className="text-sm text-foreground">{getCurrencySymbol(currency)} {currency}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="text-sm text-foreground">{department}</p>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-5">
        <Button variant="destructive" className="w-full" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
