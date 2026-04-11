import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="prose prose-invert max-w-none space-y-6">
          <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last Updated: April 4, 2026</p>

          <p className="text-muted-foreground">ez bill is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.</p>

          <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>

          <h3 className="text-base font-medium text-foreground">a. Account Information</h3>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Name (optional)</li>
            <li>Email address</li>
            <li>Phone number (if provided)</li>
          </ul>

          <h3 className="text-base font-medium text-foreground">b. Transaction Data</h3>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Bill details (merchant name, amount, date, category)</li>
            <li>Uploaded receipts (images or PDFs)</li>
            <li>Bill splitting information</li>
          </ul>

          <h3 className="text-base font-medium text-foreground">c. Email Data (Gmail Integration)</h3>
          <p className="text-muted-foreground">If you connect your Gmail account:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>We access only emails and attachments relevant to bills and receipts</li>
            <li>We do not access unrelated personal emails</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
          <p className="text-muted-foreground">We use your data to:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Extract and organize bills</li>
            <li>Track expenses and generate insights</li>
            <li>Enable bill splitting features</li>
            <li>Improve user experience and product functionality</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">3. Data Storage and Security</h2>
          <p className="text-muted-foreground">We implement reasonable technical and organizational measures to protect your data. However, no method of transmission or storage is completely secure.</p>

          <h2 className="text-lg font-semibold text-foreground">4. Data Sharing</h2>
          <p className="text-muted-foreground">We do not sell your personal or financial data.</p>
          <p className="text-muted-foreground">We may share data only:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>With trusted service providers (e.g., hosting, authentication)</li>
            <li>When required by law or legal processes</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">5. Gmail Access</h2>
          <p className="text-muted-foreground">If granted:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Access is strictly read-only</li>
            <li>Limited to identifying bills and receipts</li>
            <li>You can revoke access anytime via your Google account</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">6. Your Rights and Control</h2>
          <p className="text-muted-foreground">You can:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Edit or update your information</li>
            <li>Delete your data</li>
            <li>Disconnect Gmail access</li>
            <li>Request account deletion</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">7. Data Retention</h2>
          <p className="text-muted-foreground">We retain your data only as long as necessary to provide services or comply with legal obligations.</p>

          <h2 className="text-lg font-semibold text-foreground">8. Children's Privacy</h2>
          <p className="text-muted-foreground">ez bill is not intended for users under the age of 18.</p>

          <h2 className="text-lg font-semibold text-foreground">9. Changes to this Policy</h2>
          <p className="text-muted-foreground">We may update this policy periodically. Continued use of the service indicates acceptance of changes.</p>

          <h2 className="text-lg font-semibold text-foreground">10. Contact</h2>
          <p className="text-muted-foreground">For privacy-related queries, contact: <a href="mailto:ezbsolutions.ai@gmail.com" className="text-primary underline">ezbsolutions.ai@gmail.com</a></p>
        </div>
      </div>
    </div>
  );
}
