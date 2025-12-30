/**
 * Type Mapping Workspace
 *
 * Main focused view for mapping IFC types to NS3451 classifications.
 * One type at a time with cascading dropdowns, keyboard navigation,
 * and action buttons.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Save, XCircle, Flag, FileQuestion, Download, Upload, CheckCircle2, AlertTriangle, Leaf, Maximize2, Minimize2, Box } from 'lucide-react';

import { NS3451CascadingSelector } from './NS3451CascadingSelector';
import { TypeInfoPanel } from './TypeInfoPanel';
import { InstanceViewer } from './InstanceViewer';
import { MappingProgressBar, KeyboardShortcutsHint } from './MappingProgressBar';
import { MaterialLayerEditor } from './MaterialLayerEditor';

import {
  useTypeNavigation,
  getStatusCounts,
} from '@/hooks/use-type-navigation';
import {
  useModelTypes,
  useTypeMappingSummary,
  useUpdateTypeMapping,
  useCreateTypeMapping,
  useExportTypesExcel,
  useExportTypesReduzer,
  useImportTypesExcel,
  type IFCType,
  type ExcelImportResult,
} from '@/hooks/use-warehouse';
import { getProcurementTier } from '@/lib/procurement-tiers';
import { cn } from '@/lib/utils';

interface TypeMappingWorkspaceProps {
  modelId: string;
  modelFilename?: string;
  className?: string;
}

type RepresentativeUnit = 'pcs' | 'm' | 'm2' | 'm3';

const UNIT_OPTIONS: { value: RepresentativeUnit; label: string }[] = [
  { value: 'pcs', label: 'pcs (stk)' },
  { value: 'm', label: 'm (lengde)' },
  { value: 'm2', label: 'm² (areal)' },
  { value: 'm3', label: 'm³ (volum)' },
];

export function TypeMappingWorkspace({
  modelId,
  modelFilename,
  className,
}: TypeMappingWorkspaceProps) {
  const { t } = useTranslation();
  const { data: types = [], isLoading: typesLoading } = useModelTypes(modelId);
  const { data: summary } = useTypeMappingSummary(modelId);
  const updateMapping = useUpdateTypeMapping();
  const createMapping = useCreateTypeMapping();
  const exportExcel = useExportTypesExcel();
  const exportReduzer = useExportTypesReduzer();
  const importExcel = useImportTypesExcel();

  // Excel import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Viewer state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Local form state
  const [ns3451Code, setNs3451Code] = useState<string | null>(null);
  const [representativeUnit, setRepresentativeUnit] = useState<RepresentativeUnit | null>(null);
  const [notes, setNotes] = useState('');

  // Reset form when type changes
  const resetForm = useCallback((type: IFCType | null) => {
    if (type) {
      setNs3451Code(type.mapping?.ns3451_code || null);
      setRepresentativeUnit(
        (type.mapping?.representative_unit as RepresentativeUnit) || getDefaultUnit(type.ifc_type)
      );
      setNotes(type.mapping?.notes || '');
    } else {
      setNs3451Code(null);
      setRepresentativeUnit(null);
      setNotes('');
    }
  }, []);

  // Save current mapping
  const saveMapping = useCallback(
    async (type: IFCType, status: 'mapped' | 'ignored' | 'review' | 'followup') => {
      const payload = {
        ns3451_code: ns3451Code,
        mapping_status: status,
        representative_unit: representativeUnit,
        notes: notes.trim() || undefined,
      };

      if (type.mapping?.id) {
        // Update existing mapping
        await updateMapping.mutateAsync({
          mappingId: type.mapping.id,
          ...payload,
        });
      } else {
        // Create new mapping
        await createMapping.mutateAsync({
          ifc_type: type.id,
          ...payload,
        });
      }
    },
    [ns3451Code, representativeUnit, notes, updateMapping, createMapping]
  );

  const handleSave = useCallback(
    async (type: IFCType) => {
      await saveMapping(type, 'mapped');
    },
    [saveMapping]
  );

  const handleIgnore = useCallback(
    async (type: IFCType) => {
      await saveMapping(type, 'ignored');
    },
    [saveMapping]
  );

  const handleFollowUp = useCallback(
    async (type: IFCType) => {
      await saveMapping(type, 'followup');
    },
    [saveMapping]
  );

  // Navigation hook
  const navigation = useTypeNavigation({
    types,
    enabled: !typesLoading,
    autoAdvanceOnSave: true,
    onSave: handleSave,
    onIgnore: handleIgnore,
    onFollowUp: handleFollowUp,
  });

  const { currentType, currentIndex, totalCount } = navigation;

  // Sync form when current type changes
  useEffect(() => {
    if (currentType) {
      resetForm(currentType);
    }
  }, [currentType?.id, resetForm]);

  // Status counts for filter tabs
  const statusCounts = getStatusCounts(types);

  // Viewer keyboard shortcuts (F11/Shift+F = fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'F11' || (e.key === 'f' && e.shiftKey)) {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Toggle fullscreen handler
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Excel export handler
  const handleExport = useCallback(async () => {
    try {
      await exportExcel.mutateAsync(modelId);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [exportExcel, modelId]);

  // Reduzer export handler
  const handleReduzerExport = useCallback(async () => {
    try {
      await exportReduzer.mutateAsync({ modelId, includeUnmapped: false });
    } catch (error) {
      console.error('Reduzer export failed:', error);
    }
  }, [exportReduzer, modelId]);

  // Excel import handler
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importExcel.mutateAsync({ modelId, file });
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [importExcel, modelId]);

  if (typesLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <FileQuestion className="h-12 w-12 mx-auto text-text-tertiary mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">{t('typeMapping.noTypes')}</h3>
        <p className="text-text-secondary">
          {t('typeMapping.noTypesDesc')}
        </p>
      </div>
    );
  }

  const isSaving = updateMapping.isPending || createMapping.isPending;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Progress Bar & Navigation - Compact */}
      <div className="flex-none border-b px-3 py-2 space-y-2">
        <MappingProgressBar
          currentIndex={currentIndex}
          totalCount={totalCount}
          summary={summary}
          onPrevious={navigation.goToPrevious}
          onNext={navigation.goToNext}
          hasPrevious={navigation.hasPrevious}
          hasNext={navigation.hasNext}
        />

        {/* Status Filter Tabs + Excel Buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-text-tertiary mr-1">{t('common.filter')}:</span>
            {(['all', 'pending', 'mapped', 'review', 'followup', 'ignored'] as const).map(
              (status) => (
                <Button
                  key={status}
                  variant={navigation.filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigation.setFilterStatus(status)}
                  className="text-xs h-6 px-2"
                >
                  {status === 'all' ? t('common.all') : t(`status.${status}`)}
                  <span className="ml-1 text-text-tertiary">
                    ({statusCounts[status]})
                  </span>
                </Button>
              )
            )}
          </div>

          {/* Excel Export/Import Buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exportExcel.isPending || types.length === 0}
              className="text-xs h-6 px-2 gap-1"
            >
              {exportExcel.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {t('typeMapping.exportExcel')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportClick}
              disabled={importExcel.isPending || types.length === 0}
              className="text-xs h-6 px-2 gap-1"
            >
              {importExcel.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              {t('typeMapping.importExcel')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReduzerExport}
              disabled={exportReduzer.isPending || summary?.mapped === 0}
              className="text-xs h-6 px-2 gap-1 border-green-600/30 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
              title={t('typeMapping.exportReduzerTooltip', 'Export mapped types to Reduzer format for LCA')}
            >
              {exportReduzer.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Leaf className="h-3 w-3" />
              )}
              {t('typeMapping.exportReduzer')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area - Fixed height, no scroll at this level */}
      {currentType ? (
        <div className="flex-1 overflow-hidden p-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full">
            {/* Left Column: NS3451 + Controls - Scrollable if needed */}
            <div className="flex flex-col gap-2 overflow-y-auto">
              {/* NS3451 Classification - Inline */}
              <div className="rounded-lg border bg-background p-2.5">
                <h3 className="text-xs font-medium text-text-primary mb-1.5">{t('typeMapping.ns3451')}</h3>
                <NS3451CascadingSelector
                  value={ns3451Code}
                  onChange={setNs3451Code}
                  disabled={isSaving}
                />
              </div>

              {/* Material Layers - for type composition */}
              <MaterialLayerEditor
                typeMappingId={currentType.mapping?.id || null}
                initialLayers={currentType.mapping?.definition_layers || []}
                compact={true}
              />

              {/* Unit + Notes in one row on larger screens */}
              <div className="flex gap-2">
                {/* Representative Unit - Compact */}
                <div className="rounded-lg border bg-background p-2.5 flex-1">
                  <Label className="text-xs font-medium">{t('typeMapping.unit')}</Label>
                  <Select
                    value={representativeUnit || ''}
                    onValueChange={(val) => setRepresentativeUnit(val as RepresentativeUnit)}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="w-full h-8 mt-1">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes - Compact */}
                <div className="rounded-lg border bg-background p-2.5 flex-1">
                  <Label htmlFor="notes" className="text-xs font-medium">{t('typeMapping.notes')}</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('typeMapping.notesPlaceholder')}
                    rows={1}
                    disabled={isSaving}
                    className="text-xs mt-1 min-h-[32px]"
                  />
                </div>
              </div>

              {/* Action Buttons - Always visible */}
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  onClick={() => handleSave(currentType)}
                  disabled={isSaving || !ns3451Code}
                  size="sm"
                  className="gap-1 h-7 text-xs"
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {t('typeMapping.saveMapping')} <kbd className="ml-1 px-1 text-[9px] bg-primary-foreground/20 rounded">A</kbd>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleFollowUp(currentType)}
                  disabled={isSaving}
                  size="sm"
                  className="gap-1 h-7 text-xs"
                >
                  <Flag className="h-3 w-3 text-red-500" />
                  {t('common.followUp')} <kbd className="ml-1 px-1 text-[9px] bg-background-tertiary rounded">F</kbd>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleIgnore(currentType)}
                  disabled={isSaving}
                  size="sm"
                  className="gap-1 h-7 text-xs text-text-tertiary"
                >
                  <XCircle className="h-3 w-3" />
                  {t('typeMapping.ignore')} <kbd className="ml-1 px-1 text-[9px] bg-background-tertiary rounded">I</kbd>
                </Button>
              </div>
            </div>

            {/* Right Column: Type Info + 3D Preview - Fill height */}
            <div className="flex flex-col gap-2 min-h-0">
              <TypeInfoPanel
                type={currentType}
                modelFilename={modelFilename}
              />

              {/* 3D Instance Preview - Take all remaining space */}
              <div className="flex-1 min-h-0 flex flex-col rounded-lg border bg-background overflow-hidden">
                {/* Viewer Toolbar - Minimal */}
                <div className="flex items-center justify-between px-2 py-1 border-b bg-background-secondary">
                  <div className="flex items-center gap-1.5">
                    <Box className="h-3 w-3 text-text-tertiary" />
                    <span className="text-xs text-text-secondary">{t('typeMapping.viewer3D', '3D Preview')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-6 w-6 p-0"
                    title={t('typeMapping.fullscreen', 'Fullscreen (Shift+F)')}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Viewer Content */}
                <InstanceViewer
                  modelId={modelId}
                  typeId={currentType.id}
                  className="flex-1 min-h-0"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-secondary text-sm">{t('typeMapping.noMatch')}</p>
        </div>
      )}

      {/* Keyboard Shortcuts Footer - Minimal */}
      <div className="flex-none border-t px-3 py-1.5 bg-background-secondary">
        <KeyboardShortcutsHint />
      </div>

      {/* Fullscreen Viewer Overlay */}
      {isFullscreen && currentType && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background-secondary">
            <div className="flex items-center gap-3">
              <Box className="h-4 w-4 text-text-tertiary" />
              <h3 className="text-sm font-medium text-text-primary">
                {currentType.type_name || currentType.ifc_type}
              </h3>
              <span className="text-xs text-text-tertiary">
                {currentType.instance_count} {t('common.instances', 'instances')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary">
                <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded">Esc</kbd> {t('common.close', 'close')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="h-7 w-7 p-0"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Fullscreen Viewer */}
          <div className="flex-1 min-h-0">
            <InstanceViewer
              modelId={modelId}
              typeId={currentType.id}
              className="h-full w-full"
            />
          </div>
          {/* Fullscreen Footer - Type Info */}
          <div className="flex items-center justify-between px-4 py-2 border-t bg-background-secondary text-xs">
            <div className="flex items-center gap-4">
              <span className="text-text-secondary">
                <span className="text-text-tertiary">{t('typeMapping.ifcType', 'IFC Type')}:</span> {currentType.ifc_type}
              </span>
              {currentType.mapping?.ns3451_code && (
                <span className="text-text-secondary">
                  <span className="text-text-tertiary">NS3451:</span> {currentType.mapping.ns3451_code}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary">
                {t('typeMapping.useArrowKeys', 'Use arrow keys to navigate instances')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Result Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
              {t('typeMapping.importResult')}
            </DialogTitle>
            <DialogDescription>
              {importResult?.success
                ? t('typeMapping.importSuccess')
                : t('typeMapping.importPartial')}
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between py-1 px-2 bg-background-secondary rounded">
                  <span className="text-text-secondary">{t('typeMapping.importTotalRows')}</span>
                  <span className="font-medium">{importResult.summary.total_rows}</span>
                </div>
                <div className="flex justify-between py-1 px-2 bg-green-500/10 rounded">
                  <span className="text-text-secondary">{t('typeMapping.importUpdated')}</span>
                  <span className="font-medium text-green-600">{importResult.summary.updated}</span>
                </div>
                <div className="flex justify-between py-1 px-2 bg-background-secondary rounded">
                  <span className="text-text-secondary">{t('typeMapping.importSkipped')}</span>
                  <span className="font-medium">{importResult.summary.skipped}</span>
                </div>
                <div className="flex justify-between py-1 px-2 bg-red-500/10 rounded">
                  <span className="text-text-secondary">{t('typeMapping.importErrors')}</span>
                  <span className="font-medium text-red-600">{importResult.summary.error_count}</span>
                </div>
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-red-600">{t('typeMapping.importErrorList')}</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-xs bg-red-500/10 p-1.5 rounded">
                        <span className="text-text-tertiary">{t('typeMapping.importRow')} {err.row}:</span>{' '}
                        {err.error}
                      </div>
                    ))}
                    {importResult.errors.length > 10 && (
                      <div className="text-xs text-text-tertiary">
                        {t('typeMapping.importMoreErrors', { count: importResult.errors.length - 10 })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-yellow-600">{t('typeMapping.importWarningList')}</h4>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {importResult.warnings.slice(0, 5).map((warn, idx) => (
                      <div key={idx} className="text-xs bg-yellow-500/10 p-1.5 rounded">
                        <span className="text-text-tertiary">{t('typeMapping.importRow')} {warn.row}:</span>{' '}
                        {warn.warning}
                      </div>
                    ))}
                    {importResult.warnings.length > 5 && (
                      <div className="text-xs text-text-tertiary">
                        {t('typeMapping.importMoreWarnings', { count: importResult.warnings.length - 5 })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={() => setShowImportDialog(false)}
                className="w-full"
              >
                {t('common.close')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Get default unit based on IFC type tier.
 */
function getDefaultUnit(ifcType: string): RepresentativeUnit {
  const tier = getProcurementTier(ifcType);
  switch (tier) {
    case 'product':
      return 'pcs';
    case 'parametric':
      return 'm';
    case 'built':
      return 'm2';
    default:
      return 'pcs';
  }
}

