import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, Download, Upload, AlertTriangle,
  ChevronDown, X,
} from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TypeLibraryGrid } from '@/components/features/warehouse/TypeLibraryGrid';
import { TypeDetailPanel } from '@/components/features/warehouse/TypeDetailPanel';
import {
  useGlobalTypeLibrarySummary,
  useEmptyTypes,
  type GlobalTypeLibraryEntry,
  type VerificationStatus,
} from '@/hooks/use-warehouse';
import { useProjects } from '@/hooks/use-projects';
import { cn } from '@/lib/utils';

export default function TypeLibraryPage() {
  const { t } = useTranslation();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [verificationFilter, setVerificationFilter] = useState<VerificationStatus | 'all'>('all');
  const [showEmptyTypes, setShowEmptyTypes] = useState(false);

  // Selection state
  const [selectedType, setSelectedType] = useState<GlobalTypeLibraryEntry | null>(null);

  // Data
  const { data: projects = [] } = useProjects();
  const { data: summary } = useGlobalTypeLibrarySummary({
    projectId: selectedProjectId,
    modelId: selectedModelId,
  });
  const { data: emptyTypes = [] } = useEmptyTypes({
    projectId: selectedProjectId,
    modelId: selectedModelId,
  });

  // Handle type selection
  const handleSelectType = (type: GlobalTypeLibraryEntry) => {
    setSelectedType(type);
  };

  // Handle filter changes
  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId === 'all' ? undefined : projectId);
    setSelectedModelId(undefined); // Reset model when project changes
  };

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedProjectId(undefined);
    setSelectedModelId(undefined);
    setVerificationFilter('all');
    setShowEmptyTypes(false);
  };

  const hasActiveFilters = searchQuery || selectedProjectId || selectedModelId ||
    verificationFilter !== 'all' || showEmptyTypes;

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">{t('typeLibrary.title')}</h1>

            {/* Summary Stats */}
            {summary && (
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="font-normal">
                  {summary.total} {t('typeLibrary.types')}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">
                    {summary.by_verification_status?.verified || 0}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">
                    {summary.by_verification_status?.auto || 0}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">
                    {summary.by_verification_status?.flagged || 0}
                  </span>
                </div>
                {summary.empty_types_count > 0 && (
                  <button
                    onClick={() => setShowEmptyTypes(true)}
                    className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{summary.empty_types_count} {t('typeLibrary.emptyTypes')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  {t('common.export')}
                  <ChevronDown className="h-3.5 w-3.5 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  {t('typeLibrary.exportExcel')}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  {t('typeLibrary.exportReducer')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              {t('common.import')}
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/10">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('typeLibrary.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8"
            />
          </div>

          {/* Project Filter */}
          <Select value={selectedProjectId || 'all'} onValueChange={handleProjectChange}>
            <SelectTrigger className="w-48 h-8">
              <SelectValue placeholder={t('typeLibrary.allProjects')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('typeLibrary.allProjects')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Empty Types Toggle */}
          <Button
            variant={showEmptyTypes ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => setShowEmptyTypes(!showEmptyTypes)}
          >
            <AlertTriangle className={cn(
              'h-4 w-4 mr-2',
              showEmptyTypes && 'text-amber-600'
            )} />
            {t('typeLibrary.showEmpty')}
            {emptyTypes.length > 0 && (
              <Badge variant="secondary" className="ml-2 px-1.5 py-0">
                {emptyTypes.length}
              </Badge>
            )}
          </Button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={clearFilters}
            >
              <X className="h-4 w-4 mr-1" />
              {t('common.clearFilters')}
            </Button>
          )}
        </div>

        {/* Main Content - Three Panel Layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Panel - Type Grid */}
          <div className="flex-1 flex flex-col min-w-0 border-r">
            <TypeLibraryGrid
              projectId={selectedProjectId}
              modelId={selectedModelId}
              selectedTypeId={selectedType?.id}
              verificationFilter={verificationFilter}
              searchQuery={searchQuery}
              onSelectType={handleSelectType}
              onVerificationFilterChange={setVerificationFilter}
              className="flex-1"
            />
          </div>

          {/* Right Panel - Type Detail */}
          <div className="w-[400px] flex-shrink-0 bg-background">
            <TypeDetailPanel
              type={selectedType}
              onClose={() => setSelectedType(null)}
              className="h-full"
            />
          </div>
        </div>

        {/* Verification Progress Bar */}
        {summary && summary.total > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {t('typeLibrary.verificationProgress')}
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="flex h-full">
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{
                      width: `${((summary.by_verification_status?.verified || 0) / summary.total) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{
                      width: `${((summary.by_verification_status?.auto || 0) / summary.total) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{
                      width: `${((summary.by_verification_status?.flagged || 0) / summary.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-medium">
                {summary.verification_progress_percent}%
              </span>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
