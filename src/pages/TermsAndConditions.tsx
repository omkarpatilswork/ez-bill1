import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function TermsAndConditions() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="prose prose-invert max-w-none space-y-6">
          <h1 className="text-2xl font-bold text-foreground">Terms and Conditions</h1>
          <p className="text-sm text-muted-foreground">Last Updated: April 4, 2026</p>

          <p className="text-muted-foreground">Welcome to ez bill. By accessing or using the ez bill application, you agree to the following terms.</p>

          <h2 className="text-lg font-semibold text-foreground">1. Use of the Service</h2>
          <p className="text-muted-foreground">ez bill allows users to track expenses, import bills from email, upload receipts, and split expenses with others. You agree to use the service only for lawful purposes and in accordance with these terms.</p>

          <h2 className="text-lg font-semibold text-foreground">2. User Account</h2>
          <p className="text-muted-foreground">You are responsible for maintaining the confidentiality of your account and all activities under it. You agree to provide accurate and up-to-date information.</p>

          <h2 className="text-lg font-semibold text-foreground">3. Data Accuracy</h2>
          <p className="text-muted-foreground">ez bill uses automated systems to extract bill details. While we strive for accuracy, we do not guarantee correctness. Users are responsible for reviewing and confirming all extracted or entered data before saving.</p>

          <h2 className="text-lg font-semibold text-foreground">4. Email Integration (Gmail Access)</h2>
          <p className="text-muted-foreground">If you choose to connect your Gmail account:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Access is read-only.</li>
            <li>We only access emails and attachments relevant to bills and receipts.</li>
            <li>We do not send, modify, or delete emails.</li>
            <li>You can revoke access at any time through your Google account.</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">5. Expense Tracking and Currency</h2>
          <p className="text-muted-foreground">ez bill supports multiple currencies. While we may provide converted values for convenience, exchange rates may vary and should not be relied upon for financial decisions.</p>

          <h2 className="text-lg font-semibold text-foreground">6. Bill Splitting</h2>
          <p className="text-muted-foreground">ez bill enables users to split expenses with others:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Users are responsible for entering correct participant details and amounts.</li>
            <li>ez bill does not process payments or enforce settlements between users.</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">7. Prohibited Use</h2>
          <p className="text-muted-foreground">You agree not to:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Use the service for fraudulent or unlawful activities</li>
            <li>Attempt unauthorized access to systems or data</li>
            <li>Interfere with the proper functioning of the platform</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">8. Limitation of Liability</h2>
          <p className="text-muted-foreground">ez bill is provided "as is" without warranties of any kind. We are not liable for:</p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Errors in extracted or user-entered data</li>
            <li>Financial decisions made using the app</li>
            <li>Disputes between users</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">9. Termination</h2>
          <p className="text-muted-foreground">We reserve the right to suspend or terminate your access if you violate these terms.</p>

          <h2 className="text-lg font-semibold text-foreground">10. Changes to Terms</h2>
          <p className="text-muted-foreground">We may update these terms from time to time. Continued use of the service constitutes acceptance of the updated terms.</p>

          <h2 className="text-lg font-semibold text-foreground">11. Contact</h2>
          <p className="text-muted-foreground">For any questions, contact: <a href="mailto:ezbsolutions.ai@gmail.com" className="text-primary underline">ezbsolutions.ai@gmail.com</a></p>
        </div>
      </div>
    </div>
  );
}
