import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'info' | 'destructive';
  progress?: number;
}

const variantStyles = {
  default: 'bg-card text-card-foreground',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  info: 'bg-info text-info-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
};

const iconBgStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-foreground/20 text-primary-foreground',
  success: 'bg-success-foreground/20 text-success-foreground',
  warning: 'bg-warning-foreground/20 text-warning-foreground',
  info: 'bg-info-foreground/20 text-info-foreground',
  destructive: 'bg-destructive-foreground/20 text-destructive-foreground',
};

function CircularProgress({ value, size = 48, strokeWidth = 4, variant = 'default' }: { value: number; size?: number; strokeWidth?: number; variant?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const strokeColor = variant === 'default' ? 'hsl(var(--primary))' : 'currentColor';
  const trackColor = variant === 'default' ? 'hsl(var(--muted))' : 'currentColor';

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} opacity={0.2} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700 ease-out" />
    </svg>
  );
}

export function StatCard({ title, value, icon: Icon, description, variant = 'default', progress }: StatCardProps) {
  return (
    <Card className={`${variantStyles[variant]} overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-200`}>
      <CardContent className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
        {progress !== undefined ? (
          <div className="relative shrink-0">
            <CircularProgress value={progress} size={48} strokeWidth={4} variant={variant} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="h-5 w-5" />
            </div>
          </div>
        ) : (
          <div className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${iconBgStyles[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 space-y-0.5">
          <p className={`text-[11px] sm:text-xs font-medium uppercase tracking-wider ${variant === 'default' ? 'text-muted-foreground' : 'opacity-80'}`}>
            {title}
          </p>
          <p className="text-xl sm:text-2xl font-bold leading-tight truncate">{value}</p>
          {description && (
            <p className={`text-xs ${variant === 'default' ? 'text-muted-foreground' : 'opacity-70'}`}>
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
