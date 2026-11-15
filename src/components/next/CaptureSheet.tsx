import { useNavigate } from 'react-router-dom';
import { Mail, MessageSquareText, Nfc, ScanLine, Upload } from 'lucide-react';
import { Sheet, SheetChoices } from '@/components/next/Sheet';
import { handOver } from '@/lib/capture-inbox';

/**
 * "Add a bill": the one way in, whatever the source. Scan and Upload open the
 * camera or the file picker straight from here, so a bill is two taps from
 * any screen; the files are handed to the review screen, where every source
 * ends.
 */
export default function CaptureSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const go = (to: string, fresh = false) => { onOpenChange(false); navigate(to, fresh ? { state: { batch: Date.now() } } : undefined); };

  const picker = (mode: 'scan' | 'upload') => (
    <input type="file" className="sr-only" multiple={mode === 'upload'} accept={mode === 'scan' ? 'image/*' : 'image/*,.pdf,.heic,.heif'}
      {...(mode === 'scan' ? { capture: 'environment' as const } : {})}
      onChange={(e) => {
        const files = [...(e.target.files || [])];
        e.target.value = '';
        if (!files.length) return;
        handOver(files);
        go(`/expenses/new?mode=${mode}`, true);
      }} />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} label="Add a bill" title="Where is it?">
      <SheetChoices choices={[
        { label: 'Scan', hint: 'Point the camera at a paper bill.', icon: ScanLine, input: picker('scan') },
        { label: 'Upload', hint: 'Photos or PDFs. One or many.', icon: Upload, input: picker('upload') },
        { label: 'Gmail', hint: 'Bills and receipts in your inbox.', icon: Mail, onSelect: () => go('/email-bills') },
        { label: 'SMS', hint: 'UPI and card messages.', icon: MessageSquareText, onSelect: () => go('/email-bills?tab=upi') },
        { label: 'Tap', hint: 'NFC tag or QR code at the table.', icon: Nfc, onSelect: () => go('/nfc-airdrop') },
      ]} />
      <button type="button" onClick={() => go('/expenses/new', true)} className="mt-3 w-full rounded-full py-2.5 text-[14px] font-medium text-dim hover:text-fg">
        No bill to show? Type it in
      </button>
    </Sheet>
  );
}
