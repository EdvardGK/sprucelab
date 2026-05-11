import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { useModels } from '@/hooks/use-models';
import { useModelTypes, type IFCType } from '@/hooks/use-warehouse';

import { TypeBrowserHeaderV2 } from './TypeBrowserHeaderV2';
import { TypeBrowserFilterBarV2 } from './TypeBrowserFilterBarV2';
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
    // Clear type selection when the user switches models or filters.
    setSelectedTypeId(null);
  }, [modelId, ifcClassFilter, searchQuery]);

  const { data: types = [], isLoading: typesLoading } = useModelTypes(
    modelId ?? '',
    { enabled: !!modelId }
  );

  const stats = useMemo(() => {
    const ifcClasses = new Set<string>();
    let instances = 0;
    let missingClassification = 0;
    for (const type of types) {
      ifcClasses.add(type.ifc_type);
      instances += type.instance_count;
      if (!type.mapping?.ns3451_code) missingClassification += 1;
    }
    return {
      totalTypes: types.length,
      ifcClasses: ifcClasses.size,
      instances,
      missingClassification,
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
    <div className="h-full overflow-hidden flex flex-col gap-3 px-6 py-4">
      <TypeBrowserHeaderV2 stats={stats} loading={isLoading} />

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:h-[clamp(240px,32vh,320px)] flex-shrink-0">
            <TypeTreemap types={filteredTypes} />
            <TypeTopBarList types={filteredTypes} />
            <TypeViewerPaneV2
              modelId={modelId}
              selectedType={selectedType}
              onClearSelection={() => setSelectedTypeId(null)}
            />
          </div>

          <TypeTableV2
            types={filteredTypes}
            selectedTypeId={selectedTypeId}
            onSelectType={setSelectedTypeId}
            className="flex-1 min-h-0"
          />
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

