import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { DashboardGrid, type DashboardLayoutDefinition } from '@/components/Layout';
import { useModels } from '@/hooks/use-models';
import { useModelTypes, type IFCType } from '@/hooks/use-warehouse';

import { TypeBrowserHeaderV2 } from './TypeBrowserHeaderV2';
import { TypeBrowserFilterBarV2 } from './TypeBrowserFilterBarV2';
import { TypeKpiGrid } from './TypeKpiGrid';
import { TypeTreemap } from './TypeTreemap';
import { TypeTopBarList } from './TypeTopBarList';
import { buildClassColorMap } from './classColors';
import { TypeViewerPaneV2 } from './TypeViewerPaneV2';
import { TypeDetailPanelV2 } from './TypeDetailPanelV2';
import { TypeTableV2 } from './TypeTableV2';

interface TypeBrowserV2Props {
  projectId: string;
}

// Hero grid: KPI strip (1 row) + Treemap | Viewer (2 rows each, side by side).
// Per design guide: 4 cols, equal-height rows via DashboardGrid.
const HERO_LAYOUT: DashboardLayoutDefinition = {
  rows: 3,
  cols: 4,
  layout: [
    ['kpis', 'kpis', 'kpis', 'kpis'],
    ['treemap', 'treemap', 'viewer', 'viewer'],
    ['treemap', 'treemap', 'viewer', 'viewer'],
  ],
};

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
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId && models.length > 0) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  useEffect(() => {
    setSelectedTypeId(null);
  }, [modelId, ifcClassFilter, searchQuery]);

  const {
    data: types = [],
    isLoading: typesLoading,
    dataUpdatedAt,
  } = useModelTypes(modelId ?? '', { enabled: !!modelId });

  const stats = useMemo(() => {
    const ifcClasses = new Set<string>();
    let instances = 0;
    let untypedInstances = 0;
    let orphanTypes = 0;
    let missingClassification = 0;

    // Per-IFC-class distributions for sparklines.
    const typesByClass: Record<string, number> = {};
    const instancesByClass: Record<string, number> = {};
    const untypedByClass: Record<string, number> = {};
    const orphanByClass: Record<string, number> = {};
    const missingByClass: Record<string, number> = {};

    for (const type of types) {
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
    const totalTypes = types.length;
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
      // Distributions
      typesByClass,
      instancesByClass,
      untypedByClass,
      orphanByClass,
      missingByClass,
    };
  }, [types]);

  const filteredTypes = useMemo(() => {
    return filterTypesV2(types, { searchQuery, ifcClassFilter });
  }, [types, searchQuery, ifcClassFilter]);

  const uniqueIfcClasses = useMemo(() => {
    const set = new Set<string>();
    for (const type of types) set.add(type.ifc_type);
    return Array.from(set).sort();
  }, [types]);

  const selectedType = useMemo(
    () => filteredTypes.find((tp) => tp.id === selectedTypeId) ?? null,
    [filteredTypes, selectedTypeId]
  );

  // Shared ifcClass → color map: build from the unfiltered types so
  // colors stay stable as the user filters. The treemap, KPI sparklines,
  // and the table row stripe all consume this.
  const classColors = useMemo(() => buildClassColorMap(types), [types]);

  const isLoading = modelsLoading || (!!modelId && typesLoading);

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,1vh,1rem)] px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.75rem,1.5vh,1.25rem)]">
      {/* Signature gradient accent — skiplum-reports pattern */}
      <div
        className="h-[3px] w-full rounded-full bg-gradient-to-r from-[#D0D34D] via-[#157954] to-[#21263A]"
        aria-hidden="true"
      />
      <TypeBrowserHeaderV2 loading={isLoading} dataUpdatedAt={dataUpdatedAt} />

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
          {/* Hero — KPIs (1/3 height) + Treemap | Viewer (2/3 height, 50/50).
              Bounded so the main components fit the viewport on first paint. */}
          <div className="h-[clamp(560px,calc(100vh-14rem),1100px)]">
            <DashboardGrid layout={HERO_LAYOUT}>
              <div id="kpis">
                <TypeKpiGrid stats={stats} loading={isLoading} classColors={classColors} />
              </div>
              <div id="treemap">
                <TypeTreemap
                  types={filteredTypes}
                  activeIfcClass={ifcClassFilter}
                  classColors={classColors}
                  onClassClick={(cls) =>
                    setIfcClassFilter((curr) => (curr === cls ? 'all' : cls))
                  }
                />
              </div>
              <div id="viewer">
                <TypeViewerPaneV2
                  modelId={modelId}
                  selectedType={selectedType}
                  onClearSelection={() => setSelectedTypeId(null)}
                />
              </div>
            </DashboardGrid>
          </div>

          {/* Optional detail panel — only when a type is selected */}
          {selectedType && (
            <div className="min-h-[clamp(320px,40vh,540px)]">
              <TypeDetailPanelV2
                type={selectedType}
                onClose={() => setSelectedTypeId(null)}
                className="h-full"
              />
            </div>
          )}

          {/* Below the fold — Top-10 + Table. Scroll for it. */}
          <div className="h-[clamp(420px,55vh,720px)]">
            <DashboardGrid layout={BELOW_LAYOUT}>
              <div id="top10">
                <TypeTopBarList
                  types={filteredTypes}
                  topN={10}
                  fillHeight
                  selectedTypeId={selectedTypeId}
                  onTypeClick={(id) =>
                    setSelectedTypeId((curr) => (curr === id ? null : id))
                  }
                />
              </div>
              <div id="table">
                <TypeTableV2
                  types={filteredTypes}
                  selectedTypeId={selectedTypeId}
                  onSelectType={setSelectedTypeId}
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
    </div>
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
