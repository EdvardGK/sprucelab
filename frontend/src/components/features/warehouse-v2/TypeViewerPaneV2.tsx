import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Filter } from 'lucide-react';

import {
  UnifiedBIMViewer,
  type IsolationConfig,
} from '@/components/features/viewer/UnifiedBIMViewer';
import { ViewerPane } from '@/components/features/viewer/ViewerPane';
import { useTypeInstances } from '@/hooks/use-type-mapping';
import { useTypesInstancesByClass, type IFCType } from '@/hooks/use-warehouse';

import { TypeDataRail } from './TypeDataRail';

interface TypeViewerPaneV2Props {
  modelId: string;
  selectedType: IFCType | null;
  /** Active IFC class filter (or 'all'). */
  activeIfcClass?: string;
  filteredTypeCount?: number;
  filteredInstanceCount?: number;
  /** Color of the filtered class in the shared class-color map. */
  classColor?: string;
  onClearSelection: () => void;
  /** Quick-action handlers passed through to TypeDataRail. */
  onSave?: (type: IFCType) => void;
  onFlag?: (type: IFCType) => void;
  onIgnore?: (type: IFCType) => void;
  onCopyGuid?: (type: IFCType) => void;
  onSaveNotes?: (type: IFCType, notes: string) => void;
}

/**
 * Persistent 3D viewer for the Type page. UnifiedBIMViewer mounts once
 * per model and stays mounted across selection / class-filter changes;
 * the `isolation` prop is recomputed from state instead of remounting.
 *
 *   - selected type        → isolate to that type's instance GUIDs
 *   - active class filter  → isolate to the class's union of GUIDs
 *   - neither              → no isolation, full model visible
 *
 * Selections and filter clicks no longer trigger a full fragments reload —
 * the viewer hot-swaps its hider state. The HUD-style single-instance
 * preview that the old InlineViewer branch provided lives on in the
 * dedicated workbench / library surfaces (`TypeMappingWorkspace`,
 * `TypeBrowserListView`, `TypeLibraryView`); the Type-page dashboard
 * favors coordination context over single-instance framing.
 */
export function TypeViewerPaneV2({
  modelId,
  selectedType,
  activeIfcClass = 'all',
  filteredTypeCount = 0,
  filteredInstanceCount = 0,
  classColor,
  onClearSelection,
  onSave,
  onFlag,
  onIgnore,
  onCopyGuid,
  onSaveNotes,
}: TypeViewerPaneV2Props) {
  const { t } = useTranslation();
  const isClassFiltered = activeIfcClass !== 'all' && !selectedType;

  // GUID set for a single selected type. High limit so the isolation
  // covers every instance — types with many copies (Revit walls,
  // repetitive doors) easily blow past the default 100.
  const { data: typeInstances } = useTypeInstances(selectedType?.id ?? null, {
    limit: 100000,
    enabled: !!selectedType?.id,
  });

  // GUID set for an active class filter (no single type selected).
  const { guids: classGuids } = useTypesInstancesByClass(
    isClassFiltered ? modelId : null,
    isClassFiltered ? activeIfcClass : null,
  );

  const isolation = useMemo<IsolationConfig | null>(() => {
    if (selectedType && typeInstances?.instances?.length) {
      return {
        guids: typeInstances.instances.map((i) => i.ifc_guid),
        mode: 'all',
        zoomOnChange: true,
      };
    }
    if (isClassFiltered && classGuids.length > 0) {
      return { guids: classGuids, mode: 'all', zoomOnChange: true };
    }
    return null;
  }, [selectedType, typeInstances, isClassFiltered, classGuids]);

  const titleText = selectedType
    ? selectedType.type_name || t('typesV2.table.unnamed')
    : isClassFiltered
      ? activeIfcClass.replace(/^Ifc/, '')
      : t('typesV2.viewer.empty');

  const headerIcon = isClassFiltered ? (
    <Filter
      className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)]"
      style={{ color: classColor ?? 'currentColor' }}
    />
  ) : (
    <Box className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] text-muted-foreground" />
  );

  const subtitle = isClassFiltered
    ? t('typesV2.viewer.filteredHint', {
        types: filteredTypeCount,
        instances: filteredInstanceCount,
      })
    : undefined;

  const showClear = !!selectedType || isClassFiltered;

  return (
    <ViewerPane
      id="viewer-pane"
      title={titleText}
      icon={headerIcon}
      subtitle={subtitle}
      onClear={showClear ? onClearSelection : undefined}
      clearTitle={t('typesV2.viewer.clear')}
      rail={
        <TypeDataRail
          selectedType={selectedType}
          activeIfcClass={activeIfcClass}
          filteredTypeCount={filteredTypeCount}
          filteredInstanceCount={filteredInstanceCount}
          classColor={classColor}
          onSave={onSave}
          onFlag={onFlag}
          onIgnore={onIgnore}
          onCopyGuid={onCopyGuid}
          onSaveNotes={onSaveNotes}
        />
      }
      railSide="right"
    >
      <UnifiedBIMViewer
        modelId={modelId}
        isolation={isolation}
        showPropertiesPanel={false}
        showModelInfo={false}
        showControls={false}
        showFilterHUD={false}
      />
    </ViewerPane>
  );
}
