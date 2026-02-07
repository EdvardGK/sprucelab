import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SemanticTypeCategory } from '@/hooks/use-warehouse';

// Category colors for semantic types (PA0802 categories)
const CATEGORY_COLORS: Record<SemanticTypeCategory, { bg: string; text: string; border: string }> = {
  'A-Structural': {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
  },
  'D-Openings': {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
  },
  'E-Cladding': {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-700',
  },
  'F-MEP': {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-300 dark:border-purple-700',
  },
  'Z-Generic': {
    bg: 'bg-gray-100 dark:bg-gray-800/50',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-300 dark:border-gray-600',
  },
};

// Source icons
const SOURCE_ICONS = {
  auto_ifc_class: AlertCircle,
  auto_name_pattern: AlertCircle,
  manual: HelpCircle,
  verified: CheckCircle2,
};

export interface SemanticTypeBadgeProps {
  code: string | null;
  name: string | null;
  category?: SemanticTypeCategory | null;
  source?: 'auto_ifc_class' | 'auto_name_pattern' | 'manual' | 'verified' | null;
  confidence?: number | null;
  showConfidence?: boolean;
  showSource?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SemanticTypeBadge({
  code,
  name,
  category,
  source,
  confidence,
  showConfidence = false,
  showSource = true,
  size = 'md',
  className,
}: SemanticTypeBadgeProps) {
  const { t } = useTranslation();

  // No semantic type assigned
  if (!code) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'font-normal opacity-60',
          size === 'sm' && 'text-xs px-1.5 py-0',
          size === 'lg' && 'text-sm px-3 py-1',
          className
        )}
      >
        <HelpCircle className={cn(
          'mr-1',
          size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'
        )} />
        {t('semanticTypes.unassigned')}
      </Badge>
    );
  }

  // Get category colors
  const colors = category ? CATEGORY_COLORS[category] : CATEGORY_COLORS['Z-Generic'];
  const SourceIcon = source ? SOURCE_ICONS[source] : null;
  const isVerified = source === 'verified';
  const isAuto = source === 'auto_ifc_class' || source === 'auto_name_pattern';

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1.5',
    lg: 'text-sm px-3 py-1 gap-2',
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border',
        colors.bg,
        colors.text,
        colors.border,
        sizeClasses[size],
        className
      )}
    >
      {/* Source icon */}
      {showSource && SourceIcon && (
        <SourceIcon
          className={cn(
            iconSizeClasses[size],
            isVerified && 'text-green-600 dark:text-green-400',
            isAuto && 'opacity-60'
          )}
        />
      )}

      {/* Code */}
      <span className="font-semibold">{code}</span>

      {/* Name (only for md and lg) */}
      {size !== 'sm' && name && (
        <span className="opacity-80 truncate max-w-[120px]">{name}</span>
      )}

      {/* Confidence indicator */}
      {showConfidence && confidence !== null && confidence !== undefined && !isVerified && (
        <span className={cn(
          'ml-1 opacity-60',
          size === 'sm' ? 'text-[10px]' : 'text-xs'
        )}>
          {Math.round(confidence * 100)}%
        </span>
      )}
    </Badge>
  );

  // Wrap with tooltip for additional info
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-semibold">
              {code}: {name || t('semanticTypes.noType')}
            </div>
            {category && (
              <div className="text-xs text-muted-foreground">
                {t(`semanticTypes.categories.${category}`)}
              </div>
            )}
            {source && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span>{t('semanticTypes.source')}:</span>
                <span>{t(`semanticTypes.sources.${source}`)}</span>
              </div>
            )}
            {confidence !== null && confidence !== undefined && (
              <div className="text-xs text-muted-foreground">
                {t('semanticTypes.confidence')}: {Math.round(confidence * 100)}%
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Simple inline badge without tooltip (for tables/lists).
 */
export function SemanticTypePill({
  code,
  category,
  source,
  className,
}: {
  code: string | null;
  category?: SemanticTypeCategory | null;
  source?: 'auto_ifc_class' | 'auto_name_pattern' | 'manual' | 'verified' | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!code) {
    return (
      <span className={cn('text-xs text-muted-foreground italic', className)}>
        {t('semanticTypes.unassigned')}
      </span>
    );
  }

  const colors = category ? CATEGORY_COLORS[category] : CATEGORY_COLORS['Z-Generic'];
  const isVerified = source === 'verified';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded',
        colors.bg,
        colors.text,
        className
      )}
    >
      {isVerified && <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />}
      {code}
    </span>
  );
}

export default SemanticTypeBadge;
