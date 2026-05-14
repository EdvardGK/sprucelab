import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { DashboardGrid, PageShell, type DashboardLayoutDefinition } from '@/components/Layout';
import {
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';
import { useModels } from '@/hooks/use-models';
import { useModelTypes, type IFCType } from '@/hooks/use-warehouse';

import { TypeBrowserHeaderV2 } from './TypeBrowserHeaderV2';
import { TypeBrowserFilterBarV2 } from './TypeBrowserFilterBarV2';
import { TypeKpiGrid } from './TypeKpiGrid';
import { TypeTreemap } from './TypeTreemap';
import { TypeTopBarList } from './TypeTopBarList';
import { buildClassColorMap } from './classColors';
import { TypeViewerPaneV2 } from './TypeViewerPaneV2';
import { TypeTableV2 } from './TypeTableV2';

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
  const [ifcClassFilter, setIfcClassFilter] = useState<string>('all');
  // Selection state: canonical `type_guid` lives in the project filter
  // provider (URL-serialised, shareable, cross-filter-composable — mirrors
  // Layer 1's floor_code). Null-guid types (rare; untyped/synthetic) fall
  // back to a local id-keyed state so they remain selectable in-session
  // but don't pollute the URL.
  const filterCtx = useProjectFilter();
  const { setTypeGuid } = useProjectFilterActions();
  const activeTypeGuid = filterCtx.type_guid?.[0] ?? null;
  const [localFallbackTypeId, setLocalFallbackTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId && models.length > 0) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  // Clear selection when filters change. Skip the initial mount run so a
  // URL-hydrated `?d=...type_guid=...` survives the first render — the
  // dependency tuple's initial values would otherwise wipe it before the
  // user ever interacts.
  const selectionResetMountedRef = useRef(false);
  useEffect(() => {
    if (!selectionResetMountedRef.current) {
      selectionResetMountedRef.current = true;
      return;
    }
    setTypeGuid(undefined);
    setLocalFallbackTypeId(null);
  }, [modelId, ifcClassFilter, searchQuery, setTypeGuid]);

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

  return (
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
                  types={filteredTypes}
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
                  onSelectType={handleSelectType}
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
