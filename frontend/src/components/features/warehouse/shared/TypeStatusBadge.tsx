import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle, AlertTriangle, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type MappingStatus = 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';

interface TypeStatusBadgeProps {
  status: MappingStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<MappingStatus, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  icon: typeof CheckCircle2;
  colorClass: string;
}> = {
  pending: {
    variant: 'outline',
    icon: Clock,
    colorClass: 'text-muted-foreground',
  },
  mapped: {
    variant: 'success',
    icon: CheckCircle2,
    colorClass: 'text-emerald-600',
  },
  ignored: {
    variant: 'secondary',
    icon: XCircle,
    colorClass: 'text-muted-foreground',
  },
  review: {
    variant: 'warning',
    icon: AlertTriangle,
    colorClass: 'text-amber-600',
  },
  followup: {
    variant: 'default',
    icon: MessageCircle,
    colorClass: 'text-blue-600',
  },
};

export function TypeStatusBadge({
  status,
  size = 'sm',
  showIcon = true,
  className,
}: TypeStatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant as 'default' | 'secondary' | 'destructive' | 'outline'}
      className={cn(
        size === 'sm' && 'text-xs px-1.5 py-0',
        size === 'md' && 'text-sm px-2 py-0.5',
        className
      )}
    >
      {showIcon && (
        <Icon className={cn('h-3 w-3 mr-1', config.colorClass)} />
      )}
      {t(`status.${status}`)}
    </Badge>
  );
}

// Simple variant without badge wrapper
export function TypeStatusIndicator({
  status,
  className,
}: {
  status: MappingStatus;
  className?: string;
}) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Icon className={cn('h-4 w-4', config.colorClass, className)} />
  );
}

export default TypeStatusBadge;
