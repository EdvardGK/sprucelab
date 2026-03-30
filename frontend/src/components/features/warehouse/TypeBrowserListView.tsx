/**
 * TypeBrowserListView
 *
 * 3-column list view for the Type Browser:
 * - Left (~25%): Type navigation list grouped by IFC class
 * - Center (~40%): Classification form (NS3451, materials, unit, notes, actions)
 * - Right (~35%): TypeInfoPanel + compact HUD viewer
 *
 * Based on the Classification page layout (which users prefer for its
 * data-focused, viewer-doesn't-dominate design), with a type navigation
 * list always visible on the left.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Save,
  XCircle,
  Flag,
  Loader2,
  Box,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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

import { NS3451CascadingSelector } from './NS3451CascadingSelector';
import { TypeInfoPanel } from './TypeInfoPanel';
import { InlineViewer } from '../viewer/InlineViewer';
import { MaterialLayerEditor } from './MaterialLayerEditor';
import { MappingProgressBar, KeyboardShortcutsHint } from './MappingProgressBar';
import { TypeStatusIndicator } from './shared/TypeStatusBadge';

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

type RepresentativeUnit = 'pcs' | 'm' | 'm2' | 'm3';

const UNIT_OPTIONS: { value: RepresentativeUnit; label: string }[] = [
  { value: 'pcs', label: 'pcs (stk)' },
  { value: 'm', label: 'm (lengde)' },
  { value: 'm2', label: 'm² (areal)' },
  { value: 'm3', label: 'm³ (volum)' },
];

interface TypeBrowserListViewProps {
  modelId: string;
  modelFilename?: string;
  /** Pre-filtered types from parent (after search/filter bar) */
  filteredTypes: IFCType[];
  /** All types for the model (unfiltered, for navigation hook) */
  allTypes: IFCType[];
  summary: ReturnType<typeof useTypeMappingSummary>['data'];
  className?: string;
  // Excel callbacks (managed by parent for hidden file input)
  onExportExcel: () => void;
  onImportExcel: () => void;
  onExportReduzer: () => void;
  isExporting?: boolean;
  isImporting?: boolean;
}

export function TypeBrowserListView({
  modelId,
  modelFilename,
  filteredTypes,
  allTypes,
  summary,
  className,
}: TypeBrowserListViewProps) {
  const { t } = useTranslation();
  const updateMapping = useUpdateTypeMapping();
  const createMapping = useCreateTypeMapping();

  // Viewer state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Local form state
  const [ns3451Code, setNs3451Code] = useState<string | null>(null);
  const [representativeUnit, setRepresentativeUnit] = useState<RepresentativeUnit | null>(null);
  const [notes, setNotes] = useState('');

  // Type list state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
        await updateMapping.mutateAsync({ mappingId: type.mapping.id, ...payload });
      } else {
        await createMapping.mutateAsync({ ifc_type: type.id, ...payload });
      }
    },
    [ns3451Code, representativeUnit, notes, updateMapping, createMapping]
  );

  const handleSave = useCallback(async (type: IFCType) => {
    await saveMapping(type, 'mapped');
  }, [saveMapping]);

  const handleIgnore = useCallback(async (type: IFCType) => {
    await saveMapping(type, 'ignored');
  }, [saveMapping]);

  const handleFollowUp = useCallback(async (type: IFCType) => {
    await saveMapping(type, 'followup');
  }, [saveMapping]);

  // Navigation hook — operates on filtered types
  const navigation = useTypeNavigation({
    types: filteredTypes,
    enabled: true,
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
  }, [currentType, resetForm]);

  // Auto-expand group containing current type
  useEffect(() => {
    if (currentType) {
      setExpandedGroups((prev) => {
        if (prev.has(currentType.ifc_type)) return prev;
        const next = new Set(prev);
        next.add(currentType.ifc_type);
        return next;
      });
    }
  }, [currentType]);

  // Fullscreen toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'F11' || (e.key === 'f' && e.shiftKey)) {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Group filtered types by IFC class
  const groupedTypes = useMemo(() => {
    const groups: Record<string, IFCType[]> = {};
    filteredTypes.forEach((type) => {
      if (!groups[type.ifc_type]) groups[type.ifc_type] = [];
      groups[type.ifc_type].push(type);
    });
    return groups;
  }, [filteredTypes]);

  const toggleGroup = (ifcType: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ifcType)) next.delete(ifcType);
      else next.add(ifcType);
      return next;
    });
  };

  // Click a type in the nav list -> jump to it
  const handleTypeClick = useCallback((type: IFCType) => {
    const idx = filteredTypes.findIndex((t) => t.id === type.id);
    if (idx >= 0) navigation.goToIndex(idx);
  }, [filteredTypes, navigation]);

  const isSaving = updateMapping.isPending || createMapping.isPending;

  if (filteredTypes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
        <p className="text-sm">{t('typeMapping.noTypesFound')}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Progress Bar */}
      <div className="flex-none border-b px-3 py-1.5">
        <MappingProgressBar
          currentIndex={currentIndex}
          totalCount={totalCount}
          summary={summary}
          onPrevious={navigation.goToPrevious}
          onNext={navigation.goToNext}
          hasPrevious={navigation.hasPrevious}
          hasNext={navigation.hasNext}
          showKeyboardHint={false}
        />
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 grid grid-cols-[minmax(180px,_1fr)_minmax(280px,_1.6fr)_minmax(240px,_1.4fr)] min-h-0 overflow-hidden">
        {/* LEFT: Type Navigation List */}
        <div className="border-r flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-0.5">
              {Object.entries(groupedTypes).map(([ifcType, typeList]) => (
                <TypeNavGroup
                  key={ifcType}
                  ifcType={ifcType}
                  types={typeList}
                  isExpanded={expandedGroups.has(ifcType)}
                  onToggle={() => toggleGroup(ifcType)}
                  currentTypeId={currentType?.id || null}
                  onSelectType={handleTypeClick}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER: Classification Form */}
        <div className="border-r flex flex-col min-h-0 overflow-hidden">
          {currentType ? (
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {/* Type Identity */}
                <div className="pb-2 border-b">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {currentType.type_name || currentType.ifc_type}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{currentType.ifc_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {currentType.instance_count.toLocaleString()} {t('common.instances')}
                    </span>
                  </div>
                </div>

                {/* NS3451 Classification */}
                <div className="rounded-lg border bg-background p-2.5">
                  <h4 className="text-xs font-medium text-foreground mb-1.5">{t('typeMapping.ns3451')}</h4>
                  <NS3451CascadingSelector
                    value={ns3451Code}
                    onChange={setNs3451Code}
                    disabled={isSaving}
                  />
                </div>

                {/* Material Layers */}
                <MaterialLayerEditor
                  typeMappingId={currentType.mapping?.id || null}
                  initialLayers={currentType.mapping?.definition_layers || []}
                  compact={true}
                />

                {/* Unit + Notes */}
                <div className="flex gap-2">
                  <div className="rounded-lg border bg-background p-2.5 flex-1">
                    <Label className="text-xs font-medium">{t('typeMapping.unit')}</Label>
                    <Select
                      value={representativeUnit || ''}
                      onValueChange={(val) => setRepresentativeUnit(val as RepresentativeUnit)}
                      disabled={isSaving}
                    >
                      <SelectTrigger className="w-full h-7 mt-1 text-xs">
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

                  <div className="rounded-lg border bg-background p-2.5 flex-1">
                    <Label htmlFor="notes" className="text-xs font-medium">{t('typeMapping.notes')}</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('typeMapping.notesPlaceholder')}
                      rows={1}
                      disabled={isSaving}
                      className="text-xs mt-1 min-h-[28px]"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
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
                    {t('common.followUp')} <kbd className="ml-1 px-1 text-[9px] bg-muted rounded">F</kbd>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleIgnore(currentType)}
                    disabled={isSaving}
                    size="sm"
                    className="gap-1 h-7 text-xs text-muted-foreground"
                  >
                    <XCircle className="h-3 w-3" />
                    {t('typeMapping.ignore')} <kbd className="ml-1 px-1 text-[9px] bg-muted rounded">I</kbd>
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">{t('typeBrowser.selectType')}</p>
            </div>
          )}
        </div>

        {/* RIGHT: Type Info + HUD Viewer */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          {currentType ? (
            <>
              {/* Type Info - compact */}
              <div className="flex-none border-b">
                <TypeInfoPanel
                  type={currentType}
                  modelFilename={modelFilename}
                  className="max-h-[40%]"
                />
              </div>

              {/* HUD Viewer - fills remaining space */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
                  <div className="flex items-center gap-1.5">
                    <Box className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('typeMapping.viewer3D')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsFullscreen(true)}
                    className="h-5 w-5 p-0"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                </div>
                <InlineViewer
                  key={currentType.id}
                  modelId={modelId}
                  typeId={currentType.id}
                  typeName={currentType.type_name}
                  ifcType={currentType.ifc_type}
                  className="flex-1 min-h-0"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Box className="h-8 w-8 mb-2 opacity-30" />
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Footer */}
      <div className="flex-none border-t px-3 py-1">
        <KeyboardShortcutsHint />
      </div>

      {/* Fullscreen Viewer Overlay */}
      {isFullscreen && currentType && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <Box className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">{currentType.type_name || currentType.ifc_type}</h3>
              <span className="text-xs text-muted-foreground">
                {currentType.instance_count} {t('common.instances')}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)} className="h-7 w-7 p-0">
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <InlineViewer
              key={`fullscreen-${currentType.id}`}
              modelId={modelId}
              typeId={currentType.id}
              typeName={currentType.type_name}
              ifcType={currentType.ifc_type}
              className="h-full w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Type Navigation List Components ────────────────────────────────────────

interface TypeNavGroupProps {
  ifcType: string;
  types: IFCType[];
  isExpanded: boolean;
  onToggle: () => void;
  currentTypeId: string | null;
  onSelectType: (type: IFCType) => void;
}

function TypeNavGroup({ ifcType, types, isExpanded, onToggle, currentTypeId, onSelectType }: TypeNavGroupProps) {
  const mappedCount = types.filter((t) => t.mapping?.mapping_status === 'mapped').length;
  const totalInstances = types.reduce((sum, t) => sum + t.instance_count, 0);

  return (
    <div className="rounded overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isExpanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
          <span className="text-xs font-medium truncate">{ifcType}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">({types.length})</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
          {mappedCount}/{types.length}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-border/50">
          {types.map((type) => (
            <TypeNavRow
              key={type.id}
              type={type}
              isCurrent={type.id === currentTypeId}
              onSelect={() => onSelectType(type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TypeNavRowProps {
  type: IFCType;
  isCurrent: boolean;
  onSelect: () => void;
}

function TypeNavRow({ type, isCurrent, onSelect }: TypeNavRowProps) {
  const status = (type.mapping?.mapping_status || 'pending') as 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  const code = type.mapping?.ns3451_code;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors',
        isCurrent
          ? 'bg-primary/10 border-l-2 border-primary'
          : 'hover:bg-muted/30'
      )}
    >
      <TypeStatusIndicator status={status} className="h-3 w-3 flex-shrink-0" />
      <span className={cn('text-xs truncate flex-1', isCurrent && 'font-medium')}>
        {type.type_name}
      </span>
      {code && (
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
          {code}
        </span>
      )}
    </button>
  );
}

function getDefaultUnit(ifcType: string): RepresentativeUnit {
  const tier = getProcurementTier(ifcType);
  switch (tier) {
    case 'product': return 'pcs';
    case 'parametric': return 'm';
    case 'built': return 'm2';
    default: return 'pcs';
  }
}
