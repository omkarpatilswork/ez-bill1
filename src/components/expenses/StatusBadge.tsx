import { Badge } from '@/components/ui/badge';
import { STATUS_CONFIG, type ExpenseStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: ExpenseStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
