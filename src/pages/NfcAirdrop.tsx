import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Nfc, Smartphone, Wifi, Scan, Sparkles, Users } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/countries';
import NfcReceipt from '@/components/bills/NfcReceipt';
import type { Expense } from '@/lib/types';
import SEO from '@/components/SEO';

function isNfcBill(e: Expense): boolean {
  const d = (e.description || '').toLowerCase();
  return d.includes('[nfc]') || d.includes('via nfc tag') || d.includes('tapped at');
}

export default function NfcAirdrop() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false })
      .then(({ data }) => {
        setBills(((data as unknown as Expense[]) || []).filter(isNfcBill));
        setLoading(false);
      });
  }, [user]);

  const total = bills.reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div className="space-y-6 pb-6">
      <SEO
        title="NFC Airdrop · EZZ BILLZ"
        description="Tap your phone on an NFC tag and bills are delivered instantly — no photos, no typing."
        path="/nfc-airdrop"
      />

      {/* ━━━ HERO — what is this ━━━ */}
      <div
        className="rounded-[28px] p-6 relative overflow-hidden text-center"
        style={{
          background:
            'linear-gradient(155deg, hsla(152, 40%, 14%, 0.75) 0%, hsla(160, 12%, 9%, 0.6) 60%, hsla(152, 30%, 12%, 0.6) 100%)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid hsla(0, 0%, 100%, 0.06)',
          boxShadow:
            'inset 0 1px 0 0 hsla(0,0%,100%,0.08), 0 24px 60px -20px hsla(152, 45%, 20%, 0.5)',
        }}
      >
        <div
          aria-hidden
          className="absolute -top-16 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full blur-3xl opacity-60 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsla(152, 70%, 45%, 0.35), transparent 70%)' }}
        />
        <div className="relative z-10">
          <div
            className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, hsla(152, 45%, 45%, 0.25), hsla(43, 80%, 50%, 0.1))',
              border: '1px solid hsla(152, 45%, 45%, 0.3)',
              boxShadow: '0 0 40px -8px hsla(152, 60%, 40%, 0.5)',
            }}
          >
            <Nfc className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">NFC Airdrop for Bills</h1>
          <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[300px] mx-auto mt-2">
            At a restaurant or store, tap your phone on their EZZ BILLZ tag —
            the bill lands in your app instantly. No photos, no typing, no waiting.
          </p>

          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            <span
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: 'hsla(0,0%,100%,0.05)', border: '1px solid hsla(0,0%,100%,0.08)' }}
            >
              {bills.length} bills received
            </span>
            {total > 0 && (
              <span
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                style={{
                  background: 'hsla(152, 55%, 40%, 0.14)',
                  color: 'hsl(var(--success))',
                  border: '1px solid hsla(152, 55%, 50%, 0.2)',
                }}
              >
                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ HOW IT WORKS ━━━ */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-2.5">How it works</p>
        <div className="glass-card rounded-2xl p-4 space-y-3">
          {[
            { icon: Smartphone, title: 'Tap your phone', sub: 'Hold it against the EZZ BILLZ NFC tag on the table or counter', tint: 'hsla(152, 45%, 45%, 0.18)', color: 'text-primary' },
            { icon: Wifi, title: 'Bill arrives instantly', sub: 'A real, itemized receipt airdrops into your app in seconds', tint: 'hsla(43, 80%, 50%, 0.18)', color: 'text-gold' },
            { icon: Users, title: 'Split or act on it', sub: 'Split with friends, track spending, or reach merchant support — like any bill', tint: 'hsla(199, 70%, 45%, 0.18)', color: 'text-info' },
          ].map((step, i) => (
            <div key={step.title} className="flex items-center gap-3">
              <div className="relative h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: step.tint, border: '1px solid hsla(0,0%,100%,0.08)' }}>
                <step.icon className={`h-4 w-4 ${step.color}`} />
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full text-[8px] font-bold flex items-center justify-center"
                  style={{ background: 'hsla(0,0%,100%,0.08)', border: '1px solid hsla(0,0%,100%,0.12)', color: 'hsl(60, 10%, 90%)' }}>
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{step.title}</p>
                <p className="text-[10px] text-muted-foreground leading-snug">{step.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ RECEIVED BILLS — real paper receipts ━━━ */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Bills received via NFC</p>
          <Link to="/expenses" className="text-[11px] text-gold font-medium">View all bills</Link>
        </div>
        {loading ? (
          <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : bills.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <div
              className="mx-auto h-12 w-12 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: 'linear-gradient(135deg, hsla(152, 45%, 45%, 0.2), hsla(43, 80%, 50%, 0.08))',
                border: '1px solid hsla(152, 45%, 45%, 0.25)',
              }}
            >
              <Scan className="h-5 w-5 text-primary" />
            </div>
            <p className="font-medium text-foreground mb-1 text-sm">No NFC bills yet</p>
            <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
              Next time you're at a table with an EZZ BILLZ tag, tap your phone on it — your bill will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bills.map((exp, i) => (
              <NfcReceipt
                key={exp.id}
                index={i}
                id={exp.id}
                merchant={exp.merchant || exp.title}
                amount={Number(exp.amount)}
                currencySymbol={getCurrencySymbol(exp.currency || 'INR')}
                date={exp.expense_date}
                description={exp.description}
                paymentMethod={exp.cost_center}
              />
            ))}
          </div>
        )}
      </div>

      {/* ━━━ RESTAURANT / STORE OWNER ━━━ */}
      <div
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsla(43, 60%, 16%, 0.35), hsla(160, 12%, 10%, 0.5))',
          border: '1px solid hsla(43, 80%, 50%, 0.18)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, hsla(43, 80%, 50%, 0.22), hsla(43, 80%, 40%, 0.08))', border: '1px solid hsla(43, 80%, 50%, 0.25)' }}>
            <Sparkles className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground">Own a restaurant or store?</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Staff can airdrop the table's bill to every guest with one tap.
            </p>
          </div>
          <Link
            to="/staff"
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
            style={{ background: 'hsla(43, 80%, 50%, 0.18)', color: 'hsl(var(--gold))', border: '1px solid hsla(43, 80%, 50%, 0.3)' }}
          >
            Staff mode
          </Link>
        </div>
      </div>
    </div>
  );
}
