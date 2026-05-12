import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, X, Filter } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { InlineViewer } from '@/components/features/viewer/InlineViewer';
import { UnifiedBIMViewer } from '@/components/features/viewer/UnifiedBIMViewer';
import type { IFCType } from '@/hooks/use-warehouse';

import { TypeDataRail } from './TypeDataRail';

interface TypeViewerPaneV2Props {
  modelId: string;
  /** All types in the active model (unfiltered). Used to build the
      typeVisibility map for UnifiedBIMViewer. */
  types: IFCType[];
  selectedType: IFCType | null;
  /** Active IFC class filter (or 'all'). When set and no type is selected,
      UnifiedBIMViewer isolates that class. */
  activeIfcClass?: string;
  filteredTypeCount?: number;
  filteredInstanceCount?: number;
  /** Shared class→color map from buildClassColorMap. */
  classColors?: Map<string, string>;
  onClearSelection: () => void;
}

/**
 * Convert our `ifcClass → color` Map (keyed by IFC TYPE class, e.g.,
 * IfcWallType) into the format UnifiedBIMViewer expects (keyed by the
 * INSTANCE class, e.g., IfcWall, plus the bare class name).
 *
 * The viewer's type discovery surfaces instance entity classes
 * (IfcWall, IfcSlab) — type-class names like IfcWallType only appear on
 * the model upload side, not at runtime in the loaded fragments.
 */
function classColorMapForViewer(classColors: Map<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [typeClass, hex] of classColors.entries()) {
    const entity = typeClass.replace(/Type$/, '').replace(/Style$/, '');
    map[entity] = hex; // 'IfcWall'
    map[entity.replace(/^Ifc/, '')] = hex; // 'Wall'
  }
  return map;
}

/**
 * Build typeVisibility for UnifiedBIMViewer.
 *
 * - When `activeIfcClass === 'all'`: omit/return empty → all classes
 *   visible (viewer default).
 * - When `activeIfcClass` is set (e.g., 'IfcWallType'): build a
 *   complete map with all known entity classes flipped to false except
 *   the filtered class's entity (e.g., 'IfcWall' = true).
 */
function buildTypeVisibility(
  types: IFCType[],
  activeIfcClass: string
): Record<string, boolean> | undefined {
  if (activeIfcClass === 'all') return undefined;

  const entityClasses = new Set<string>();
  for (const t of types) {
    entityClasses.add(t.ifc_type.replace(/Type$/, '').replace(/Style$/, ''));
  }
  const filteredEntity = activeIfcClass.replace(/Type$/, '').replace(/Style$/, '');

  const map: Record<string, boolean> = {};
  for (const cls of entityClasses) {
    map[cls] = cls === filteredEntity;
    // Some viewers index by bare class too — set both to be safe.
    map[cls.replace(/^Ifc/, '')] = cls === filteredEntity;
  }
  return map;
}

export function TypeViewerPaneV2({
  modelId,
  types,
  selectedType,
  activeIfcClass = 'all',
  filteredTypeCount = 0,
  filteredInstanceCount = 0,
  classColors,
  onClearSelection,
}: TypeViewerPaneV2Props) {
  const { t } = useTranslation();
  const isClassFiltered = activeIfcClass !== 'all' && !selectedType;
  const titleText = selectedType
    ? selectedType.type_name || t('typesV2.table.unnamed')
    : isClassFiltered
      ? activeIfcClass.replace(/^Ifc/, '')
      : t('typesV2.viewer.empty');

  const viewerClassColorMap = useMemo(
    () => (classColors ? classColorMapForViewer(classColors) : undefined),
    [classColors]
  );
  const typeVisibility = useMemo(
    () => buildTypeVisibility(types, activeIfcClass),
    [types, activeIfcClass]
  );
  const filteredClassColor =
    activeIfcClass !== 'all' ? classColors?.get(activeIfcClass) : undefined;

  return (
    <DashboardTile id="viewer-pane" className="p-0 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-[clamp(0.5rem,1vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-[clamp(0.375rem,0.5vw,0.625rem)] min-w-0">
          {isClassFiltered ? (
            <Filter
              className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] shrink-0"
              style={{ color: filteredClassColor ?? 'currentColor' }}
            />
          ) : (
            <Box className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] text-muted-foreground shrink-0" />
          )}
          <h2 className="text-[clamp(0.7rem,0.9vw,0.95rem)] font-medium truncate">
            {titleText}
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

      {/* Body: viewer canvas (full-bleed) + glass-HUD data rail overlay. */}
      <div className="flex-1 min-h-0 relative bg-black/5">
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
        ) : (
          <UnifiedBIMViewer
            key={`v2-pane-${modelId}`}
            modelId={modelId}
            showPropertiesPanel={false}
            showModelInfo={false}
            showControls={false}
            classColorMap={viewerClassColorMap}
            typeVisibility={typeVisibility}
          />
        )}

        {/* Glass HUD overlay — viewer-companion data rail. */}
        <aside
          className="absolute top-[clamp(0.5rem,1vh,0.875rem)] right-[clamp(0.5rem,1vh,0.875rem)] bottom-[clamp(0.5rem,1vh,0.875rem)] w-[clamp(220px,16vw,300px)] bg-card/85 backdrop-blur-md border border-border/40 rounded-lg shadow-lg overflow-y-auto z-10"
          aria-label={t('typesV2.rail.ariaLabel')}
        >
          <TypeDataRail
            selectedType={selectedType}
            activeIfcClass={activeIfcClass}
            filteredTypeCount={filteredTypeCount}
            filteredInstanceCount={filteredInstanceCount}
            classColor={filteredClassColor}
          />
        </aside>
      </div>
    </DashboardTile>
  );
}
