import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Mail,
  Nfc,
  BrainCircuit,
  Users,
  Ban,
  Scale,
  CreditCard,
  ShieldCheck,
  Trash2,
  RefreshCw,
} from 'lucide-react';

function Section({
  icon: Icon,
  accent,
  title,
  children,
}: {
  icon: React.ElementType;
  accent: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(160deg, hsla(160, 14%, 17%, 0.6), hsla(160, 14%, 9%, 0.32))',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        border: '1px solid hsla(160, 10%, 60%, 0.1)',
        boxShadow: 'inset 0 1px 0 0 hsla(0, 0%, 100%, 0.05), 0 4px 16px -8px hsla(0, 0%, 0%, 0.4)',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="h-9 w-9 rounded-[11px] flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(150deg, hsla(${accent}, 0.2), hsla(${accent}, 0.07))`,
            border: `1px solid hsla(${accent}, 0.22)`,
            boxShadow: `inset 0 1px 0 0 hsla(0, 0%, 100%, 0.1), 0 0 12px -4px hsla(${accent}, 0.35)`,
          }}
        >
          <Icon className="h-4 w-4" style={{ color: `hsl(${accent})` }} />
        </div>
        <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
      </div>
      <div className="space-y-2.5 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1 w-1 rounded-full bg-primary shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => history.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3"
            style={{ background: 'hsla(160, 12%, 10%, 0.5)', border: '1px solid hsla(160, 10%, 40%, 0.15)' }}
          >
            <Scale className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-bold text-foreground uppercase tracking-widest">The agreement between us</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Terms at EZZ BILLZ</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            What you can expect from us, what we expect from you, and how each feature works under the hood.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">Last updated: October 29, 2026</p>
        </div>

        <div className="space-y-4">
          <Section icon={FileText} accent="152, 62%, 52%" title="Using the service">
            <p>
              EZZ BILLZ helps you capture, store and understand your bills — manually, from uploads, via email scans
              or through NFC table tags. You may use it only for your own lawful personal or household record-keeping.
            </p>
            <Bullets
              items={[
                <>You must create an account with accurate details and keep your sign-in credentials safe.</>,
                <>You are responsible for everything that happens under your account, including the bills saved to it.</>,
                <>Scans and AI features run only when you start them, and each run uses your app credits.</>,
              ]}
            />
          </Section>

          <Section icon={BrainCircuit} accent="280, 65%, 66%" title="Automatic bill reading">
            <p>
              Photos, PDFs and email attachments are read by automated systems to fill in merchant, amount, date,
              items, subscription and warranty details.
            </p>
            <Bullets
              items={[
                <>Automatic reading is a helper, not a guarantee — extracted details may occasionally be wrong or incomplete.</>,
                <>You should review and confirm anything the app imports before relying on it. Every imported bill can be edited or deleted.</>,
                <>Cancelled orders detected in email are excluded from imports; existing matching expenses are removed automatically.</>,
              ]}
            />
          </Section>

          <Section icon={Mail} accent="199, 78%, 55%" title="Email (Gmail) connection">
            <p>
              If you connect Gmail, you grant EZZ BILLZ <strong className="text-foreground">read-only</strong> access
              to find bills, subscriptions and warranty emails when you request a scan.
            </p>
            <Bullets
              items={[
                <>Scans never run in the background; each one is started by you, for the date range you choose.</>,
                <>We access only messages that look relevant to bills, invoices, subscriptions or warranties.</>,
                <>We never send, move, label, modify or delete your emails.</>,
                <>You may disconnect at any time from the app or from your Google account settings.</>,
              ]}
            />
          </Section>

          <Section icon={Nfc} accent="43, 88%, 58%" title="NFC table tags">
            <p>
              NFC tags let you place a bill on a physical table so a guest can claim it by tapping with their phone.
            </p>
            <Bullets
              items={[
                <>You choose what is placed on a tag and are responsible for removing it when appropriate.</>,
                <>A tap reveals only the single pending bill on that tag, through a short-lived link; nothing else from your account is shared.</>,
                <>Unclaimed bills are cleared from a tag after a short grace window.</>,
                <>Do not use tags to place bills in a way intended to mislead the person tapping them.</>,
              ]}
            />
          </Section>

          <Section icon={Users} accent="152, 62%, 52%" title="Splits & friends">
            <p>
              Splits let you divide an expense between friends and track who owes what.
            </p>
            <Bullets
              items={[
                <>You are responsible for the names, phone numbers or emails you enter, and for having permission to share bill details with them.</>,
                <>EZZ BILLZ tracks balances only — it does not process payments, transfer money or enforce settlements.</>,
                <>Friend records you add are yours to manage and delete at any time.</>,
              ]}
            />
          </Section>

          <Section icon={CreditCard} accent="43, 88%, 58%" title="Subscriptions & warranties">
            <p>
              Email scans can also detect subscriptions (renewals, trials, price changes) and warranty documents,
              and estimate details such as next billing dates or monthly cost.
            </p>
            <Bullets
              items={[
                <>Detected amounts and dates are estimates — always confirm them against the actual email or service.</>,
                <>Suggestions found in a scan never overwrite your manual edits without your confirmation.</>,
                <>Warranty documents you upload or scan are stored in your account and are not shared with merchants.</>,
              ]}
            />
          </Section>

          <Section icon={Ban} accent="0, 72%, 60%" title="What you must not do">
            <Bullets
              items={[
                <>No fabricating bills, receipts or warranty documents, or importing anything you have no right to store.</>,
                <>No attempting to access other users' data, reverse-engineer protected systems, or interfere with the platform.</>,
                <>No automated abuse — mass-scanning, reselling extracted data or using the service for unlawful purposes.</>,
              ]}
            />
          </Section>

          <Section icon={Scale} accent="199, 78%, 55%" title="No financial advice & liability">
            <p>
              EZZ BILLZ is a record-keeping and insight tool. Amounts, leak checks, budgets and subscription totals
              are informational only and are not financial, tax or legal advice.
            </p>
            <Bullets
              items={[
                <>The service is provided “as is” and “as available”, without warranties of any kind.</>,
                <>To the maximum extent permitted by law, we are not liable for errors in extracted or entered data, decisions made using the app, or disputes between you and anyone you share bills with.</>,
              ]}
            />
          </Section>

          <Section icon={Trash2} accent="0, 72%, 60%" title="Your data & termination">
            <Bullets
              items={[
                <>You can delete any bill, subscription, warranty or friend record inside the app at any time.</>,
                <>You can disconnect Gmail at any time; already-imported bills remain yours to keep or delete.</>,
                <>You may ask us to delete your entire account: <a href="mailto:ezbsolutions.ai@gmail.com" className="text-primary underline">ezbsolutions.ai@gmail.com</a>.</>,
                <>We may suspend or restrict accounts that violate these terms, and will tell you why when we reasonably can.</>,
              ]}
            />
          </Section>

          <Section icon={RefreshCw} accent="152, 62%, 52%" title="Changes & contact">
            <p>
              We may update these terms as features change. The updated version appears on this page with a new date,
              and continued use means you accept it. Questions? Write to us at{' '}
              <a href="mailto:ezbsolutions.ai@gmail.com" className="text-primary underline">
                ezbsolutions.ai@gmail.com
              </a>
              .
            </p>
            <p className="text-xs text-muted-foreground/80">
              See also our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
