import { createRoot } from 'react-dom/client';
import '@/index.css';
import Slip from '@/components/next/Slip';
import { LogoMark } from '@/components/next/Logo';

/** The share image (1200 x 630) that link previews show: the sign-in screen's words beside the demo bill. */
const ITEMS = [
  { name: 'Cappuccino', quantity: 2, unit_price: 160, total_price: 320 },
  { name: 'Almond Croissant', quantity: 1, unit_price: 92, total_price: 92 },
];

// Inline styles on purpose: Tailwind only generates classes it finds under src/, and this file is not there.
const C = (v: string, a = 1) => `rgb(var(--ez-${v}) / ${a})`;

function OgImage() {
  return (
    <main className="ez-app" style={{ display: 'grid', gridTemplateColumns: '1fr 470px', width: 1200, height: 630, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, color: C('fg') }}>
          <LogoMark className="!h-[34px] !w-[29px]" />
          <span className="ez-wordmark" style={{ fontSize: 19 }}>EZZ BILL</span>
        </span>
        <div>
          <h1 className="ez-display" style={{ fontSize: 78, lineHeight: 1.02, color: C('fg'), margin: 0 }}>Every bill,<br />in one place.</h1>
          <p style={{ marginTop: 24, maxWidth: 540, fontSize: 25, lineHeight: 1.35, color: C('dim') }}>Scan a receipt, upload a PDF or tap the table. See where the money went.</p>
        </div>
        <p className="ez-num" style={{ fontSize: 19, letterSpacing: '.08em', color: C('faint'), margin: 0 }}>ezbill.live</p>
      </div>
      <aside style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: `1px solid ${C('line-soft')}`, background: C('surface-2') }}>
        <div style={{ width: 330 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 14px', borderRadius: 18, border: `1px solid ${C('line')}`, background: C('surface-3') }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 10, background: C('brand') }}>
              <svg viewBox="0 0 22 26" width="18" height="20"><path d="M2 1.5h18v21l-3-2-3 2-3-2-3 2-3-2-3 2z" fill="#04130B" /><path d="M6 7h10M6 11h10M6 15h6" stroke="#3FAF7D" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C('fg') }}>Bill received</span>
              <span style={{ display: 'block', fontSize: 13, color: C('dim') }}>Blue Tokai Coffee · Table 3</span>
            </span>
            <span className="ez-num" style={{ fontSize: 14, color: C('fg') }}>₹412</span>
          </div>
          <Slip merchant="Blue Tokai Coffee" sub="Koregaon Park · Table 3" items={ITEMS} total={412} foot="Paid via UPI" />
        </div>
      </aside>
    </main>
  );
}

document.documentElement.classList.remove('light');
createRoot(document.getElementById('root')!).render(<OgImage />);
