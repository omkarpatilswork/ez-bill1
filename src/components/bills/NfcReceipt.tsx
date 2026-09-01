import { Link } from 'react-router-dom';
import { Nfc, ChevronRight } from 'lucide-react';

export interface ReceiptItem {
  name?: string;
  item?: string;
  description?: string;
  qty?: number | string;
  quantity?: number | string;
  price?: number | string;
  amount?: number | string;
  total?: number | string;
}

export function parseReceiptItems(description?: string | null): ReceiptItem[] {
  if (!description) return [];
  const match = description.match(/::ITEMS::([\s\S]*?)::END_ITEMS::/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function metaFrom(description: string | null | undefined, key: string): string | null {
  if (!description) return null;
  const m = description.match(new RegExp(`${key}:\\s*([^|:]+)`, 'i'));
  return m ? m[1].trim() : null;
}

interface Props {
  id: string;
  merchant: string;
  amount: number;
  currencySymbol: string;
  date: string;
  description?: string | null;
  paymentMethod?: string | null;
  index?: number;
}

/**
 * A premium "real paper bill" render for NFC-tapped bills — white thermal
 * receipt paper, perforated bottom edge, monospace print, unrolls on mount.
 */
export default function NfcReceipt({
  id, merchant, amount, currencySymbol, date, description, paymentMethod, index = 0,
}: Props) {
  const items = parseReceiptItems(description);
  const invoice = metaFrom(description, 'Invoice');
  const tapped = description?.match(/Tapped at ([^|]+)/i)?.[1]?.trim();
  const itemsTotal = items.reduce((s, it) => s + Number(it.total ?? it.amount ?? it.price ?? 0), 0);
  const showSubtotal = itemsTotal > 0 && Math.abs(itemsTotal - amount) > 0.5;

  const money = (n: number) =>
    `${currencySymbol}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      className="receipt-unroll"
      style={{ animationDelay: `${Math.min(index, 8) * 90}ms` }}
    >
      <Link
        to={`/expenses/${id}`}
        className="block relative select-none transition-transform duration-200 active:scale-[0.985] hover:-translate-y-0.5"
      >
        {/* paper */}
        <div
          className="relative px-5 pt-5 pb-6 receipt-paper"
          style={{
            background:
              'linear-gradient(180deg, #ffffff 0%, #fdfdfb 55%, #f6f5f1 100%)',
            color: '#1a1a1a',
            borderRadius: '6px 6px 0 0',
            boxShadow:
              '0 24px 50px -18px rgba(0,0,0,0.7), 0 2px 0 0 rgba(255,255,255,0.35) inset',
          }}
        >
          {/* NFC ribbon */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
              style={{ background: 'rgba(20,20,20,0.06)', color: '#2b2b2b' }}
            >
              <Nfc className="h-3 w-3" />
              Tapped
            </span>
            <span className="text-[10px] tracking-wider" style={{ color: '#8a8a83', fontFamily: 'ui-monospace, monospace' }}>
              {new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="text-center">
            <p className="text-[17px] font-extrabold uppercase tracking-[0.14em]" style={{ color: '#111' }}>
              {merchant || 'Merchant'}
            </p>
            {tapped && (
              <p className="text-[10px] mt-1 uppercase tracking-[0.2em]" style={{ color: '#8a8a83' }}>
                {tapped}
              </p>
            )}
          </div>

          <div className="my-3" style={{ borderTop: '1px dashed rgba(0,0,0,0.18)' }} />

          {items.length > 0 ? (
            <div className="space-y-1.5" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {items.slice(0, 6).map((it, i) => {
                const name = String(it.name ?? it.item ?? it.description ?? 'Item');
                const qty = it.qty ?? it.quantity;
                const line = Number(it.total ?? it.amount ?? it.price ?? 0);
                return (
                  <div key={i} className="flex items-start gap-2 text-[12px]" style={{ color: '#2f2f2f' }}>
                    <span className="flex-1 truncate">
                      {qty ? `${qty} × ` : ''}{name}
                    </span>
                    {line > 0 && <span className="tabular-nums">{money(line)}</span>}
                  </div>
                );
              })}
              {items.length > 6 && (
                <p className="text-[11px] italic" style={{ color: '#8a8a83' }}>
                  +{items.length - 6} more item{items.length - 6 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-center" style={{ color: '#8a8a83', fontFamily: 'ui-monospace, monospace' }}>
              Itemised details not available
            </p>
          )}

          <div className="my-3" style={{ borderTop: '1px dashed rgba(0,0,0,0.18)' }} />

          {showSubtotal && (
            <div className="flex justify-between text-[11px] mb-1" style={{ color: '#6f6f68', fontFamily: 'ui-monospace, monospace' }}>
              <span>Subtotal</span>
              <span className="tabular-nums">{money(itemsTotal)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#4a4a44' }}>Total</span>
            <span className="text-[22px] font-extrabold tabular-nums" style={{ color: '#101010' }}>
              {money(amount)}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px]" style={{ color: '#8a8a83', fontFamily: 'ui-monospace, monospace' }}>
            <span>{paymentMethod || 'PAID'}</span>
            <span>{invoice ? `#${invoice}` : ''}</span>
          </div>

          {/* barcode */}
          <div className="mt-4 flex items-end justify-center gap-[2px] h-8" aria-hidden>
            {Array.from({ length: 44 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i % 7 === 0 ? 3 : 1.5,
                  height: `${60 + ((i * 37) % 40)}%`,
                  background: '#151515',
                  opacity: i % 5 === 0 ? 0.9 : 0.7,
                }}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#6f6f68' }}>
            View bill <ChevronRight className="h-3 w-3" />
          </div>

          {/* paper sheen */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 receipt-sheen"
            style={{ borderRadius: '6px 6px 0 0' }}
          />
        </div>

        {/* torn / perforated bottom edge */}
        <div
          aria-hidden
          className="h-3 w-full"
          style={{
            background: '#f6f5f1',
            WebkitMaskImage:
              'radial-gradient(circle at 6px 12px, transparent 6px, #000 6.5px)',
            maskImage: 'radial-gradient(circle at 6px 12px, transparent 6px, #000 6.5px)',
            WebkitMaskSize: '12px 12px',
            maskSize: '12px 12px',
            WebkitMaskRepeat: 'repeat-x',
            maskRepeat: 'repeat-x',
            filter: 'drop-shadow(0 14px 24px rgba(0,0,0,0.45))',
          }}
        />
      </Link>
    </div>
  );
}
