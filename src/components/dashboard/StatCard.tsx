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

const variantIconColors = {
  default: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-gold',
  info: 'text-info',
  destructive: 'text-destructive',
};

function CircularProgress({ value, size = 44, strokeWidth = 3, variant = 'default' }: { value: number; size?: number; strokeWidth?: number; variant?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const colorMap: Record<string, string> = {
    default: 'hsl(var(--primary))',
    primary: 'hsl(var(--primary))',
    success: 'hsl(var(--success))',
    warning: 'hsl(var(--gold))',
    info: 'hsl(var(--info))',
    destructive: 'hsl(var(--destructive))',
  };

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsla(160, 8%, 25%, 0.3)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colorMap[variant] || colorMap.default} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700 ease-out" />
    </svg>
  );
}

export function StatCard({ title, value, icon: Icon, description, variant = 'default', progress }: StatCardProps) {
  return (
    <Card className="glass-card overflow-hidden border-border/20 hover:border-border/40 transition-all duration-200">
      <CardContent className="flex items-center gap-3 p-4">
        {progress !== undefined ? (
          <div className="relative shrink-0">
            <CircularProgress value={progress} size={44} strokeWidth={3} variant={variant} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className={`h-4 w-4 ${variantIconColors[variant]}`} />
            </div>
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <Icon className={`h-4 w-4 ${variantIconColors[variant]}`} />
          </div>
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-lg sm:text-xl font-bold leading-tight truncate text-foreground">{value}</p>
          {description && (
            <p className="text-[10px] sm:text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
