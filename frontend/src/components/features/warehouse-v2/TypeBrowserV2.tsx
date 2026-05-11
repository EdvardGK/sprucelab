import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { useModels } from '@/hooks/use-models';
import { useModelTypes, type IFCType } from '@/hooks/use-warehouse';

import { TypeBrowserHeaderV2 } from './TypeBrowserHeaderV2';
import { TypeBrowserFilterBarV2 } from './TypeBrowserFilterBarV2';
import { TypeKpiGrid } from './TypeKpiGrid';
import { TypeTreemap } from './TypeTreemap';
import { TypeTopBarList } from './TypeTopBarList';
import { TypeViewerPaneV2 } from './TypeViewerPaneV2';
import { TypeTableV2 } from './TypeTableV2';

interface TypeBrowserV2Props {
  projectId: string;
}

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

  const { data: types = [], isLoading: typesLoading } = useModelTypes(
    modelId ?? '',
    { enabled: !!modelId }
  );

  const stats = useMemo(() => {
    const ifcClasses = new Set<string>();
    let instances = 0;
    let untypedInstances = 0;
    let orphanTypes = 0;
    let missingClassification = 0;
    for (const type of types) {
      ifcClasses.add(type.ifc_type);
      instances += type.instance_count;
      const isUntyped =
        type.type_guid === null ||
        /<untyped>/i.test(type.type_name) ||
        type.type_name.trim() === '';
      if (isUntyped) untypedInstances += type.instance_count;
      if (type.instance_count === 0) orphanTypes += 1;
      if (!type.mapping?.ns3451_code) missingClassification += 1;
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

  const isLoading = modelsLoading || (!!modelId && typesLoading);

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <TypeBrowserHeaderV2 loading={isLoading} />

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
          {/* Row 1: KPI cards full width (with callout traffic lights) */}
          <div className="h-[220px]">
            <TypeKpiGrid stats={stats} loading={isLoading} />
          </div>

          {/* Row 2: Treemap (square) + Viewer (4:3), each at 50% width */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="aspect-square">
              <TypeTreemap types={filteredTypes} />
            </div>
            <div className="aspect-[4/3]">
              <TypeViewerPaneV2
                modelId={modelId}
                selectedType={selectedType}
                onClearSelection={() => setSelectedTypeId(null)}
              />
            </div>
          </div>

          {/* Row 3: Top-10 bar chart (25%) + Table (75%) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[640px]">
            <div className="md:col-span-1 min-h-0">
              <TypeTopBarList types={filteredTypes} topN={10} fillHeight />
            </div>
            <div className="md:col-span-3 min-h-0">
              <TypeTableV2
                types={filteredTypes}
                selectedTypeId={selectedTypeId}
                onSelectType={setSelectedTypeId}
                className="h-full"
              />
            </div>
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
