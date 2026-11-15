import { Link } from 'react-router-dom';
import LegalPage, { Bullets, Fine, LEGAL_LINK, LegalSection } from '@/components/next/LegalPage';
import SEO from '@/components/SEO';

/** Terms and Conditions, open to everyone. The wording is the legal text as published; change it only with Omi's say. */
export default function TermsAndConditions() {
  return (
    <LegalPage label="The agreement between us" title="Terms at EZZ BILL" updated="15 November 2026"
      lead="What you can expect from us, what we expect from you, and how each feature works under the hood.">
      <SEO title="Terms at EZZ BILL" description="What you can expect from us, what we expect from you, and how each feature works under the hood." path="/terms" />
      <LegalSection title="Using the service">
        <p>
          EZZ BILL helps you capture, store and understand your bills — manually, from uploads, via email scans
          or through NFC table tags. You may use it only for your own lawful personal or household record-keeping.
        </p>
        <Bullets
          items={[
            <>You must create an account with accurate details and keep your sign-in credentials safe.</>,
            <>You are responsible for everything that happens under your account, including the bills saved to it.</>,
            <>Scans and AI features run only when you start them.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Automatic bill reading">
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
      </LegalSection>

      <LegalSection title="Email (Gmail) connection">
        <p>
          If you connect Gmail, you grant EZZ BILL <strong>read-only</strong> access
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
      </LegalSection>

      <LegalSection title="NFC table tags">
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
      </LegalSection>

      <LegalSection title="Splits & friends">
        <p>
          Splits let you divide an expense between friends and track who owes what.
        </p>
        <Bullets
          items={[
            <>You are responsible for the names, phone numbers or emails you enter, and for having permission to share bill details with them.</>,
            <>EZZ BILL tracks balances only — it does not process payments, transfer money or enforce settlements.</>,
            <>Friend records you add are yours to manage and delete at any time.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Subscriptions & warranties">
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
      </LegalSection>

      <LegalSection title="What you must not do">
        <Bullets
          items={[
            <>No fabricating bills, receipts or warranty documents, or importing anything you have no right to store.</>,
            <>No attempting to access other users' data, reverse-engineer protected systems, or interfere with the platform.</>,
            <>No automated abuse — mass-scanning, reselling extracted data or using the service for unlawful purposes.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="No financial advice & liability">
        <p>
          EZZ BILL is a record-keeping and insight tool. Amounts, leak checks, budgets and subscription totals
          are informational only and are not financial, tax or legal advice.
        </p>
        <Bullets
          items={[
            <>The service is provided “as is” and “as available”, without warranties of any kind.</>,
            <>To the maximum extent permitted by law, we are not liable for errors in extracted or entered data, decisions made using the app, or disputes between you and anyone you share bills with.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Your data & termination">
        <Bullets
          items={[
            <>You can delete any bill, subscription, warranty or friend record inside the app at any time.</>,
            <>You can disconnect Gmail at any time; already-imported bills remain yours to keep or delete.</>,
            <>You may ask us to delete your entire account: <a href="mailto:ezbsolutions.ai@gmail.com" className={LEGAL_LINK}>ezbsolutions.ai@gmail.com</a>.</>,
            <>We may suspend or restrict accounts that violate these terms, and will tell you why when we reasonably can.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Changes & contact">
        <p>
          We may update these terms as features change. The updated version appears on this page with a new date,
          and continued use means you accept it. Questions? Write to us at{' '}
          <a href="mailto:ezbsolutions.ai@gmail.com" className={LEGAL_LINK}>
            ezbsolutions.ai@gmail.com
          </a>
          .
        </p>
        <Fine>
          See also our <Link to="/privacy" className={LEGAL_LINK}>Privacy Policy</Link>.
        </Fine>
      </LegalSection>
    </LegalPage>
  );
}
