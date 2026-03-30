import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Wrench,
  Layers,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useModels } from '@/hooks/use-models';
import {
  useModelTypes,
  useTypeMappingSummary,
  type IFCType,
} from '@/hooks/use-warehouse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TypeStatusBadge, type MappingStatus } from '../shared/TypeStatusBadge';
import { TypeInstanceViewer } from '../TypeInstanceViewer';
import { cn } from '@/lib/utils';

interface TypeLibraryViewProps {
  projectId: string;
  initialModelId?: string;
}

export function TypeLibraryView({ projectId, initialModelId }: TypeLibraryViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // View mode: single model or project-wide
  const [scopeMode, setScopeMode] = useState<'model' | 'project'>('model');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(initialModelId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ifcTypeFilter, setIfcTypeFilter] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());

  // Fetch models for the project
  const { data: models = [], isLoading: modelsLoading } = useModels(projectId);

  // Fetch types for the selected model
  const { data: types = [], isLoading: typesLoading } = useModelTypes(
    selectedModelId || '',
    { enabled: !!selectedModelId && scopeMode === 'model' }
  );

  // Fetch mapping summary
  const { data: summary } = useTypeMappingSummary(selectedModelId || '');

  // Get unique IFC types for filter dropdown
  const uniqueIfcTypes = useMemo(() => {
    const typeSet = new Set(types.map((t) => t.ifc_type));
    return Array.from(typeSet).sort();
  }, [types]);

  // Filter types based on search and filters
  const filteredTypes = useMemo(() => {
    return types.filter((type) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !type.type_name.toLowerCase().includes(query) &&
          !type.ifc_type.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all') {
        const mappingStatus = type.mapping?.mapping_status || 'pending';
        if (statusFilter === 'unmapped') {
          if (type.mapping) return false;
        } else if (mappingStatus !== statusFilter) {
          return false;
        }
      }

      // IFC type filter
      if (ifcTypeFilter !== 'all' && type.ifc_type !== ifcTypeFilter) {
        return false;
      }

      return true;
    });
  }, [types, searchQuery, statusFilter, ifcTypeFilter]);

  // Group types by IFC class
  const groupedTypes = useMemo(() => {
    const groups: Record<string, IFCType[]> = {};
    filteredTypes.forEach((type) => {
      if (!groups[type.ifc_type]) {
        groups[type.ifc_type] = [];
      }
      groups[type.ifc_type].push(type);
    });
    return groups;
  }, [filteredTypes]);

  const toggleGroup = (ifcType: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ifcType)) {
        next.delete(ifcType);
      } else {
        next.add(ifcType);
      }
      return next;
    });
  };

  // Toggle type selection for batch operations
  const toggleTypeSelection = (typeId: string) => {
    setSelectedTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
      }
      return next;
    });
  };

  // Navigate to workbench with selected types
  const openInWorkbench = () => {
    const typeIds = selectedTypeIds.size > 0
      ? Array.from(selectedTypeIds)
      : selectedTypeId
        ? [selectedTypeId]
        : [];

    if (typeIds.length === 0) {
      // Just navigate to workbench without pre-selection
      navigate(`/projects/${projectId}/workbench?view=classify`);
      return;
    }

    // Navigate with selected type(s)
    const params = new URLSearchParams({
      view: 'classify',
      ...(selectedModelId && { model: selectedModelId }),
      types: typeIds.join(','),
    });
    navigate(`/projects/${projectId}/workbench?${params.toString()}`);
  };

  // Auto-select first model if none selected
  if (!selectedModelId && models.length > 0 && scopeMode === 'model') {
    const readyModel = models.find((m) => m.status === 'ready');
    if (readyModel) {
      setSelectedModelId(readyModel.id);
    }
  }

  if (modelsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary">{t('common.loadingModels')}</div>
      </div>
    );
  }

  const hasSelection = selectedTypeIds.size > 0 || selectedTypeId;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header Bar */}
      <div className="flex-none flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
        {/* Scope Toggle */}
        <div className="flex items-center gap-2 mr-4">
          <button
            onClick={() => setScopeMode('model')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
              scopeMode === 'model'
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <ToggleLeft className="h-4 w-4" />
            {t('typeLibrary.singleModel')}
          </button>
          <button
            onClick={() => setScopeMode('project')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
              scopeMode === 'project'
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <ToggleRight className="h-4 w-4" />
            {t('typeLibrary.projectWide')}
          </button>
        </div>

        {/* Model Selector (only in model scope) */}
        {scopeMode === 'model' && (
          <Select
            value={selectedModelId || ''}
            onValueChange={(value) => setSelectedModelId(value)}
          >
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue placeholder={t('typeMapping.selectModel')} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={model.status !== 'ready'}
                >
                  {model.name} (v{model.version_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Summary Stats */}
        {summary && (
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary" className="font-normal">
              {summary.total} {t('common.types')}
            </Badge>
            <span className="text-muted-foreground">
              {summary.mapped} {t('status.mapped')} · {summary.pending} {t('status.pending')}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Open in Workbench Action */}
        <Button
          onClick={openInWorkbench}
          size="sm"
          className="gap-2"
        >
          <Wrench className="h-4 w-4" />
          {hasSelection
            ? t('typeLibrary.classifySelected', { count: selectedTypeIds.size || 1 })
            : t('typeLibrary.openWorkbench')}
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex-none flex items-center gap-3 px-4 py-2 border-b bg-muted/10">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('typeMapping.searchTypes')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8"
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('typeMapping.allStatus')}</SelectItem>
            <SelectItem value="unmapped">{t('typeMapping.unmapped')}</SelectItem>
            <SelectItem value="pending">{t('status.pending')}</SelectItem>
            <SelectItem value="mapped">{t('status.mapped')}</SelectItem>
            <SelectItem value="ignored">{t('status.ignored')}</SelectItem>
            <SelectItem value="review">{t('status.review')}</SelectItem>
          </SelectContent>
        </Select>

        {/* IFC Type Filter */}
        <Select value={ifcTypeFilter} onValueChange={setIfcTypeFilter}>
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder={t('typeMapping.ifcClass')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('typeMapping.allIfcClasses')}</SelectItem>
            {uniqueIfcTypes.map((ifcType) => (
              <SelectItem key={ifcType} value={ifcType}>
                {ifcType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Selection Info */}
        {selectedTypeIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {selectedTypeIds.size} {t('common.selected')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTypeIds(new Set())}
              className="h-7 px-2"
            >
              {t('common.clearSelection')}
            </Button>
          </div>
        )}
      </div>

      {/* Main Content - 2-column layout */}
      <div className="flex-1 grid grid-cols-[1fr_minmax(420px,_2fr)] min-h-0 overflow-hidden">
        {/* Type List - Left Column (scrollable full height) */}
        <div className="flex flex-col min-w-0 border-r overflow-hidden">
          {scopeMode === 'project' ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('typeLibrary.projectWideComingSoon')}
            </div>
          ) : typesLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-text-secondary">{t('typeMapping.loadingTypes')}</div>
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Layers className="h-12 w-12 text-text-tertiary mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {t('typeMapping.noTypesFound')}
              </h3>
              <p className="text-text-secondary">
                {types.length === 0
                  ? t('typeMapping.noTypeDefinitions')
                  : t('typeMapping.noMatchFilters')}
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {Object.entries(groupedTypes).map(([ifcType, typeList]) => (
                  <TypeGroupReadOnly
                    key={ifcType}
                    ifcType={ifcType}
                    types={typeList}
                    isExpanded={expandedGroups.has(ifcType)}
                    onToggle={() => toggleGroup(ifcType)}
                    selectedTypeId={selectedTypeId}
                    selectedTypeIds={selectedTypeIds}
                    onSelectType={setSelectedTypeId}
                    onToggleTypeSelection={toggleTypeSelection}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Instance Viewer - Right Column (proportional, aspect-ratio friendly) */}
        <div className="flex flex-col min-h-0 bg-muted/5">
          {selectedModelId && selectedTypeId ? (
            <TypeInstanceViewer
              modelId={selectedModelId}
              typeId={selectedTypeId}
              className="h-full"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
              <Layers className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">{t('typeLibrary.selectTypeToPreview')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Read-only Type Group component
interface TypeGroupReadOnlyProps {
  ifcType: string;
  types: IFCType[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedTypeId: string | null;
  selectedTypeIds: Set<string>;
  onSelectType: (typeId: string | null) => void;
  onToggleTypeSelection: (typeId: string) => void;
}

function TypeGroupReadOnly({
  ifcType,
  types,
  isExpanded,
  onToggle,
  selectedTypeId,
  selectedTypeIds,
  onSelectType,
  onToggleTypeSelection,
}: TypeGroupReadOnlyProps) {
  const { t } = useTranslation();
  const mappedCount = types.filter((type) => type.mapping?.mapping_status === 'mapped').length;
  const totalInstances = types.reduce((sum, type) => sum + type.instance_count, 0);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-tertiary" />
          )}
          <span className="font-medium text-text-primary">{ifcType}</span>
          <Badge variant="secondary" className="text-xs">
            {types.length} {t('common.types')}
          </Badge>
          <span className="text-xs text-text-tertiary">
            {totalInstances.toLocaleString()} {t('common.instances')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mappedCount === types.length ? (
            <Badge variant="success" className="text-xs">
              {t('typeMapping.allMapped')}
            </Badge>
          ) : mappedCount > 0 ? (
            <Badge variant="warning" className="text-xs">
              {mappedCount}/{types.length} {t('common.mapped')}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              {t('typeMapping.unmapped')}
            </Badge>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border divide-y divide-border">
          {types.map((type) => (
            <TypeRowReadOnly
              key={type.id}
              type={type}
              isSelected={selectedTypeId === type.id}
              isChecked={selectedTypeIds.has(type.id)}
              onSelect={() => onSelectType(selectedTypeId === type.id ? null : type.id)}
              onToggleCheck={() => onToggleTypeSelection(type.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only Type Row (no inline editing)
interface TypeRowReadOnlyProps {
  type: IFCType;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
}

function TypeRowReadOnly({
  type,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
}: TypeRowReadOnlyProps) {
  const { t } = useTranslation();
  const mappingStatus = (type.mapping?.mapping_status || 'pending') as MappingStatus;
  const ns3451Display = type.mapping?.ns3451_code
    ? `${type.mapping.ns3451_code} - ${type.mapping.ns3451_name || ''}`
    : null;

  // Extract basic QTO from properties if present
  const qtoData = useMemo(() => {
    const qto: { label: string; value: string }[] = [];
    const props = type.properties || {};

    // Look for common QTO patterns
    for (const [key, pset] of Object.entries(props)) {
      if (key.startsWith('Qto_') && typeof pset === 'object' && pset !== null) {
        const qtoSet = pset as Record<string, unknown>;
        if (typeof qtoSet.NetArea === 'number') {
          qto.push({ label: 'Area', value: `${qtoSet.NetArea.toFixed(1)} m²` });
        }
        if (typeof qtoSet.GrossVolume === 'number') {
          qto.push({ label: 'Vol', value: `${qtoSet.GrossVolume.toFixed(2)} m³` });
        }
        if (typeof qtoSet.Length === 'number') {
          qto.push({ label: 'Len', value: `${qtoSet.Length.toFixed(1)} m` });
        }
      }
    }
    return qto.slice(0, 2); // Show max 2 QTO items
  }, [type.properties]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer',
        isSelected
          ? 'bg-primary/10 border-l-2 border-primary'
          : 'bg-background hover:bg-muted/30'
      )}
      onClick={onSelect}
    >
      {/* Checkbox for multi-select */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => {
          e.stopPropagation();
          onToggleCheck();
        }}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
      />

      {/* Type Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">{type.type_name}</span>
          <span className="text-xs text-text-tertiary">
            ({type.instance_count.toLocaleString()} {t('common.instances')})
          </span>
        </div>
        {/* Classification display (read-only) */}
        {ns3451Display && (
          <div className="text-xs text-text-secondary truncate mt-0.5">
            {ns3451Display}
          </div>
        )}
      </div>

      {/* QTO Data (read-only) */}
      {qtoData.length > 0 && (
        <div className="flex items-center gap-2">
          {qtoData.map((item, idx) => (
            <span key={idx} className="text-xs text-text-tertiary">
              {item.value}
            </span>
          ))}
        </div>
      )}

      {/* Status Badge (read-only) */}
      <TypeStatusBadge status={mappingStatus} />
    </div>
  );
}

export default TypeLibraryView;
