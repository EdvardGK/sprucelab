import { useTranslation } from 'react-i18next';
import { Box, X, Filter, HelpCircle } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { InlineViewer } from '@/components/features/viewer/InlineViewer';
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
 * Viewer card body: viewer canvas (flex-1) + permanent thin data rail
 * (fixed width) as a flex sibling. The rail is always visible and acts
 * as a supporting panel for the viewer.
 *
 * Class-filtered isolation (no single type selected, class filter active)
 * uses `useTypesInstancesByClass` to union instance GUIDs across every
 * matching type, then passes them to InlineViewer via the
 * `guidsOverride` prop. This is the frontend-only Bug 1 workaround
 * pending a backend `entity_ifc_type` field on IFCType. See audit §4
 * and `data-extraction-vs-fragments-runtime-mismatch.md`.
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

  // Class-level isolation: when a class filter is active and no single
  // type is selected, collect the instance GUIDs for every type in that
  // class and pass them to InlineViewer as guidsOverride. Bug 1 fix.
  const { guids: classGuids, isLoading: classGuidsLoading } =
    useTypesInstancesByClass(
      isClassFiltered ? modelId : null,
      isClassFiltered ? activeIfcClass : null,
    );
  const titleText = selectedType
    ? selectedType.type_name || t('typesV2.table.unnamed')
    : isClassFiltered
      ? activeIfcClass.replace(/^Ifc/, '')
      : t('typesV2.viewer.empty');

  return (
    <DashboardTile id="viewer-pane" className="p-0 flex flex-col h-full overflow-hidden">
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

      {/* Body: viewer canvas (flex-1) + permanent data rail (fixed width). */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          {selectedType ? (
            selectedType.type_guid ? (
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
              <UntypedState
                type={selectedType}
                onClear={onClearSelection}
              />
            )
          ) : isClassFiltered ? (
            <InlineViewer
              key={`class:${activeIfcClass}`}
              modelId={modelId}
              typeId={null}
              guidsOverride={classGuids}
              guidsOverrideLoading={classGuidsLoading}
              className="h-full w-full"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-[clamp(0.375rem,0.6vh,0.75rem)] px-[clamp(0.75rem,1.5vw,1.5rem)] text-center">
              <Box className="h-[clamp(1.5rem,3vw,3rem)] w-[clamp(1.5rem,3vw,3rem)] opacity-30" />
              <p className="text-[clamp(0.65rem,0.85vw,0.9rem)]">{t('typesV2.viewer.hint')}</p>
            </div>
          )}
        </div>

        <div className="w-[clamp(280px,22vw,420px)] shrink-0 border-l border-border/60 overflow-y-auto bg-muted/10">
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
        </div>
      </div>
    </DashboardTile>
  );
}

function UntypedState({
  type,
  onClear,
}: {
  type: IFCType;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const entityClass = type.ifc_type
    .replace(/::<untyped>$/i, '')
    .replace(/^Ifc/, '');
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-[clamp(0.75rem,1.5vw,1.5rem)] gap-[clamp(0.5rem,1vh,1rem)]">
      <div className="h-[clamp(2rem,4vw,3.5rem)] w-[clamp(2rem,4vw,3.5rem)] rounded-md flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
        <HelpCircle className="h-[clamp(1rem,2vw,1.75rem)] w-[clamp(1rem,2vw,1.75rem)] text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <p className="text-[clamp(0.85rem,1.1vw,1.125rem)] font-semibold">
          {t('typesV2.viewer.untypedTitle', { ifcClass: entityClass })}
        </p>
        <p className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground mt-0.5 tabular-nums">
          {type.instance_count.toLocaleString()} {t('typesV2.viewer.instances')}
        </p>
      </div>
      <p className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground/80 max-w-[34ch] leading-[1.5]">
        {t('typesV2.viewer.untypedExplain')}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        className="text-[clamp(0.65rem,0.8vw,0.85rem)]"
      >
        {t('typesV2.viewer.untypedDismiss')}
      </Button>
    </div>
  );
}

