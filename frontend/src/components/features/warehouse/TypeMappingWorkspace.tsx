/**
 * Type Mapping Workspace
 *
 * Main focused view for mapping IFC types to NS3451 classifications.
 * One type at a time with cascading dropdowns, keyboard navigation,
 * and action buttons.
 */

import { useState, useCallback, useEffect } from 'react';
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
import { Loader2, Save, XCircle, Flag, FileQuestion } from 'lucide-react';

import { NS3451CascadingSelector } from './NS3451CascadingSelector';
import { TypeInfoPanel } from './TypeInfoPanel';
import { TypeInstanceViewer } from './TypeInstanceViewer';
import { MappingProgressBar, KeyboardShortcutsHint } from './MappingProgressBar';

import {
  useTypeNavigation,
  getStatusCounts,
} from '@/hooks/use-type-navigation';
import {
  useModelTypes,
  useTypeMappingSummary,
  useUpdateTypeMapping,
  useCreateTypeMapping,
  type IFCType,
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

        {/* Status Filter Tabs - Smaller */}
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
              <TypeInstanceViewer
                modelId={modelId}
                typeId={currentType.id}
                className="flex-1 min-h-0"
              />
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

