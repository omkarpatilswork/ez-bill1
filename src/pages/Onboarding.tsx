import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES, getCurrencyForCountry, getCurrencySymbol, CURRENCIES } from '@/lib/countries';
import { ArrowRight, ArrowLeft, User, Globe, Shield, Check, Sparkles } from 'lucide-react';

const STEPS = ['name', 'country', 'terms'] as const;
type Step = typeof STEPS[number];

export default function Onboarding() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const prefillName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '';

  const [step, setStep] = useState<Step>('name');
  const [displayName, setDisplayName] = useState(prefillName);
  const [country, setCountry] = useState('IN');
  const [currency, setCurrency] = useState('INR');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const handleCountryChange = (code: string) => {
    setCountry(code);
    setCurrency(getCurrencyForCountry(code));
  };

  const handleNext = () => {
    if (step === 'name' && !displayName.trim()) {
      toast({ title: 'Please enter your name', variant: 'destructive' });
      return;
    }
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const handleBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleFinish = async () => {
    if (!termsAccepted) {
      toast({ title: 'Please accept the Terms & Privacy Policy', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      full_name: displayName.trim(),
      country,
      default_currency: currency,
      onboarding_completed: true,
      terms_accepted_at: new Date().toISOString(),
    } as any).eq('id', user.id);

    if (error) {
      toast({ title: 'Error saving profile', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    toast({ title: '🎉 Welcome to EZ Bill!', description: 'Your account is all set.' });
    // Force a page reload to re-fetch profile
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full transition-colors ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
              {i < STEPS.length - 1 && <div className={`h-0.5 w-8 transition-colors ${i < stepIndex ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step: Name */}
        {step === 'name' && (
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <User className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Welcome to EZ Bill</h1>
              <p className="text-sm text-muted-foreground">Let's set up your account in seconds</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">What should we call you?</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="text-base h-12"
                autoFocus
              />
            </div>

            <Button className="w-full h-12" onClick={handleNext} disabled={!displayName.trim()}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step: Country & Currency */}
        {step === 'country' && (
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Your Location</h1>
              <p className="text-sm text-muted-foreground">We'll set your default currency automatically</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={country} onValueChange={handleCountryChange}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">You can change this later. Individual bills can use any currency.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="h-12" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button className="flex-1 h-12" onClick={handleNext}>
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Terms */}
        {step === 'terms' && (
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Almost Done!</h1>
              <p className="text-sm text-muted-foreground">Just one last thing</p>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-secondary/50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="text-foreground font-medium">{displayName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Country</span>
                <span className="text-foreground font-medium">{COUNTRIES.find(c => c.code === country)?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Currency</span>
                <span className="text-foreground font-medium">{getCurrencySymbol(currency)} {currency}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(v) => setTermsAccepted(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                I accept the <Link to="/terms" target="_blank" className="text-primary underline">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>
              </label>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="h-12" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button className="flex-1 h-12" onClick={handleFinish} disabled={!termsAccepted || saving}>
                {saving ? (
                  <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 animate-spin" /> Setting up...</span>
                ) : (
                  <span className="flex items-center gap-2"><Check className="h-4 w-4" /> Get Started</span>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
