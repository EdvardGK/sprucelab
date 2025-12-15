/**
 * Type Info Panel
 *
 * Displays metadata about the current IFC type in the focused view.
 * Shows type name, IFC class, discipline, instance count, and mapping status.
 */

import { Badge } from '@/components/ui/badge';
import { RepresentativeUnitBadge } from './RepresentativeUnitBadge';
import type { IFCType } from '@/hooks/use-warehouse';
import { cn } from '@/lib/utils';
import { parseDiscipline } from '@/lib/procurement-tiers';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Flag,
} from 'lucide-react';

interface TypeInfoPanelProps {
  type: IFCType;
  modelFilename?: string;
  className?: string;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  mapped: {
    label: 'Mapped',
    icon: CheckCircle2,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  ignored: {
    label: 'Ignored',
    icon: XCircle,
    color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  },
  review: {
    label: 'Needs Review',
    icon: AlertCircle,
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  followup: {
    label: 'Follow-up',
    icon: Flag,
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
} as const;

export function TypeInfoPanel({ type, modelFilename, className }: TypeInfoPanelProps) {
  const mapping = type.mapping;
  const status = mapping?.mapping_status || 'pending';
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  // Try to get discipline from mapping or parse from filename
  const discipline = mapping?.discipline || (modelFilename ? parseDiscipline(modelFilename) : null);

  // Get NS3451 display info
  const ns3451Display = mapping?.ns3451_name
    ? `${mapping.ns3451_code} - ${mapping.ns3451_name}`
    : mapping?.ns3451_code || null;

  return (
    <div className={cn('rounded-lg border bg-background p-2.5', className)}>
      {/* Compact header: Type name + Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary truncate" title={type.type_name}>
            {type.type_name}
          </h3>
          <p className="text-[10px] text-text-tertiary font-mono truncate">
            {type.ifc_type} • {type.instance_count} instances
          </p>
        </div>
        <Badge className={cn('gap-0.5 shrink-0 text-[10px] px-1.5 py-0', statusConfig.color)}>
          <StatusIcon className="h-2.5 w-2.5" />
          {statusConfig.label}
        </Badge>
      </div>

      {/* Single row: Unit + Discipline + NS3451 */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <RepresentativeUnitBadge ifcType={type.ifc_type} size="sm" />
        {discipline && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {discipline}
          </Badge>
        )}
        {ns3451Display && (
          <span className="text-text-secondary truncate" title={ns3451Display}>
            NS3451: <span className="font-medium text-text-primary">{ns3451Display}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version for list views.
 */
export function TypeInfoCompact({
  type,
  className,
}: {
  type: IFCType;
  className?: string;
}) {
  const status = type.mapping?.mapping_status || 'pending';
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-text-primary truncate">{type.type_name}</div>
        <div className="text-xs text-text-tertiary">{type.ifc_type}</div>
      </div>
      <RepresentativeUnitBadge ifcType={type.ifc_type} size="sm" showLabel={false} />
      <Badge className={cn('gap-1 shrink-0', statusConfig.color)} variant="secondary">
        <StatusIcon className="h-3 w-3" />
        <span className="sr-only">{statusConfig.label}</span>
      </Badge>
      <span className="text-xs text-text-tertiary tabular-nums w-12 text-right">
        {type.instance_count}
      </span>
    </div>
  );
}
