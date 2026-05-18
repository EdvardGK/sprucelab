import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { DashboardGrid, PageShell, type DashboardLayoutDefinition } from '@/components/Layout';
import {
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';
import { FilteredEmptyBanner } from '@/components/filters/FilteredEmptyBanner';
import { useModels } from '@/hooks/use-models';
import { useModelTypes, type IFCType } from '@/hooks/use-warehouse';
import {
  useCreateTypeMapping,
  useUpdateTypeMapping,
} from '@/hooks/use-type-mapping';
import { useToast } from '@/hooks/use-toast';
import { useResetFiltersOnModelChange } from '@/hooks/useResetFiltersOnModelChange';

import { TypeBrowserHeaderV2 } from './TypeBrowserHeaderV2';
import { TypeBrowserFilterBarV2 } from './TypeBrowserFilterBarV2';
import { TypeKpiGrid } from './TypeKpiGrid';
import { TypeTreemap } from './TypeTreemap';
import { TypeTopBarList } from './TypeTopBarList';
import { buildClassColorMap } from './classColors';
import { TypeViewerPaneV2 } from './TypeViewerPaneV2';
import { TypeTableV2 } from './TypeTableV2';

type MappingStatusUpdate = 'mapped' | 'followup' | 'ignored';

interface TypeBrowserV2Props {
  projectId: string;
}

// Below-the-fold grid: Top-10 (25%) + Table (75%).
const BELOW_LAYOUT: DashboardLayoutDefinition = {
  rows: 1,
  cols: 4,
  layout: [['top10', 'table', 'table', 'table']],
};

export function TypeBrowserV2({ projectId }: TypeBrowserV2Props) {
  const { t } = useTranslation();
  const { data: models = [], isLoading: modelsLoading } = useModels(projectId);

  const [modelId, setModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Cross-filter state lives in the project filter provider so URL +
  // cross-page state stay unified:
  //   - `ifc_class` — single-select adapter over the provider's
  //     multi-select array; Types-page UX treats `'all'` as the unset
  //     sentinel.
  //   - `type_guid` — canonical IFC GlobalId mirroring Layer 1's
  //     floor_code (with synth-hash fallback for proxy/userdef types).
  // A local id-keyed fallback handles the (currently unreachable) case
  // of truly null `type_guid` so untyped types stay selectable without
  // polluting the URL.
  const filterCtx = useProjectFilter();
  const { setIfcClass, setTypeGuid } = useProjectFilterActions();
  const ifcClassFilter = filterCtx.ifc_class?.[0] ?? 'all';
  const setIfcClassFilter = useCallback(
    (next: string | ((curr: string) => string)) => {
      const value =
        typeof next === 'function' ? (next as (c: string) => string)(ifcClassFilter) : next;
      setIfcClass(value === 'all' ? undefined : [value]);
    },
    [ifcClassFilter, setIfcClass]
  );
  const activeTypeGuid = filterCtx.type_guid?.[0] ?? null;
  const [localFallbackTypeId, setLocalFallbackTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId && models.length > 0) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  // Switching models nukes ALL cross-filter dimensions, not just the
  // type selection — a class/floor/ns3451 filter from model A is stale
  // on model B. Hook honours the `?d=` URL deeplink carve-out.
  useResetFiltersOnModelChange(modelId);

  // Targeted reset: when the user narrows the visible list via the
  // search box or the IFC-class chip, drop the type selection so the
  // viewer doesn't dangle on a hidden type. Other dimensions stay.
  // Skip the initial mount run so a URL-hydrated `?d=...type_guid=...`
  // survives the first render.
  const selectionResetMountedRef = useRef(false);
  useEffect(() => {
    if (!selectionResetMountedRef.current) {
      selectionResetMountedRef.current = true;
      return;
    }
    setTypeGuid(undefined);
    setLocalFallbackTypeId(null);
  }, [ifcClassFilter, searchQuery, setTypeGuid]);

  const {
    data: types = [],
    isLoading: typesLoading,
    dataUpdatedAt,
  } = useModelTypes(modelId ?? '', { enabled: !!modelId });

  // Compute the stats over an arbitrary slice of types so we can show
  // filtered numbers in the foreground and the unfiltered total in
  // parens behind them. Sparkline distributions always use the
  // unfiltered set so the macro vocabulary stays cohesive.
  const computeStats = (slice: IFCType[]) => {
    const ifcClasses = new Set<string>();
    let instances = 0;
    let untypedInstances = 0;
    let orphanTypes = 0;
    let missingClassification = 0;

    const typesByClass: Record<string, number> = {};
    const instancesByClass: Record<string, number> = {};
    const untypedByClass: Record<string, number> = {};
    const orphanByClass: Record<string, number> = {};
    const missingByClass: Record<string, number> = {};

    for (const type of slice) {
      ifcClasses.add(type.ifc_type);
      instances += type.instance_count;
      typesByClass[type.ifc_type] = (typesByClass[type.ifc_type] || 0) + 1;
      instancesByClass[type.ifc_type] =
        (instancesByClass[type.ifc_type] || 0) + type.instance_count;

      const isUntyped =
        type.type_guid === null ||
        /<untyped>/i.test(type.type_name) ||
        type.type_name.trim() === '';
      if (isUntyped) {
        untypedInstances += type.instance_count;
        untypedByClass[type.ifc_type] =
          (untypedByClass[type.ifc_type] || 0) + type.instance_count;
      }
      if (type.instance_count === 0) {
        orphanTypes += 1;
        orphanByClass[type.ifc_type] = (orphanByClass[type.ifc_type] || 0) + 1;
      }
      if (!type.mapping?.ns3451_code) {
        missingClassification += 1;
        missingByClass[type.ifc_type] =
          (missingByClass[type.ifc_type] || 0) + 1;
      }
    }
    const totalTypes = slice.length;
    return {
      totalTypes,
      ifcClasses: ifcClasses.size,
      instances,
      avgInstancesPerType: totalTypes > 0 ? instances / totalTypes : 0,
      untypedInstances,
      untypedPercent: instances > 0 ? (untypedInstances / instances) * 100 : 0,
      orphanTypes,
      orphanPercent: totalTypes > 0 ? (orphanTypes / totalTypes) * 100 : 0,
      missingClassification,
      missingPercent: totalTypes > 0 ? (missingClassification / totalTypes) * 100 : 0,
      typesByClass,
      instancesByClass,
      untypedByClass,
      orphanByClass,
      missingByClass,
    };
  };

  const filteredTypes = useMemo(() => {
    return filterTypesV2(types, { searchQuery, ifcClassFilter });
  }, [types, searchQuery, ifcClassFilter]);

  // Source-of-filter rule (PowerBI pattern): the surface that PRODUCES a
  // filter dimension must stay whole on its own dimension — only OTHER
  // surfaces narrow. The treemap and class-distribution sparklines produce
  // `ifc_class`, so they consume search-filtered (other dimension) but
  // class-unfiltered (own dimension) types. Without this split they would
  // collapse to a single tile the moment the user clicks one.
  const classUnfilteredTypes = useMemo(() => {
    return filterTypesV2(types, { searchQuery, ifcClassFilter: 'all' });
  }, [types, searchQuery]);

  const totalStats = useMemo(() => computeStats(types), [types]);
  // The filtered subset drives the foreground numbers; sparkline
  // distributions stay project-scoped (from totalStats) so the macro
  // vocabulary is consistent.
  const filteredStats = useMemo(() => computeStats(filteredTypes), [filteredTypes]);

  const isFiltered = ifcClassFilter !== 'all' || searchQuery.trim() !== '';

  // Stats actually rendered: filtered scalars + total distributions.
  const stats = useMemo(
    () => ({
      ...filteredStats,
      typesByClass: totalStats.typesByClass,
      instancesByClass: totalStats.instancesByClass,
      untypedByClass: totalStats.untypedByClass,
      orphanByClass: totalStats.orphanByClass,
      missingByClass: totalStats.missingByClass,
    }),
    [filteredStats, totalStats]
  );

  const uniqueIfcClasses = useMemo(() => {
    const set = new Set<string>();
    for (const type of types) set.add(type.ifc_type);
    return Array.from(set).sort();
  }, [types]);

  const selectedType = useMemo(() => {
    if (activeTypeGuid) {
      return filteredTypes.find((tp) => tp.type_guid === activeTypeGuid) ?? null;
    }
    if (localFallbackTypeId) {
      return filteredTypes.find((tp) => tp.id === localFallbackTypeId) ?? null;
    }
    return null;
  }, [filteredTypes, activeTypeGuid, localFallbackTypeId]);
  const selectedTypeId = selectedType?.id ?? null;

  const handleSelectType = useCallback(
    (typeId: string | null) => {
      if (typeId === null) {
        setTypeGuid(undefined);
        setLocalFallbackTypeId(null);
        return;
      }
      const candidate = filteredTypes.find((tp) => tp.id === typeId);
      if (!candidate) return;
      if (candidate.type_guid) {
        setTypeGuid([candidate.type_guid]);
        setLocalFallbackTypeId(null);
      } else {
        setTypeGuid(undefined);
        setLocalFallbackTypeId(typeId);
      }
    },
    [filteredTypes, setTypeGuid]
  );

  const handleToggleType = useCallback(
    (typeId: string) => {
      handleSelectType(selectedTypeId === typeId ? null : typeId);
    },
    [handleSelectType, selectedTypeId]
  );

  const handleClearSelection = useCallback(() => {
    handleSelectType(null);
  }, [handleSelectType]);

  // Shared ifcClass → color map: build from the unfiltered types so
  // colors stay stable as the user filters. The treemap, KPI sparklines,
  // and the table row stripe all consume this.
  const classColors = useMemo(() => buildClassColorMap(types), [types]);

  const isLoading = modelsLoading || (!!modelId && typesLoading);

  // --- Quick-action mutations + advance logic ----------------------------
  const toast = useToast();
  const updateMapping = useUpdateTypeMapping();
  const createMapping = useCreateTypeMapping();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const advanceToNext = useCallback(
    (currentTypeId: string) => {
      const idx = filteredTypes.findIndex((tp) => tp.id === currentTypeId);
      if (idx < 0) return;
      const next = filteredTypes[idx + 1];
      if (next) handleSelectType(next.id);
    },
    [filteredTypes, handleSelectType]
  );

  const setMappingStatus = useCallback(
    async (type: IFCType, status: MappingStatusUpdate, toastKey: string) => {
      try {
        if (type.mapping?.id) {
          await updateMapping.mutateAsync({
            mappingId: type.mapping.id,
            mapping_status: status,
          });
        } else {
          await createMapping.mutateAsync({
            ifc_type: type.id,
            mapping_status: status,
          });
        }
        toast.toast({ title: t(toastKey) });
        advanceToNext(type.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.toast({
          title: t('typesV2.shortcuts.saveError'),
          description: message,
          variant: 'destructive',
        });
      }
    },
    [updateMapping, createMapping, toast, t, advanceToNext]
  );

  const handleSaveType = useCallback(
    (type: IFCType) => setMappingStatus(type, 'mapped', 'typesV2.shortcuts.saved'),
    [setMappingStatus]
  );
  const handleFlagType = useCallback(
    (type: IFCType) => setMappingStatus(type, 'followup', 'typesV2.shortcuts.flagged'),
    [setMappingStatus]
  );
  const handleIgnoreType = useCallback(
    (type: IFCType) => setMappingStatus(type, 'ignored', 'typesV2.shortcuts.ignored'),
    [setMappingStatus]
  );

  // Bidirectional cross-filter (viewer → dashboard): when the user picks
  // an element inside the persistent viewer, drive the ifc_class dimension
  // from its element class. Same toggle-off semantics as the dashboard
  // tiles. Empty / Unknown selections do NOT clear the filter — explicit
  // clear lives on the dashboard chips and the Clear-all button.
  const handleElementSelect = useCallback(
    (el: import('@/components/features/viewer/ElementPropertiesPanel').ElementProperties | null) => {
      if (!el || !el.type || el.type === 'Unknown') return;
      // Element type arrives as "IfcWall" from v2 or "IFCWALL" from v3.
      // Normalize to PascalCase by stripping the IFC prefix then lowercasing
      // the remainder's tail; ifcClassFilter expects the prefixed PascalCase
      // ("IfcWall") form, matching uniqueIfcClasses.
      const stripped = el.type.replace(/^IFC/i, '');
      if (!stripped) return;
      const pascal = stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
      const targetClass = `Ifc${pascal}`;
      // Prefer the case from uniqueIfcClasses if it disagrees with our
      // PascalCase guess (handles classes like `IfcBeamStandardCase`).
      const match = uniqueIfcClasses.find(
        (c) => c.toLowerCase() === targetClass.toLowerCase(),
      ) ?? targetClass;
      setIfcClassFilter((curr) => (curr === match ? 'all' : match));
    },
    [setIfcClassFilter, uniqueIfcClasses],
  );

  const handleCopyGuid = useCallback(
    (type: IFCType) => {
      if (!type.type_guid || type.type_guid.startsWith('synth_')) return;
      navigator.clipboard.writeText(type.type_guid).then(
        () => toast.toast({ title: t('typesV2.rail.action.copyGuidSuccess') }),
        () => {
          /* clipboard denied — silently fail; rare in app context */
        }
      );
    },
    [toast, t]
  );

  const handleSaveNotes = useCallback(
    async (type: IFCType, notes: string) => {
      if (!type.mapping?.id) return;
      try {
        await updateMapping.mutateAsync({
          mappingId: type.mapping.id,
          notes,
        });
        toast.toast({ title: t('typesV2.rail.notes.saved') });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.toast({
          title: t('typesV2.shortcuts.saveError'),
          description: message,
          variant: 'destructive',
        });
      }
    },
    [updateMapping, toast, t]
  );

  // --- Keyboard handler --------------------------------------------------
  // Lifts the input-guard pattern from use-type-navigation.ts:132-176.
  // Window-scoped so keys fire regardless of which sub-component has
  // focus (table row, viewer canvas, treemap segment, etc).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          // Escape from a focused input is still allowed via the normal
          // browser behaviour; we don't want to swallow typing.
          return;
        }
      }

      // Fullscreen toggle works without a selected type.
      if ((e.shiftKey && (e.key === 'F' || e.key === 'f')) || e.key === 'F11') {
        e.preventDefault();
        setIsFullscreen((curr) => {
          const next = !curr;
          toast.toast({
            title: next
              ? t('typesV2.shortcuts.fullscreen')
              : t('typesV2.shortcuts.exitFullscreen'),
          });
          return next;
        });
        return;
      }

      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        setIsFullscreen(false);
        return;
      }

      // Arrow navigation always works when there's a list to walk.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (filteredTypes.length === 0) return;
        e.preventDefault();
        const currentIdx = selectedTypeId
          ? filteredTypes.findIndex((tp) => tp.id === selectedTypeId)
          : -1;
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx =
          currentIdx < 0
            ? direction === 1
              ? 0
              : filteredTypes.length - 1
            : Math.max(0, Math.min(filteredTypes.length - 1, currentIdx + direction));
        const target = filteredTypes[nextIdx];
        if (target) handleSelectType(target.id);
        return;
      }

      // Action keys need a selected type.
      const key = e.key.toLowerCase();
      if (key !== 'a' && key !== 'f' && key !== 'i') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (!selectedType) {
        e.preventDefault();
        toast.toast({ title: t('typesV2.shortcuts.noSelection') });
        return;
      }

      e.preventDefault();
      if (key === 'a') handleSaveType(selectedType);
      else if (key === 'f') handleFlagType(selectedType);
      else if (key === 'i') handleIgnoreType(selectedType);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filteredTypes,
    selectedTypeId,
    selectedType,
    isFullscreen,
    handleSelectType,
    handleSaveType,
    handleFlagType,
    handleIgnoreType,
    toast,
    t,
  ]);

  return (
    <>
    <PageShell
      title={t('typesV2.title')}
      subtitle={t('typesV2.subtitle')}
      headerRight={<TypeBrowserHeaderV2 loading={isLoading} dataUpdatedAt={dataUpdatedAt} />}
    >
      <TypeBrowserFilterBarV2
        models={models}
        modelId={modelId}
        onModelChange={setModelId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        ifcClassFilter={ifcClassFilter}
        onIfcClassChange={setIfcClassFilter}
        uniqueIfcClasses={uniqueIfcClasses}
        totalCount={types.length}
        filteredCount={filteredTypes.length}
      />

      <FilteredEmptyBanner
        filteredCount={filteredTypes.length}
        totalCount={types.length}
        noun={t('typesV2.filteredEmpty.noun')}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('typesV2.loading')}</span>
        </div>
      ) : !modelId ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          {t('typesV2.noModels')}
        </div>
      ) : (
        <>
          {/* Hero — KPI row + viz row.
              Viz row: Treemap + Viewer (50/50). The data rail lives
              INSIDE the viewer card as a sidebar/HUD — see
              TypeViewerPaneV2 internals.
              Hero ceiling tightened (1100px → 720px) so Top-10 + table
              sit above the fold on 1440×900 per the 40-30-20-10 rule. */}
          <div className="flex flex-col gap-[clamp(0.5rem,1vw,1rem)] h-[clamp(420px,calc(100vh-22rem),720px)]">
            <div className="flex-[1_1_28%] min-h-0">
              <TypeKpiGrid
                stats={stats}
                totalStats={isFiltered ? totalStats : undefined}
                loading={isLoading}
                classColors={classColors}
                activeIfcClass={ifcClassFilter}
              />
            </div>
            <div className="flex-[2_1_72%] min-h-0 grid grid-cols-1 md:grid-cols-2 gap-[clamp(0.5rem,1vw,1rem)]">
              <div className="min-h-0">
                <TypeTreemap
                  types={classUnfilteredTypes}
                  activeIfcClass={ifcClassFilter}
                  classColors={classColors}
                  onClassClick={(cls) =>
                    setIfcClassFilter((curr) => (curr === cls ? 'all' : cls))
                  }
                />
              </div>
              <div className="min-h-0">
                <TypeViewerPaneV2
                  modelId={modelId}
                  selectedType={selectedType}
                  activeIfcClass={ifcClassFilter}
                  filteredTypeCount={filteredTypes.length}
                  filteredInstanceCount={filteredStats.instances}
                  classColor={
                    ifcClassFilter !== 'all'
                      ? classColors.get(ifcClassFilter)
                      : undefined
                  }
                  onClearSelection={handleClearSelection}
                  onElementSelect={handleElementSelect}
                  onSave={handleSaveType}
                  onFlag={handleFlagType}
                  onIgnore={handleIgnoreType}
                  onCopyGuid={handleCopyGuid}
                  onSaveNotes={handleSaveNotes}
                />
              </div>
            </div>
          </div>

          {/* Below the fold — Top-10 + Table. Scroll for it. */}
          <div className="h-[clamp(420px,55vh,720px)]">
            <DashboardGrid layout={BELOW_LAYOUT}>
              <div id="top10">
                <TypeTopBarList
                  types={filteredTypes}
                  topN={10}
                  fillHeight
                  selectedTypeId={selectedTypeId}
                  onTypeClick={handleToggleType}
                />
              </div>
              <div id="table">
                <TypeTableV2
                  types={filteredTypes}
                  selectedTypeId={selectedTypeId}
                  onSelectType={handleToggleType}
                  onIfcClassClick={(cls) =>
                    setIfcClassFilter((curr) => (curr === cls ? 'all' : cls))
                  }
                  activeIfcClass={ifcClassFilter}
                  classColors={classColors}
                  onClearFilters={() => {
                    setIfcClassFilter('all');
                    setSearchQuery('');
                  }}
                  className="h-full"
                />
              </div>
            </DashboardGrid>
          </div>
        </>
      )}
    </PageShell>
    {isFullscreen && modelId && (
      <div
        className="fixed inset-0 z-50 bg-background p-2 flex"
        role="dialog"
        aria-modal="true"
        aria-label={t('typesV2.shortcuts.fullscreen')}
      >
        <TypeViewerPaneV2
          modelId={modelId}
          selectedType={selectedType}
          activeIfcClass={ifcClassFilter}
          filteredTypeCount={filteredTypes.length}
          filteredInstanceCount={filteredStats.instances}
          classColor={
            ifcClassFilter !== 'all'
              ? classColors.get(ifcClassFilter)
              : undefined
          }
          onClearSelection={handleClearSelection}
          onElementSelect={handleElementSelect}
          onSave={handleSaveType}
          onFlag={handleFlagType}
          onIgnore={handleIgnoreType}
          onCopyGuid={handleCopyGuid}
          onSaveNotes={handleSaveNotes}
        />
      </div>
    )}
    </>
  );
}

function filterTypesV2(
  types: IFCType[],
  filters: { searchQuery: string; ifcClassFilter: string }
): IFCType[] {
  const q = filters.searchQuery.trim().toLowerCase();
  return types.filter((type) => {
    if (q) {
      if (
        !type.type_name.toLowerCase().includes(q) &&
        !type.ifc_type.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filters.ifcClassFilter !== 'all' && type.ifc_type !== filters.ifcClassFilter) {
      return false;
    }
    return true;
  });
}
