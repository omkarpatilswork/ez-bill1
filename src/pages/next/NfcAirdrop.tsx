import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import SEO from '@/components/SEO';
import BillListRow from '@/components/next/BillListRow';
import { ScreenHeader } from '@/components/next/Sheet';
import { useAuth } from '@/hooks/useAuth';
import { useBills } from '@/hooks/useBills';
import { formatAmount, parseBillDescription } from '@/lib/bill-format';
import { getCurrencySymbol } from '@/lib/countries';

const STEPS = [
  ['Tap', 'Hold your phone to the tag on the table. No app to open, no tag to pair.'],
  ['See', 'Your bill opens on the screen, line by line, with its total.'],
  ['Keep', 'Sign in once and it is saved here, with the lines, for good.'],
];

/** NFC Airdrop: what it is, and the bills that arrived that way. */
export default function NfcAirdrop() {
  const { profile } = useAuth();
  const { bills, ready } = useBills();
  const tapped = useMemo(() => bills.filter((b) => parseBillDescription(b.description).source === 'nfc'), [bills]);
  const currency = profile?.default_currency || 'INR';
  const total = tapped.filter((b) => (b.currency || 'INR') === currency).reduce((s, b) => s + Number(b.amount), 0);

  return (
    <>
      <SEO title="NFC Airdrop" description="Tap your phone on a table's tag and the bill arrives, with nothing to photograph or type." path="/nfc-airdrop" />
      <div className="max-w-[760px] pb-8">
        <ScreenHeader title="NFC Airdrop" summary="Tap your phone on the tag at the table. The bill arrives on its own: nothing to photograph, nothing to type." />

        <ol className="ez-card mt-8 divide-y divide-line-soft">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4 px-4 py-4 lg:px-5">
              <span className="ez-num w-5 shrink-0 pt-0.5 text-[13px] text-brand-text">{i + 1}</span>
              <span><span className="block text-[16px] font-semibold text-fg">{title}</span><span className="block text-[14.5px] text-dim">{body}</span></span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13.5px] text-faint">No NFC on your phone? The same tag carries a QR code that does the same thing.</p>

        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="ez-label !text-dim">Bills that arrived by tap</h2>
            {tapped.length > 0 && <span className="ez-num text-[13px] text-dim">{tapped.length} · {formatAmount(total, { symbol: getCurrencySymbol(currency) })}</span>}
          </div>
          {!ready ? <div className="mt-3 h-[74px] rounded-[18px] bg-surface-2" aria-busy="true" aria-label="Loading" /> : tapped.length === 0 ? (
            <p className="ez-card mt-3 px-4 py-6 text-center text-[14.5px] text-dim lg:px-5">None yet. They appear here after your first tap at a place that uses EZZ BILL.</p>
          ) : (
            <ul className="ez-card mt-3 divide-y divide-line-soft overflow-hidden">{tapped.map((b) => <li key={b.id}><BillListRow bill={b} showDate /></li>)}</ul>
          )}
        </section>

        <p className="mt-10 text-[14.5px] text-dim">Run a café or a shop? <Link to="/staff" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-brand">Send bills to your tables</Link></p>
      </div>
    </>
  );
}
