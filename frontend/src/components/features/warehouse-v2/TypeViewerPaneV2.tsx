import { useTranslation } from 'react-i18next';
import { Box, X, Filter, Layers } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { InlineViewer } from '@/components/features/viewer/InlineViewer';
import type { IFCType } from '@/hooks/use-warehouse';

interface TypeViewerPaneV2Props {
  modelId: string;
  selectedType: IFCType | null;
  /** Active IFC class filter (or 'all'). When set and no type is selected,
      the viewer pane shows a class-scoped state instead of the empty hint. */
  activeIfcClass?: string;
  filteredTypeCount?: number;
  filteredInstanceCount?: number;
  /** Color of the filtered class in the shared class-color map. */
  classColor?: string;
  onClearSelection: () => void;
}

export function TypeViewerPaneV2({
  modelId,
  selectedType,
  activeIfcClass = 'all',
  filteredTypeCount = 0,
  filteredInstanceCount = 0,
  classColor,
  onClearSelection,
}: TypeViewerPaneV2Props) {
  const { t } = useTranslation();
  const isClassFiltered = activeIfcClass !== 'all' && !selectedType;
  const titleClassName = selectedType
    ? selectedType.type_name || t('typesV2.table.unnamed')
    : isClassFiltered
      ? activeIfcClass.replace(/^Ifc/, '')
      : t('typesV2.viewer.empty');

  return (
    <DashboardTile id="viewer-pane" className="p-0 flex flex-col h-full">
      <div className="flex items-center justify-between px-[clamp(0.5rem,1vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-[clamp(0.375rem,0.5vw,0.625rem)] min-w-0">
          {isClassFiltered ? (
            <Filter
              className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] shrink-0"
              style={{ color: classColor ?? 'currentColor' }}
            />
          ) : (
            <Box className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] text-muted-foreground shrink-0" />
          )}
          <h2 className="text-[clamp(0.7rem,0.9vw,0.95rem)] font-medium truncate">
            {titleClassName}
          </h2>
          {isClassFiltered && (
            <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums">
              {t('typesV2.viewer.filteredHint', {
                types: filteredTypeCount,
                instances: filteredInstanceCount,
              })}
            </span>
          )}
        </div>
        {selectedType && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-[clamp(1rem,1.5vw,1.5rem)] w-[clamp(1rem,1.5vw,1.5rem)] p-0"
            title={t('typesV2.viewer.clear')}
          >
            <X className="h-[clamp(0.625rem,0.9vw,0.875rem)] w-[clamp(0.625rem,0.9vw,0.875rem)]" />
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {selectedType ? (
          <InlineViewer
            key={selectedType.id}
            modelId={modelId}
            typeId={selectedType.id}
            typeName={selectedType.type_name}
            ifcType={selectedType.ifc_type}
            definitionLayers={selectedType.mapping?.definition_layers}
            className="h-full w-full"
          />
        ) : isClassFiltered ? (
          <ClassFilteredState
            ifcClass={activeIfcClass}
            classColor={classColor}
            instanceCount={filteredInstanceCount}
            typeCount={filteredTypeCount}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-[clamp(0.375rem,0.6vh,0.75rem)] px-[clamp(0.75rem,1.5vw,1.5rem)] text-center">
            <Box className="h-[clamp(1.5rem,3vw,3rem)] w-[clamp(1.5rem,3vw,3rem)] opacity-30" />
            <p className="text-[clamp(0.65rem,0.85vw,0.9rem)]">{t('typesV2.viewer.hint')}</p>
          </div>
        )}
      </div>
    </DashboardTile>
  );
}

function ClassFilteredState({
  ifcClass,
  classColor,
  instanceCount,
  typeCount,
}: {
  ifcClass: string;
  classColor?: string;
  instanceCount: number;
  typeCount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-[clamp(0.75rem,1.5vw,1.5rem)] gap-[clamp(0.5rem,1vh,1rem)]">
      <div
        className="h-[clamp(2rem,4vw,3.5rem)] w-[clamp(2rem,4vw,3.5rem)] rounded-md flex items-center justify-center"
        style={{ background: classColor ?? 'hsl(var(--muted))' }}
      >
        <Layers className="h-[clamp(1rem,2vw,1.75rem)] w-[clamp(1rem,2vw,1.75rem)] text-white" />
      </div>
      <div>
        <p className="text-[clamp(0.85rem,1.1vw,1.125rem)] font-semibold tabular-nums">
          {instanceCount.toLocaleString()}{' '}
          <span className="font-normal text-muted-foreground">
            {t('typesV2.viewer.instances')}
          </span>
        </p>
        <p className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground mt-0.5 tabular-nums">
          {t('typesV2.viewer.acrossTypes', { count: typeCount })}
        </p>
      </div>
      <p className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground/80 max-w-[28ch] leading-[1.45]">
        {t('typesV2.viewer.filteredEmptyHint', {
          ifcClass: ifcClass.replace(/^Ifc/, ''),
        })}
      </p>
    </div>
  );
}
