/**
 * TypeBrowser
 *
 * Unified type browsing + classification page. Replaces both the old
 * Type Library (read-only browse) and Classification Workbench (editing).
 *
 * Supports three view modes:
 * - List: 3-column (type nav + classification form + info/HUD)
 * - Gallery: Card grid with HUD thumbnails (Phase 2)
 * - Grid: Airtable-style batch editing
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Layers } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

import { TypeBrowserListView } from './TypeBrowserListView';
import { TypeMappingGrid } from './TypeMappingGrid';
import {
  TypeBrowserFilterBar,
  useFilterOptions,
  filterTypes,
  type ViewMode,
} from './TypeBrowserFilterBar';

import { useModels } from '@/hooks/use-models';
import {
  useModelTypes,
  useTypeMappingSummary,
  useExportTypesExcel,
  useExportTypesReduzer,
  useImportTypesExcel,
  type ExcelImportResult,
} from '@/hooks/use-warehouse';
import type { Model } from '@/lib/api-types';
import { cn } from '@/lib/utils';

interface TypeBrowserProps {
  projectId: string;
  className?: string;
}

export function TypeBrowser({ projectId, className }: TypeBrowserProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // State from URL
  const initialModelId = searchParams.get('model') || undefined;
  const initialView = (searchParams.get('view') as ViewMode) || 'list';

  // Local state
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(initialModelId);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ifcClassFilter, setIfcClassFilter] = useState('all');
  const [ns3451Filter, setNs3451Filter] = useState('all');

  // Excel import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Data hooks
  const { data: models = [], isLoading: modelsLoading } = useModels(projectId);
  const { data: types = [], isLoading: typesLoading } = useModelTypes(selectedModelId || '', {
    enabled: !!selectedModelId,
  });
  const { data: summary } = useTypeMappingSummary(selectedModelId || '');

  // Excel hooks
  const exportExcel = useExportTypesExcel();
  const exportReduzer = useExportTypesReduzer();
  const importExcel = useImportTypesExcel();

  // Auto-select first ready model
  useEffect(() => {
    if (!selectedModelId && models.length > 0 && !modelsLoading) {
      const readyModel = models.find((m) => m.status === 'ready');
      if (readyModel) setSelectedModelId(readyModel.id);
    }
  }, [models, selectedModelId, modelsLoading]);

  // Sync model to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedModelId) params.set('model', selectedModelId);
    else params.delete('model');
    params.set('view', viewMode);
    setSearchParams(params, { replace: true });
  }, [selectedModelId, viewMode]);

  // Filter options derived from types
  const { uniqueIfcClasses, uniqueNs3451Codes } = useFilterOptions(types);

  // Apply filters
  const filteredTypes = useMemo(
    () => filterTypes(types, { searchQuery, statusFilter, ifcClassFilter, ns3451Filter }),
    [types, searchQuery, statusFilter, ifcClassFilter, ns3451Filter]
  );

  // Model change handler
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    setSearchQuery('');
    setStatusFilter('all');
    setIfcClassFilter('all');
    setNs3451Filter('all');
  }, []);

  // Excel handlers
  const handleExportExcel = useCallback(async () => {
    if (!selectedModelId) return;
    try { await exportExcel.mutateAsync(selectedModelId); }
    catch (error) { console.error('Export failed:', error); }
  }, [exportExcel, selectedModelId]);

  const handleImportExcel = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedModelId) return;
    try {
      const result = await importExcel.mutateAsync({ modelId: selectedModelId, file });
      setImportResult(result);
      setShowImportDialog(true);
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult({
        success: false,
        summary: { total_rows: 0, updated: 0, created: 0, skipped: 0, error_count: 1 },
        errors: [{ row: 0, type_guid: '', error: String(error) }],
        warnings: [],
      });
      setShowImportDialog(true);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [importExcel, selectedModelId]);

  const handleExportReduzer = useCallback(async () => {
    if (!selectedModelId) return;
    try { await exportReduzer.mutateAsync({ modelId: selectedModelId, includeUnmapped: false }); }
    catch (error) { console.error('Reduzer export failed:', error); }
  }, [exportReduzer, selectedModelId]);

  // Get selected model info
  const selectedModel = models.find((m: Model) => m.id === selectedModelId);

  if (modelsLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header Bar */}
      <div className="flex-none flex items-center gap-3 px-3 py-2 border-b bg-muted/30">
        <h1 className="text-sm font-semibold">{t('typeBrowser.title')}</h1>

        {/* Model Selector */}
        <Select
          value={selectedModelId || ''}
          onValueChange={handleModelChange}
          disabled={models.length === 0}
        >
          <SelectTrigger className="w-52 h-7 text-xs">
            <SelectValue placeholder={t('typeMapping.selectModel')} />
          </SelectTrigger>
          <SelectContent>
            {models.map((model: Model) => (
              <SelectItem key={model.id} value={model.id} disabled={model.status !== 'ready'}>
                {model.original_filename} (v{model.version_number})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Summary Stats */}
        {summary && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-normal">
              {summary.total} {t('common.types')}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {summary.mapped} {t('status.mapped')} · {summary.pending} {t('status.pending')}
            </span>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <TypeBrowserFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        ifcClassFilter={ifcClassFilter}
        onIfcClassFilterChange={setIfcClassFilter}
        ns3451Filter={ns3451Filter}
        onNs3451FilterChange={setNs3451Filter}
        uniqueIfcClasses={uniqueIfcClasses}
        uniqueNs3451Codes={uniqueNs3451Codes}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        onExportReduzer={handleExportReduzer}
        isExporting={exportExcel.isPending}
        isImporting={importExcel.isPending}
        isExportingReduzer={exportReduzer.isPending}
        totalTypes={types.length}
        filteredCount={filteredTypes.length}
      />

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!selectedModelId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Layers className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">{t('typeBrowser.selectModel')}</p>
          </div>
        ) : typesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === 'list' ? (
          <TypeBrowserListView
            modelId={selectedModelId}
            modelFilename={selectedModel?.original_filename}
            filteredTypes={filteredTypes}
            summary={summary}
            onExportExcel={handleExportExcel}
            onImportExcel={handleImportExcel}
            onExportReduzer={handleExportReduzer}
            isExporting={exportExcel.isPending}
            isImporting={importExcel.isPending}
          />
        ) : viewMode === 'grid' ? (
          <TypeMappingGrid
            modelId={selectedModelId}
            modelFilename={selectedModel?.original_filename}
            className="h-full"
          />
        ) : (
          /* Gallery - Phase 2 placeholder */
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Layers className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">{t('typeBrowser.galleryComingSoon')}</p>
          </div>
        )}
      </div>

      {/* Hidden file input for Excel import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Excel Import Result Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult?.success
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
              {t('typeMapping.importResult')}
            </DialogTitle>
            <DialogDescription>
              {importResult?.success ? t('typeMapping.importSuccess') : t('typeMapping.importPartial')}
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between py-1 px-2 bg-muted rounded">
                  <span className="text-muted-foreground">{t('typeMapping.importTotalRows')}</span>
                  <span className="font-medium">{importResult.summary.total_rows}</span>
                </div>
                <div className="flex justify-between py-1 px-2 bg-green-500/10 rounded">
                  <span className="text-muted-foreground">{t('typeMapping.importUpdated')}</span>
                  <span className="font-medium text-green-600">{importResult.summary.updated}</span>
                </div>
                <div className="flex justify-between py-1 px-2 bg-muted rounded">
                  <span className="text-muted-foreground">{t('typeMapping.importSkipped')}</span>
                  <span className="font-medium">{importResult.summary.skipped}</span>
                </div>
                <div className="flex justify-between py-1 px-2 bg-red-500/10 rounded">
                  <span className="text-muted-foreground">{t('typeMapping.importErrors')}</span>
                  <span className="font-medium text-red-600">{importResult.summary.error_count}</span>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-red-600">{t('typeMapping.importErrorList')}</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-xs bg-red-500/10 p-1.5 rounded">
                        <span className="text-muted-foreground">{t('typeMapping.importRow')} {err.row}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={() => setShowImportDialog(false)} className="w-full">
                {t('common.close')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TypeBrowser;
