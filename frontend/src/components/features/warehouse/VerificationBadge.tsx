import { useTranslation } from 'react-i18next';
import { Check, AlertCircle, Clock, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { VerificationStatus } from '@/hooks/use-warehouse';

interface VerificationBadgeProps {
  status: VerificationStatus;
  verifiedAt?: string | null;
  flagReason?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<VerificationStatus, {
  icon: typeof Check;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}> = {
  pending: {
    icon: Clock,
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
    borderClass: 'border-muted',
  },
  auto: {
    icon: Bot,
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
  },
  verified: {
    icon: Check,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
  },
  flagged: {
    icon: AlertCircle,
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    borderClass: 'border-red-200 dark:border-red-800',
  },
};

const sizeConfig = {
  sm: {
    iconSize: 'h-3 w-3',
    badgeClass: 'px-1.5 py-0.5 text-[10px]',
    gap: 'gap-1',
  },
  md: {
    iconSize: 'h-3.5 w-3.5',
    badgeClass: 'px-2 py-0.5 text-xs',
    gap: 'gap-1.5',
  },
  lg: {
    iconSize: 'h-4 w-4',
    badgeClass: 'px-2.5 py-1 text-sm',
    gap: 'gap-2',
  },
};

export function VerificationBadge({
  status,
  verifiedAt,
  flagReason,
  size = 'md',
  showLabel = true,
  className,
}: VerificationBadgeProps) {
  const { t } = useTranslation();

  const config = statusConfig[status];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const label = t(`typeLibrary.verification.${status}`);

  const tooltipContent = () => {
    if (status === 'flagged' && flagReason) {
      return `${label}: ${flagReason}`;
    }
    if (verifiedAt) {
      return `${label} - ${new Date(verifiedAt).toLocaleDateString()}`;
    }
    return label;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'inline-flex items-center font-medium border',
              config.bgClass,
              config.borderClass,
              config.colorClass,
              sizeStyles.badgeClass,
              sizeStyles.gap,
              className
            )}
          >
            <Icon className={sizeStyles.iconSize} />
            {showLabel && <span>{label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipContent()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact verification status icon for use in grids/tables.
 */
export function VerificationStatusIcon({
  status,
  className,
}: {
  status: VerificationStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  const Icon = config.icon;
  const label = t(`typeLibrary.verification.${status}`);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full p-1',
              config.bgClass,
              className
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', config.colorClass)} />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Quick filter buttons for verification status.
 */
export function VerificationStatusFilter({
  value,
  onChange,
  counts,
  className,
}: {
  value: VerificationStatus | 'all';
  onChange: (status: VerificationStatus | 'all') => void;
  counts?: Record<VerificationStatus | 'all', number>;
  className?: string;
}) {
  const { t } = useTranslation();

  const statuses: (VerificationStatus | 'all')[] = ['all', 'pending', 'auto', 'verified', 'flagged'];

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {statuses.map((status) => {
        const isActive = value === status;
        const count = counts?.[status];

        if (status === 'all') {
          return (
            <button
              key={status}
              onClick={() => onChange(status)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              )}
            >
              {t('common.all')}
              {count !== undefined && (
                <span className="ml-1.5 opacity-70">({count})</span>
              )}
            </button>
          );
        }

        const config = statusConfig[status];
        const Icon = config.icon;

        return (
          <button
            key={status}
            onClick={() => onChange(status)}
            className={cn(
              'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
              isActive
                ? cn(config.bgClass, config.borderClass, 'border', config.colorClass)
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {count !== undefined && <span>({count})</span>}
          </button>
        );
      })}
    </div>
  );
}
