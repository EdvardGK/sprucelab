/**
 * Type Analysis Workbench
 *
 * Main editing container for type classification and mapping.
 * Entry points:
 * - From Type Library ("Open in Workbench" button)
 * - Direct navigation to classify view
 *
 * Supports two edit modes:
 * - Focused: One type at a time, keyboard-driven (TypeMappingWorkspace)
 * - Grid: Airtable-style batch editing (TypeMappingGrid)
 */

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Focus,
  Grid3X3,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { TypeMappingWorkspace } from '../TypeMappingWorkspace';
import { TypeMappingGrid } from '../TypeMappingGrid';
import { useModels } from '@/hooks/use-models';
import { useTypeMappingSummary } from '@/hooks/use-warehouse';
import type { Model } from '@/lib/api-types';
import { cn } from '@/lib/utils';

type EditMode = 'focused' | 'grid';

interface TypeAnalysisWorkbenchProps {
  projectId: string;
  className?: string;
}

export function TypeAnalysisWorkbench({
  projectId,
  className,
}: TypeAnalysisWorkbenchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL params
  const initialModelId = searchParams.get('model') || undefined;
  const initialMode = (searchParams.get('mode') as EditMode) || 'focused';
  const selectedTypeIds = searchParams.get('types')?.split(',').filter(Boolean) || [];

  // Local state
  const [editMode, setEditMode] = useState<EditMode>(initialMode);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(initialModelId);

  // Data hooks
  const { data: models = [], isLoading: modelsLoading } = useModels(projectId);
  const { data: summary } = useTypeMappingSummary(selectedModelId || '');

  // Set initial model if none selected
  useEffect(() => {
    if (!selectedModelId && models.length > 0 && !modelsLoading) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId, modelsLoading]);

  // Sync state to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams);

    if (selectedModelId) {
      params.set('model', selectedModelId);
    } else {
      params.delete('model');
    }

    params.set('mode', editMode);

    // Preserve selected types in URL
    if (selectedTypeIds.length > 0) {
      params.set('types', selectedTypeIds.join(','));
    }

    setSearchParams(params, { replace: true });
  }, [selectedModelId, editMode, selectedTypeIds, searchParams, setSearchParams]);

  // Navigation handlers
  const handleBackToLibrary = useCallback(() => {
    // Navigate back to library view, preserving model selection
    navigate(`/projects/${projectId}/workbench?view=library${selectedModelId ? `&model=${selectedModelId}` : ''}`);
  }, [navigate, projectId, selectedModelId]);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    // Clear selected types when model changes
    const params = new URLSearchParams(searchParams);
    params.delete('types');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleModeChange = useCallback((mode: EditMode) => {
    setEditMode(mode);
  }, []);

  // Get selected model info
  const selectedModel = models.find((m: Model) => m.id === selectedModelId);

  // Progress calculations
  const totalTypes = summary?.total ?? 0;
  const mappedTypes = summary?.mapped ?? 0;
  const progressPercent = totalTypes > 0 ? Math.round((mappedTypes / totalTypes) * 100) : 0;

  return (
    <TooltipProvider>
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header Bar */}
      <div className="flex-none border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Back button + Title */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToLibrary}
              className="h-8 px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('workbench.backToLibrary')}
            </Button>

            <div className="h-5 w-px bg-border" />

            <h1 className="text-base font-semibold">
              {t('workbench.classificationTitle')}
            </h1>

            {/* Progress indicator */}
            {summary && totalTypes > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {progressPercent}%
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {mappedTypes} / {totalTypes} {t('workbench.typesMapped')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Right: Model selector + Mode toggle */}
          <div className="flex items-center gap-3">
            {/* Model Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t('workbench.model')}:
              </span>
              <Select
                value={selectedModelId || ''}
                onValueChange={handleModelChange}
                disabled={modelsLoading || models.length === 0}
              >
                <SelectTrigger className="w-56 h-8 text-sm">
                  <SelectValue placeholder={t('workbench.selectModel')} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model: Model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.original_filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-5 w-px bg-border" />

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editMode === 'focused' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleModeChange('focused')}
                    className="h-7 px-2"
                  >
                    <Focus className="h-3.5 w-3.5 mr-1" />
                    {t('workbench.focusedMode')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('workbench.focusedModeDesc')}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleModeChange('grid')}
                    className="h-7 px-2"
                  >
                    <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                    {t('workbench.gridMode')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('workbench.gridModeDesc')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Selected types info (if coming from library with selection) */}
        {selectedTypeIds.length > 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>
              {t('workbench.selectedTypesCount', { count: selectedTypeIds.length })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('types');
                setSearchParams(params, { replace: true });
              }}
              className="h-5 px-1 text-xs"
            >
              {t('common.clearSelection')}
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!selectedModelId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ChevronDown className="h-8 w-8 mb-2 animate-bounce" />
            <p className="text-sm">{t('workbench.selectModelPrompt')}</p>
          </div>
        ) : editMode === 'focused' ? (
          <TypeMappingWorkspace
            modelId={selectedModelId}
            modelFilename={selectedModel?.original_filename}
            className="h-full"
          />
        ) : (
          <TypeMappingGrid
            modelId={selectedModelId}
            modelFilename={selectedModel?.original_filename}
            className="h-full"
          />
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}

export default TypeAnalysisWorkbench;
