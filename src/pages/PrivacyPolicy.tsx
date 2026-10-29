import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  Mail,
  Nfc,
  BrainCircuit,
  ShieldCheck,
  Lock,
  Trash2,
  Share2,
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

export default function PrivacyPolicy() {
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
            <ShieldCheck className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-bold text-foreground uppercase tracking-widest">Your data, your rules</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Privacy at EZZ BILLZ</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            How your bills, NFC taps, emails and receipts are stored, who can see them, and how you stay in control.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">Last updated: October 29, 2026</p>
        </div>

        <div className="space-y-4">
          <Section icon={Receipt} accent="152, 62%, 52%" title="Bills & receipts you add">
            <p>
              Every bill you capture — a photo, a PDF, a manual entry or an SMS forward — is saved to your own
              account in the EZZ BILLZ database. Receipt images and PDFs are stored as files that only your
              account can open.
            </p>
            <Bullets
              items={[
                <>We store what the bill shows: merchant, amount, date, category and the items on it.</>,
                <>Details are filled in automatically by reading the bill — you can always correct them.</>,
                <>Nothing is published anywhere. Your bills are not visible to other apps or websites.</>,
              ]}
            />
          </Section>

          <Section icon={Mail} accent="199, 78%, 55%" title="Your email (Gmail connection)">
            <p>
              When you connect Gmail, you grant EZZ BILLZ <strong className="text-foreground">read-only</strong> access
              so it can find bills, subscriptions and warranty emails on your behalf.
            </p>
            <Bullets
              items={[
                <>Scans only run when <strong className="text-foreground">you</strong> start them — there is no background reading of your inbox.</>,
                <>We look only for messages that look like bills, invoices, subscriptions or warranty documents — not your personal or unrelated mail.</>,
                <>We keep the <strong className="text-foreground">extracted details</strong> (merchant, amount, date, items) plus a small reference ID so the same email is never imported twice. We do not keep copies of your entire mailbox.</>,
                <>We never send, move, label, modify or delete your emails.</>,
                <>Your sign-in token for Gmail is stored securely and used only to run the scans you request. You can revoke access at any time from your Google account or from the app.</>,
              ]}
            />
          </Section>

          <Section icon={Nfc} accent="43, 88%, 58%" title="NFC taps">
            <p>
              When a bill is sent to an NFC table tag, it waits there until someone taps the tag with their phone.
            </p>
            <Bullets
              items={[
                <>A tap only reveals <strong className="text-foreground">one thing</strong>: a short-lived link (about 5 minutes) to the single bill photo waiting on that tag. No other data on the tag or in your account is exposed.</>,
                <>Once the tapper claims the bill, it is imported into <strong className="text-foreground">their</strong> account and the pending copy is cleared from the tag.</>,
                <>Unclaimed bills are cleared from the tag automatically after a short grace window.</>,
                <>Your staff can see bills waiting on your tags in the staff view, so they can confirm amounts before sending.</>,
                <>If someone taps a tag when nothing is pending, the page simply says the table is idle — nothing is shared.</>,
              ]}
            />
          </Section>

          <Section icon={BrainCircuit} accent="280, 65%, 66%" title="AI reading of your bills">
            <p>
              To turn a photo, PDF or email attachment into structured bill data, the document is processed by
              AI reading services.
            </p>
            <Bullets
              items={[
                <>Only the bill document itself (and the surrounding bill details) is sent for reading — never your whole account, income settings or browsing.</>,
                <>The AI returns the extracted fields (merchant, amounts, dates, line items) which are saved to your account. Ask AI answers come from your own expense data.</>,
                <>Documents are sent only when you capture or scan them — not on a schedule, not in the background.</>,
              ]}
            />
          </Section>

          <Section icon={Share2} accent="199, 78%, 55%" title="Who can see your data">
            <p>
              Access to every bill, receipt and document is controlled by the app's database security rules —
              data is scoped to your account, not publicly readable.
            </p>
            <Bullets
              items={[
                <>Splits share only what you choose: the friend names, phone numbers or emails you enter, and the amounts you assign.</>,
                <>NFC tags share only the pending bill photo with whoever taps that physical tag.</>,
                <>The EZZ BILLZ team does not browse your bills. Team access is limited to operating, securing and supporting the service.</>,
              ]}
            />
          </Section>

          <Section icon={Lock} accent="152, 62%, 52%" title="What we never do">
            <Bullets
              items={[
                <>We never sell your personal or financial data — to anyone, ever.</>,
                <>We never use your data to advertise to you or build profiles for other companies.</>,
                <>We never read emails unrelated to bills, subscriptions or warranties.</>,
                <>We never share your data with merchants, banks or third parties unless you explicitly use a feature that does (like contacting a merchant from the Support Hub).</>,
              ]}
            />
          </Section>

          <Section icon={Trash2} accent="0, 72%, 60%" title="Your control & deletion">
            <Bullets
              items={[
                <>Delete any bill, receipt, subscription, warranty or friend record from inside the app, any time.</>,
                <>Disconnect Gmail at any time — from the app or your Google account settings. Already-imported bills stay yours; you can delete those too.</>,
                <>Remove a pending bill from an NFC tag from the staff view before anyone claims it.</>,
                <>Ask us to delete your entire account and its data: <a href="mailto:ezbsolutions.ai@gmail.com" className="text-primary underline">ezbsolutions.ai@gmail.com</a>.</>,
              ]}
            />
            <p className="text-xs text-muted-foreground/80 pt-1">
              We keep your data only while your account is active, or as long as needed to provide the service or
              meet legal obligations. Deleting items removes them from your account.
            </p>
          </Section>

          <Section icon={ShieldCheck} accent="43, 88%, 58%" title="Changes & contact">
            <p>
              If this policy changes, the updated version will appear on this page with a new date. Questions
              about your privacy? Write to us at{' '}
              <a href="mailto:ezbsolutions.ai@gmail.com" className="text-primary underline">
                ezbsolutions.ai@gmail.com
              </a>
              .
            </p>
            <p className="text-xs text-muted-foreground/80">
              See also our <Link to="/terms" className="text-primary underline">Terms and Conditions</Link>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
