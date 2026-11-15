import { Link } from 'react-router-dom';
import LegalPage, { Bullets, Fine, LEGAL_LINK, LegalSection } from '@/components/next/LegalPage';
import SEO from '@/components/SEO';

/** Privacy Policy, open to everyone. The wording is the legal text as published; change it only with Omi's say. */
export default function PrivacyPolicy() {
  return (
    <LegalPage label="Your data, your rules" title="Privacy at EZZ BILL" updated="15 November 2026"
      lead="How your bills, NFC taps, emails and receipts are stored, who can see them, and how you stay in control.">
      <SEO title="Privacy at EZZ BILL" description="How your bills, NFC taps, emails and receipts are stored, who can see them, and how you stay in control." path="/privacy" />
      <LegalSection title="Bills & receipts you add">
        <p>
          Every bill you capture — a photo, a PDF, a manual entry or an SMS forward — is saved to your own
          account in the EZZ BILL database. Receipt images and PDFs are stored as files that only your
          account can open.
        </p>
        <Bullets
          items={[
            <>We store what the bill shows: merchant, amount, date, category and the items on it.</>,
            <>Details are filled in automatically by reading the bill — you can always correct them.</>,
            <>Nothing is published anywhere. Your bills are not visible to other apps or websites.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Your email (Gmail connection)">
        <p>
          When you connect Gmail, you grant EZZ BILL <strong>read-only</strong> access
          so it can find bills, subscriptions and warranty emails on your behalf.
        </p>
        <Bullets
          items={[
            <>Scans only run when <strong>you</strong> start them — there is no background reading of your inbox.</>,
            <>We look only for messages that look like bills, invoices, subscriptions or warranty documents — not your personal or unrelated mail.</>,
            <>We keep the <strong>extracted details</strong> (merchant, amount, date, items) plus a small reference ID so the same email is never imported twice. We do not keep copies of your entire mailbox.</>,
            <>We never send, move, label, modify or delete your emails.</>,
            <>Your sign-in token for Gmail is stored securely and used only to run the scans you request. You can revoke access at any time from your Google account or from the app.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="NFC taps">
        <p>
          When a bill is sent to an NFC table tag, it waits there until someone taps the tag with their phone.
        </p>
        <Bullets
          items={[
            <>A tap only reveals <strong>one thing</strong>: a short-lived link (about 5 minutes) to the single bill photo waiting on that tag. No other data on the tag or in your account is exposed.</>,
            <>Once the tapper claims the bill, it is imported into <strong>their</strong> account and the pending copy is cleared from the tag.</>,
            <>Unclaimed bills are cleared from the tag automatically after a short grace window.</>,
            <>Your staff can see bills waiting on your tags in the staff view, so they can confirm amounts before sending.</>,
            <>If someone taps a tag when nothing is pending, the page simply says the table is idle — nothing is shared.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="AI reading of your bills">
        <p>
          To turn a photo, PDF or email attachment into structured bill data, the document is processed by
          Google's Gemini AI service on EZZ BILL's behalf.
        </p>
        <Bullets
          items={[
            <>Only the bill document itself (and the surrounding bill details) is sent for reading — never your whole account, income settings or browsing.</>,
            <>The AI returns the extracted fields (merchant, amounts, dates, line items) which are saved to your account. Ask AI answers come from your own expense data.</>,
            <>Documents are sent only when you capture or scan them — not on a schedule, not in the background.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Who can see your data">
        <p>
          Access to every bill, receipt and document is controlled by the app's database security rules —
          data is scoped to your account, not publicly readable.
        </p>
        <Bullets
          items={[
            <>Splits share only what you choose: the friend names, phone numbers or emails you enter, and the amounts you assign.</>,
            <>NFC tags share only the pending bill photo with whoever taps that physical tag.</>,
            <>The EZZ BILL team does not browse your bills. Team access is limited to operating, securing and supporting the service.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="What we never do">
        <Bullets
          items={[
            <>We never sell your personal or financial data — to anyone, ever.</>,
            <>We never use your data to advertise to you or build profiles for other companies.</>,
            <>We never read emails unrelated to bills, subscriptions or warranties.</>,
            <>We never share your data with merchants, banks or third parties, except the services that run EZZ BILL for us (Google reads the bills you add), or when you explicitly use a feature that does (like contacting a merchant from Smart Support).</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Your control & deletion">
        <Bullets
          items={[
            <>Delete any bill, receipt, subscription, warranty or friend record from inside the app, any time.</>,
            <>Disconnect Gmail at any time — from the app or your Google account settings. Already-imported bills stay yours; you can delete those too.</>,
            <>Remove a pending bill from an NFC tag from the staff view before anyone claims it.</>,
            <>Ask us to delete your entire account and its data: <a href="mailto:ezbsolutions.ai@gmail.com" className={LEGAL_LINK}>ezbsolutions.ai@gmail.com</a>.</>,
          ]}
        />
        <Fine>
          We keep your data only while your account is active, or as long as needed to provide the service or
          meet legal obligations. Deleting items removes them from your account.
        </Fine>
      </LegalSection>

      <LegalSection title="Changes & contact">
        <p>
          If this policy changes, the updated version will appear on this page with a new date. Questions
          about your privacy? Write to us at{' '}
          <a href="mailto:ezbsolutions.ai@gmail.com" className={LEGAL_LINK}>
            ezbsolutions.ai@gmail.com
          </a>
          .
        </p>
        <Fine>
          See also our <Link to="/terms" className={LEGAL_LINK}>Terms and Conditions</Link>.
        </Fine>
      </LegalSection>
    </LegalPage>
  );
}
