/**
 * Representative Unit Badge
 *
 * Displays procurement tier badge (Product/Parametric/Built)
 * with color coding and optional unit display.
 */

import { cn } from '@/lib/utils';
import { getRepresentativeUnit, type ProcurementTier } from '@/lib/procurement-tiers';
import { Box, Ruler, Layers } from 'lucide-react';

interface RepresentativeUnitBadgeProps {
  ifcType: string;
  showLabel?: boolean;
  showUnit?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TIER_ICONS: Record<ProcurementTier, typeof Box> = {
  product: Box,
  parametric: Ruler,
  built: Layers,
};

const SIZE_CLASSES = {
  sm: {
    badge: 'px-1.5 py-0.5 text-xs gap-1',
    icon: 'h-3 w-3',
  },
  md: {
    badge: 'px-2 py-1 text-sm gap-1.5',
    icon: 'h-4 w-4',
  },
  lg: {
    badge: 'px-3 py-1.5 text-base gap-2',
    icon: 'h-5 w-5',
  },
};

export function RepresentativeUnitBadge({
  ifcType,
  showLabel = true,
  showUnit = true,
  size = 'md',
  className,
}: RepresentativeUnitBadgeProps) {
  const unitInfo = getRepresentativeUnit(ifcType);
  const Icon = TIER_ICONS[unitInfo.tier];
  const sizeClasses = SIZE_CLASSES[size];

  // Map tier colors to semantic classes
  const colorClasses = {
    product: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    parametric: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    built: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-medium',
        colorClasses[unitInfo.tier],
        sizeClasses.badge,
        className
      )}
      title={`${unitInfo.tier} - ${unitInfo.labelNorwegian}`}
    >
      <Icon className={sizeClasses.icon} />
      {showLabel && <span className="capitalize">{unitInfo.tier}</span>}
      {showUnit && <span className="opacity-75">({unitInfo.unit})</span>}
    </span>
  );
}

/**
 * Compact variant showing just the unit.
 */
export function UnitBadge({
  ifcType,
  size = 'sm',
  className,
}: {
  ifcType: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const unitInfo = getRepresentativeUnit(ifcType);

  const sizeClasses = {
    sm: 'px-1 py-0.5 text-xs',
    md: 'px-1.5 py-0.5 text-sm',
  };

  const colorClasses = {
    product: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    parametric: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    built: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded font-mono font-medium min-w-[2.5rem]',
        colorClasses[unitInfo.tier],
        sizeClasses[size],
        className
      )}
      title={unitInfo.labelNorwegian}
    >
      {unitInfo.unit}
    </span>
  );
}
