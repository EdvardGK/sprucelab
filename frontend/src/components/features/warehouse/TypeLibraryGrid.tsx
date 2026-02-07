import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Layers, Tag, CheckCircle2 } from 'lucide-react';
import {
  useGlobalTypeLibrary,
  type GlobalTypeLibraryEntry,
  type VerificationStatus,
} from '@/hooks/use-warehouse';
import { VerificationStatusIcon, VerificationStatusFilter } from './VerificationBadge';
import { cn } from '@/lib/utils';

interface TypeLibraryGridProps {
  projectId?: string;
  modelId?: string;
  selectedTypeId?: string;
  verificationFilter?: VerificationStatus | 'all';
  searchQuery?: string;
  onSelectType: (type: GlobalTypeLibraryEntry) => void;
  onVerificationFilterChange?: (status: VerificationStatus | 'all') => void;
  className?: string;
}

// Column group definitions for visual organization
const COLUMN_GROUPS = [
  { id: 'identity', icon: Box, columns: ['type_name', 'ifc_class', 'instances'] },
  { id: 'classification', icon: Tag, columns: ['ns3451', 'semantic', 'discipline'] },
  { id: 'materials', icon: Layers, columns: ['materials', 'epd'] },
  { id: 'status', icon: CheckCircle2, columns: ['verification'] },
] as const;

export function TypeLibraryGrid({
  projectId,
  modelId,
  selectedTypeId,
  verificationFilter = 'all',
  searchQuery,
  onSelectType,
  onVerificationFilterChange,
  className,
}: TypeLibraryGridProps) {
  const { t } = useTranslation();

  // Fetch types with filters
  const { data: types = [], isLoading } = useGlobalTypeLibrary({
    projectId,
    modelId,
    verificationStatus: verificationFilter !== 'all' ? verificationFilter : undefined,
    search: searchQuery,
  });

  // Calculate verification counts for filter buttons
  const verificationCounts = useMemo(() => {
    const all = types.length;
    const pending = types.filter(t => t.verification_status === 'pending').length;
    const auto = types.filter(t => t.verification_status === 'auto').length;
    const verified = types.filter(t => t.verification_status === 'verified').length;
    const flagged = types.filter(t => t.verification_status === 'flagged').length;
    return { all, pending, auto, verified, flagged };
  }, [types]);

  // Group types by IFC class for display
  const groupedTypes = useMemo(() => {
    const groups: Record<string, GlobalTypeLibraryEntry[]> = {};
    for (const type of types) {
      if (!groups[type.ifc_class]) {
        groups[type.ifc_class] = [];
      }
      groups[type.ifc_class].push(type);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [types]);

  const handleRowClick = useCallback((type: GlobalTypeLibraryEntry) => {
    onSelectType(type);
  }, [onSelectType]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-muted-foreground text-sm">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with verification filter */}
      {onVerificationFilterChange && (
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="text-sm font-medium text-muted-foreground">
            {t('typeLibrary.types')} ({types.length})
          </div>
          <VerificationStatusFilter
            value={verificationFilter}
            onChange={onVerificationFilterChange}
            counts={verificationCounts}
          />
        </div>
      )}

      {/* Column group headers */}
      <div className="flex items-stretch border-b bg-muted/50">
        {COLUMN_GROUPS.map((group) => {
          const Icon = group.icon;
          const widthClass = group.id === 'identity' ? 'flex-[2]'
            : group.id === 'classification' ? 'flex-[2]'
            : group.id === 'materials' ? 'flex-1'
            : 'w-20';

          return (
            <div
              key={group.id}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 border-r last:border-r-0',
                'text-xs font-medium text-muted-foreground uppercase tracking-wider',
                widthClass
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`typeLibrary.columnGroups.${group.id}`)}
            </div>
          );
        })}
      </div>

      {/* Sub-headers for columns */}
      <div className="flex items-stretch border-b text-xs font-medium text-muted-foreground bg-muted/20">
        {/* Identity group */}
        <div className="flex-[2] flex border-r">
          <div className="flex-[2] px-3 py-1.5 border-r">{t('typeLibrary.columns.typeName')}</div>
          <div className="flex-1 px-3 py-1.5 border-r">{t('typeLibrary.columns.ifcClass')}</div>
          <div className="w-16 px-3 py-1.5 text-right">#</div>
        </div>
        {/* Classification group */}
        <div className="flex-[2] flex border-r">
          <div className="flex-1 px-3 py-1.5 border-r">{t('typeLibrary.columns.ns3451')}</div>
          <div className="flex-1 px-3 py-1.5 border-r">{t('typeLibrary.columns.semantic')}</div>
          <div className="w-16 px-3 py-1.5">{t('typeLibrary.columns.discipline')}</div>
        </div>
        {/* Materials group */}
        <div className="flex-1 flex border-r">
          <div className="flex-1 px-3 py-1.5">{t('typeLibrary.columns.materials')}</div>
        </div>
        {/* Status group */}
        <div className="w-20 px-3 py-1.5 text-center">
          {t('typeLibrary.columns.status')}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {groupedTypes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {t('typeLibrary.noTypes')}
          </div>
        ) : (
          groupedTypes.map(([ifcClass, classTypes]) => (
            <div key={ifcClass}>
              {/* IFC Class group header */}
              <div className="sticky top-0 z-10 px-3 py-1.5 bg-muted/80 border-b text-xs font-semibold text-muted-foreground backdrop-blur-sm">
                {ifcClass} ({classTypes.length})
              </div>

              {/* Types in this class */}
              {classTypes.map((type) => (
                <TypeRow
                  key={type.id}
                  type={type}
                  isSelected={type.id === selectedTypeId}
                  onClick={() => handleRowClick(type)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Individual type row component
function TypeRow({
  type,
  isSelected,
  onClick,
}: {
  type: GlobalTypeLibraryEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-stretch border-b cursor-pointer transition-colors',
        'hover:bg-accent/50',
        isSelected && 'bg-accent'
      )}
    >
      {/* Identity group */}
      <div className="flex-[2] flex border-r">
        <div className="flex-[2] px-3 py-2 border-r truncate text-sm font-medium">
          {type.type_name}
        </div>
        <div className="flex-1 px-3 py-2 border-r truncate text-sm text-muted-foreground">
          {type.ifc_class.replace('Ifc', '').replace('Type', '')}
        </div>
        <div className="w-16 px-3 py-2 text-right text-sm tabular-nums text-muted-foreground">
          {type.total_instance_count}
        </div>
      </div>

      {/* Classification group */}
      <div className="flex-[2] flex border-r">
        <div className="flex-1 px-3 py-2 border-r truncate text-sm">
          {type.ns3451_code ? (
            <span className="font-mono text-xs">{type.ns3451_code}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
        <div className="flex-1 px-3 py-2 border-r truncate text-sm">
          {type.semantic_type_code ? (
            <span className="font-mono text-xs">{type.semantic_type_code}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
        <div className="w-16 px-3 py-2 text-sm">
          {type.discipline ? (
            <span className="text-xs font-medium">{type.discipline}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      </div>

      {/* Materials group */}
      <div className="flex-1 flex border-r">
        <div className="flex-1 px-3 py-2 text-sm text-muted-foreground">
          {/* Placeholder - will show material layer count when available */}
          -
        </div>
      </div>

      {/* Status group */}
      <div className="w-20 flex items-center justify-center">
        <VerificationStatusIcon status={type.verification_status} />
      </div>
    </div>
  );
}
