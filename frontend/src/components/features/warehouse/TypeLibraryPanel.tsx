import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, CheckCircle2, Clock, Search, Filter, ChevronDown, ChevronRight, Box, List, Focus, Grid3X3 } from 'lucide-react';
import { useModels } from '@/hooks/use-models';
import {
  useModelTypes,
  useTypeMappingSummary,
  useNS3451Codes,
  useCreateTypeMapping,
  useUpdateTypeMapping,
  type IFCType,
  type NS3451Code,
} from '@/hooks/use-warehouse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TypeInstanceViewer } from './TypeInstanceViewer';
import { TypeMappingWorkspace } from './TypeMappingWorkspace';
import { TypeMappingGrid } from './TypeMappingGrid';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'focused' | 'grid';

interface TypeLibraryPanelProps {
  projectId: string;
}

export function TypeLibraryPanel({ projectId }: TypeLibraryPanelProps) {
  const { t } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ifcTypeFilter, setIfcTypeFilter] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('focused');

  // Fetch models for the project
  const { data: models = [], isLoading: modelsLoading } = useModels(projectId);

  // Fetch types for the selected model
  const { data: types = [], isLoading: typesLoading } = useModelTypes(
    selectedModelId || '',
    { enabled: !!selectedModelId }
  );

  // Fetch mapping summary
  const { data: summary } = useTypeMappingSummary(selectedModelId || '');

  // Fetch NS3451 codes for the dropdown
  const { data: ns3451Codes = [] } = useNS3451Codes();

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

  // Auto-select first model if none selected
  if (!selectedModelId && models.length > 0) {
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

  // FOCUSED VIEW - Full height, compact header
  if (viewMode === 'focused' && selectedModelId) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Compact toolbar - minimal height */}
        <div className="flex-none flex items-center gap-3 px-3 py-1.5 border-b bg-background-elevated">
          <Select
            value={selectedModelId}
            onValueChange={(value) => setSelectedModelId(value)}
          >
            <SelectTrigger className="w-[180px] h-7 text-xs">
              <SelectValue />
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
          <span className="text-xs text-text-tertiary">{types.length} {t('common.types')}</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('grid')}
            className="gap-1 h-6 text-xs px-2"
          >
            <Grid3X3 className="h-3 w-3" />
            {t('typeMapping.gridView')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-1 h-6 text-xs px-2"
          >
            <List className="h-3 w-3" />
            {t('typeMapping.listView')}
          </Button>
        </div>

        {/* Full-height workspace - NO extra padding */}
        <div className="flex-1 overflow-hidden">
          <TypeMappingWorkspace
            modelId={selectedModelId}
            modelFilename={models.find((m) => m.id === selectedModelId)?.name}
            className="h-full"
          />
        </div>
      </div>
    );
  }

  // GRID VIEW - Airtable-style data grid
  if (viewMode === 'grid' && selectedModelId) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Compact toolbar */}
        <div className="flex-none flex items-center gap-3 px-3 py-1.5 border-b bg-background-elevated">
          <Select
            value={selectedModelId}
            onValueChange={(value) => setSelectedModelId(value)}
          >
            <SelectTrigger className="w-[180px] h-7 text-xs">
              <SelectValue />
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
          <span className="text-xs text-text-tertiary">{types.length} {t('common.types')}</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('focused')}
            className="gap-1 h-6 text-xs px-2"
          >
            <Focus className="h-3 w-3" />
            {t('typeMapping.focusedView')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-1 h-6 text-xs px-2"
          >
            <List className="h-3 w-3" />
            {t('typeMapping.listView')}
          </Button>
        </div>

        {/* Grid fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <TypeMappingGrid
            modelId={selectedModelId}
            modelFilename={models.find((m) => m.id === selectedModelId)?.name}
            className="h-full"
          />
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4">
      {/* Compact header for list view */}
      <div className="flex-none flex items-center gap-3">
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
        {selectedModelId && <span className="text-xs text-text-tertiary">{types.length} {t('common.types')}</span>}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode('grid')}
          className="gap-1.5 h-7 text-xs"
        >
          <Grid3X3 className="h-3.5 w-3.5" />
          {t('typeMapping.gridView')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode('focused')}
          className="gap-1.5 h-7 text-xs"
        >
          <Focus className="h-3.5 w-3.5" />
          {t('typeMapping.focusedView')}
        </Button>
      </div>

      {/* Stats (only in list view) */}
      {selectedModelId && summary && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary">{t('typeMapping.totalTypes')}</p>
                  <p className="text-2xl font-bold text-text-primary">{summary.total}</p>
                </div>
                <Layers className="h-8 w-8 text-text-tertiary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary">{t('status.mapped')}</p>
                  <p className="text-2xl font-bold text-success">{summary.mapped}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary">{t('status.pending')}</p>
                  <p className="text-2xl font-bold text-warning">{summary.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-warning opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary">{t('typeMapping.progress')}</p>
                  <p className="text-2xl font-bold text-primary">{summary.progress_percent}%</p>
                </div>
                <div className="w-16 h-16 relative">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-secondary"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={`${summary.progress_percent * 1.76} 176`}
                      className="text-primary"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      {selectedModelId && viewMode === 'list' && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <Input
                  placeholder={t('typeMapping.searchTypes')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
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
              <Select value={ifcTypeFilter} onValueChange={setIfcTypeFilter}>
                <SelectTrigger className="w-[200px]">
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Split panel: Types list (60%) + Instance Viewer (40%) */}
      {selectedModelId && viewMode === 'list' && (
        <div className="flex gap-4">
          {/* Types list - Left panel */}
          <Card className="flex-[6]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{t('typeMapping.ifcTypes')} ({filteredTypes.length})</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (expandedGroups.size === Object.keys(groupedTypes).length) {
                      setExpandedGroups(new Set());
                    } else {
                      setExpandedGroups(new Set(Object.keys(groupedTypes)));
                    }
                  }}
                >
                  {expandedGroups.size === Object.keys(groupedTypes).length
                    ? t('typeMapping.collapseAll')
                    : t('typeMapping.expandAll')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {typesLoading ? (
                <div className="text-center py-12 text-text-secondary">
                  {t('typeMapping.loadingTypes')}
                </div>
              ) : filteredTypes.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
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
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {Object.entries(groupedTypes).map(([ifcType, typeList]) => (
                      <TypeGroup
                        key={ifcType}
                        ifcType={ifcType}
                        types={typeList}
                        isExpanded={expandedGroups.has(ifcType)}
                        onToggle={() => toggleGroup(ifcType)}
                        ns3451Codes={ns3451Codes}
                        selectedTypeId={selectedTypeId}
                        onSelectType={setSelectedTypeId}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Instance Viewer - Right panel */}
          <Card className="flex-[4]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Box className="h-4 w-4" />
                {t('viewer.instancePreview')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TypeInstanceViewer
                modelId={selectedModelId}
                typeId={selectedTypeId}
                className="h-[520px]"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* No model selected */}
      {!selectedModelId && models.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Layers className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {t('project.selectModel')}
              </h3>
              <p className="text-text-secondary">
                {t('project.selectModelDesc')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No models in project */}
      {models.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Layers className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {t('project.noModels')}
              </h3>
              <p className="text-text-secondary mb-4">
                {t('project.noModelsDesc')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Type Group component
interface TypeGroupProps {
  ifcType: string;
  types: IFCType[];
  isExpanded: boolean;
  onToggle: () => void;
  ns3451Codes: NS3451Code[];
  selectedTypeId: string | null;
  onSelectType: (typeId: string | null) => void;
}

function TypeGroup({ ifcType, types, isExpanded, onToggle, ns3451Codes, selectedTypeId, onSelectType }: TypeGroupProps) {
  const { t } = useTranslation();
  const mappedCount = types.filter((t) => t.mapping?.mapping_status === 'mapped').length;
  const totalInstances = types.reduce((sum, t) => sum + t.instance_count, 0);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-background-elevated hover:bg-accent/50 transition-colors"
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
            {totalInstances} {t('common.instances')}
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
            <TypeRow
              key={type.id}
              type={type}
              ns3451Codes={ns3451Codes}
              isSelected={selectedTypeId === type.id}
              onSelect={() => onSelectType(selectedTypeId === type.id ? null : type.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Type Row component with NS3451 selector
interface TypeRowProps {
  type: IFCType;
  ns3451Codes: NS3451Code[];
  isSelected: boolean;
  onSelect: () => void;
}

function TypeRow({ type, ns3451Codes, isSelected, onSelect }: TypeRowProps) {
  const { t } = useTranslation();
  const createMapping = useCreateTypeMapping();
  const updateMapping = useUpdateTypeMapping();

  const currentCode = type.mapping?.ns3451_code || '';
  const mappingStatus = type.mapping?.mapping_status || 'pending';

  // Group NS3451 codes by level
  const level1Codes = ns3451Codes.filter((c) => c.level === 1);
  const level2Codes = ns3451Codes.filter((c) => c.level === 2);
  const level3Codes = ns3451Codes.filter((c) => c.level === 3);

  const handleCodeChange = async (newCode: string) => {
    const codeValue = newCode === '__clear__' ? null : newCode;
    if (type.mapping) {
      // Update existing mapping
      await updateMapping.mutateAsync({
        mappingId: type.mapping.id,
        ns3451_code: codeValue,
        mapping_status: codeValue ? 'mapped' : 'pending',
      });
    } else {
      // Create new mapping
      await createMapping.mutateAsync({
        ifc_type: type.id,
        ns3451_code: codeValue,
        mapping_status: codeValue ? 'mapped' : 'pending',
      });
    }
  };

  const statusBadge = () => {
    switch (mappingStatus) {
      case 'mapped':
        return <Badge variant="success" className="text-xs">{t('status.mapped')}</Badge>;
      case 'ignored':
        return <Badge variant="secondary" className="text-xs">{t('status.ignored')}</Badge>;
      case 'review':
        return <Badge variant="warning" className="text-xs">{t('status.review')}</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{t('status.pending')}</Badge>;
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 transition-colors cursor-pointer",
        isSelected
          ? "bg-accent-primary/10 border-l-2 border-accent-primary"
          : "bg-background hover:bg-accent/30"
      )}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">{type.type_name}</span>
          <span className="text-xs text-text-tertiary">
            ({type.instance_count} {t('common.instances')})
          </span>
        </div>
        {type.type_guid && (
          <div className="text-xs text-text-tertiary truncate">
            GUID: {type.type_guid}
          </div>
        )}
      </div>

      <div className="w-[250px]" onClick={(e) => e.stopPropagation()}>
        <Select value={currentCode} onValueChange={handleCodeChange}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={t('typeMapping.selectNs3451')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__">{t('typeMapping.clearMapping')}</SelectItem>
            <SelectGroup>
              <SelectLabel>{t('typeMapping.level1Categories')}</SelectLabel>
              {level1Codes.map((code) => (
                <SelectItem key={code.code} value={code.code}>
                  {code.code} - {code.name}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>{t('typeMapping.level2Categories')}</SelectLabel>
              {level2Codes.map((code) => (
                <SelectItem key={code.code} value={code.code}>
                  {code.code} - {code.name}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>{t('typeMapping.level3Categories')}</SelectLabel>
              {level3Codes.map((code) => (
                <SelectItem key={code.code} value={code.code}>
                  {code.code} - {code.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="w-20">{statusBadge()}</div>
    </div>
  );
}

export default TypeLibraryPanel;
