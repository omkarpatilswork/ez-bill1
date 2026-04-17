import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ChevronLeft, Sparkles, Loader2 } from 'lucide-react';
import type { MoneyProfile } from '@/lib/leak-engine';

interface Props {
  initial?: Partial<MoneyProfile>;
  onSubmit: (data: MoneyProfile) => Promise<void>;
}

interface Step {
  key: keyof MoneyProfile;
  title: string;
  emoji: string;
  options: { value: string; label: string; sub?: string }[];
}

const STEPS: Step[] = [
  {
    key: 'income_range', title: 'How much do you earn monthly?', emoji: '💸',
    options: [
      { value: '0-25k', label: 'Under ₹25K', sub: 'Just starting out' },
      { value: '25-50k', label: '₹25K – ₹50K' },
      { value: '50-100k', label: '₹50K – ₹1L' },
      { value: '100-200k', label: '₹1L – ₹2L' },
      { value: '200k+', label: '₹2L+', sub: 'Killing it' },
    ],
  },
  {
    key: 'age_group', title: 'Your age?', emoji: '🎂',
    options: [
      { value: '18-24', label: '18 – 24' },
      { value: '25-34', label: '25 – 34' },
      { value: '35-44', label: '35 – 44' },
      { value: '45+', label: '45+' },
    ],
  },
  {
    key: 'city_tier', title: 'Where do you live?', emoji: '🏙️',
    options: [
      { value: 'tier_1', label: 'Tier 1', sub: 'Mumbai, Delhi, Bangalore…' },
      { value: 'tier_2', label: 'Tier 2', sub: 'Pune, Jaipur, Indore…' },
      { value: 'tier_3', label: 'Tier 3', sub: 'Smaller cities & towns' },
    ],
  },
  {
    key: 'living_situation', title: 'Living situation?', emoji: '🏠',
    options: [
      { value: 'family', label: 'With family', sub: 'Low food + rent' },
      { value: 'shared', label: 'Bachelor (shared)', sub: 'Splitting costs' },
      { value: 'alone', label: 'Bachelor (alone)', sub: 'Full freedom' },
    ],
  },
  {
    key: 'job_type', title: 'How do you work?', emoji: '💼',
    options: [
      { value: 'remote', label: 'Remote', sub: 'Mostly home' },
      { value: 'office', label: 'Office', sub: 'Daily commute' },
      { value: 'travel', label: 'Travel-heavy', sub: 'On the road' },
    ],
  },
  {
    key: 'financial_goal', title: 'What\'s the vibe?', emoji: '🎯',
    options: [
      { value: 'save', label: 'Save aggressively', sub: 'Every rupee counts' },
      { value: 'balanced', label: 'Balanced', sub: 'Save + enjoy' },
      { value: 'lifestyle', label: 'Lifestyle first', sub: 'Live a little' },
    ],
  },
];

export default function MoneyProfileQuiz({ initial, onSubmit }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, any>>({ ...initial });
  const [saving, setSaving] = useState(false);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  const pick = async (value: string) => {
    const next = { ...data, [current.key]: value };
    setData(next);
    if (isLast) {
      setSaving(true);
      await onSubmit({
        income_range: next.income_range || null,
        age_group: next.age_group || null,
        city_tier: next.city_tier || null,
        living_situation: next.living_situation || null,
        job_type: next.job_type || null,
        financial_goal: next.financial_goal || null,
        monthly_rent: next.monthly_rent ?? null,
        monthly_emi: next.monthly_emi ?? null,
        money_profile_completed: true,
      });
      setSaving(false);
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="max-w-md mx-auto pb-24 animate-fade-in">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-6">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
            disabled={saving}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-medium tabular-nums">{step + 1}/{STEPS.length}</span>
      </div>

      {/* Intro on first step */}
      {step === 0 && (
        <div className="mb-6 flex items-center gap-2 text-xs text-accent font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          <span>6 quick taps. We'll find where your money is leaking.</span>
        </div>
      )}

      <Card className="glass-card border-border/50 p-6 rounded-3xl">
        <div className="text-5xl mb-3 leading-none">{current.emoji}</div>
        <h2 className="text-2xl font-bold text-foreground mb-6 leading-tight">{current.title}</h2>

        <div className="space-y-2.5">
          {current.options.map(opt => {
            const selected = data[current.key] === opt.value;
            return (
              <button
                key={opt.value}
                disabled={saving}
                onClick={() => pick(opt.value)}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border transition-all duration-200 active:scale-[0.98] ${
                  selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-secondary/50 text-foreground'
                }`}
              >
                <div className="font-semibold text-sm">{opt.label}</div>
                {opt.sub && <div className="text-xs text-muted-foreground mt-0.5">{opt.sub}</div>}
              </button>
            );
          })}
        </div>

        {saving && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Building your money profile…
          </div>
        )}
      </Card>

      {/* Optional extras only on last step before submit (we submit on tap so show before) */}
      {isLast && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          You can refine rent & EMIs later from Settings.
        </p>
      )}
    </div>
  );
}
