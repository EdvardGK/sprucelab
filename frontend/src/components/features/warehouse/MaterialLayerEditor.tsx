/**
 * Material Layer Editor
 *
 * Editable list of material layers for type definitions.
 * Each layer has: material name, thickness (mm), and optional EPD ID.
 *
 * Used in TypeMappingWorkspace to define the composition of building elements.
 */

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export interface Layer {
  id?: string;
  layer_order: number;
  material_name: string;
  thickness_mm: number;
  epd_id: string | null;
  notes?: string;
}

interface MaterialLayerEditorProps {
  typeMappingId: string | null;
  initialLayers?: Layer[];
  onSave?: (layers: Layer[]) => void;
  onChange?: (layers: Layer[]) => void;
  className?: string;
  compact?: boolean;
}

export function MaterialLayerEditor({
  typeMappingId,
  initialLayers = [],
  onSave,
  onChange,
  className,
  compact = false,
}: MaterialLayerEditorProps) {
  const { t } = useTranslation();
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [hasChanges, setHasChanges] = useState(false);

  // Update layers when initialLayers changes
  useEffect(() => {
    setLayers(initialLayers);
    setHasChanges(false);
  }, [initialLayers]);

  // Notify parent of changes
  useEffect(() => {
    if (hasChanges) {
      onChange?.(layers);
    }
  }, [layers, hasChanges, onChange]);

  const addLayer = useCallback(() => {
    const newOrder = layers.length > 0
      ? Math.max(...layers.map(l => l.layer_order)) + 1
      : 1;

    setLayers(prev => [
      ...prev,
      {
        layer_order: newOrder,
        material_name: '',
        thickness_mm: 0,
        epd_id: null,
      },
    ]);
    setHasChanges(true);
  }, [layers]);

  const removeLayer = useCallback((index: number) => {
    setLayers(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Renumber layers
      return updated.map((layer, i) => ({
        ...layer,
        layer_order: i + 1,
      }));
    });
    setHasChanges(true);
  }, []);

  const updateLayer = useCallback((index: number, field: keyof Layer, value: string | number | null) => {
    setLayers(prev => prev.map((layer, i) => {
      if (i !== index) return layer;
      return { ...layer, [field]: value };
    }));
    setHasChanges(true);
  }, []);

  const moveLayer = useCallback((index: number, direction: 'up' | 'down') => {
    setLayers(prev => {
      const newLayers = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newLayers.length) return prev;

      // Swap
      [newLayers[index], newLayers[targetIndex]] = [newLayers[targetIndex], newLayers[index]];

      // Renumber
      return newLayers.map((layer, i) => ({
        ...layer,
        layer_order: i + 1,
      }));
    });
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!typeMappingId || layers.length === 0) return;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/entities/type-definition-layers/bulk-update/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_mapping_id: typeMappingId,
          layers: layers.map(l => ({
            layer_order: l.layer_order,
            material_name: l.material_name,
            thickness_mm: l.thickness_mm,
            epd_id: l.epd_id || null,
            notes: l.notes || '',
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save layers');
      }

      const result = await response.json();
      setLayers(result.layers);
      setHasChanges(false);
      onSave?.(result.layers);
    } catch (error) {
      console.error('Failed to save layers:', error);
    } finally {
      setIsSaving(false);
    }
  }, [typeMappingId, layers, onSave]);

  // Calculate total thickness
  const totalThickness = layers.reduce((sum, l) => sum + (l.thickness_mm || 0), 0);

  // Compact header view
  if (compact && !isExpanded) {
    return (
      <div className={cn('border border-border-primary rounded-lg', className)}>
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between p-3 hover:bg-background-secondary transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              {t('warehouse.layers.title', 'Material Layers')}
            </span>
            {layers.length > 0 && (
              <span className="text-xs text-text-secondary">
                ({layers.length} {layers.length === 1 ? 'layer' : 'layers'}, {totalThickness}mm)
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-text-secondary" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn('border border-border-primary rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-background-secondary border-b border-border-primary">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">
            {t('warehouse.layers.title', 'Material Layers')}
          </span>
          {totalThickness > 0 && (
            <span className="text-xs text-text-secondary bg-background-primary px-2 py-0.5 rounded">
              {totalThickness}mm total
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {compact && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={addLayer}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Layer list */}
      <div className="p-3 space-y-2">
        {layers.length === 0 ? (
          <div className="text-center py-6 text-text-secondary">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('warehouse.layers.empty', 'No layers defined')}</p>
            <p className="text-xs mt-1">{t('warehouse.layers.addHint', 'Click "Add" to add material layers')}</p>
          </div>
        ) : (
          layers.map((layer, index) => (
            <div
              key={`${layer.layer_order}-${index}`}
              className="flex items-center gap-2 p-2 bg-background-secondary rounded border border-border-primary"
            >
              {/* Drag handle / order indicator */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={() => moveLayer(index, 'up')}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-background-primary rounded disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <span className="text-xs text-text-tertiary font-mono w-4 text-center">
                  {layer.layer_order}
                </span>
                <button
                  onClick={() => moveLayer(index, 'down')}
                  disabled={index === layers.length - 1}
                  className="p-0.5 hover:bg-background-primary rounded disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              {/* Material name */}
              <div className="flex-1 min-w-0">
                <Input
                  value={layer.material_name}
                  onChange={(e) => updateLayer(index, 'material_name', e.target.value)}
                  placeholder={t('warehouse.layers.materialPlaceholder', 'Material name')}
                  className="h-8 text-sm"
                />
              </div>

              {/* Thickness */}
              <div className="w-24">
                <div className="relative">
                  <Input
                    type="number"
                    value={layer.thickness_mm || ''}
                    onChange={(e) => updateLayer(index, 'thickness_mm', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="h-8 text-sm pr-8"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary">
                    mm
                  </span>
                </div>
              </div>

              {/* EPD ID */}
              <div className="w-32">
                <Input
                  value={layer.epd_id || ''}
                  onChange={(e) => updateLayer(index, 'epd_id', e.target.value || null)}
                  placeholder={t('warehouse.layers.epdPlaceholder', 'EPD ID')}
                  className="h-8 text-sm"
                />
              </div>

              {/* Remove button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeLayer(index)}
                className="h-8 w-8 p-0 text-text-tertiary hover:text-status-error"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Footer with save button */}
      {layers.length > 0 && typeMappingId && (
        <div className="flex items-center justify-between p-3 border-t border-border-primary bg-background-secondary">
          <span className="text-xs text-text-secondary">
            {hasChanges ? t('warehouse.layers.unsaved', 'Unsaved changes') : t('warehouse.layers.saved', 'All changes saved')}
          </span>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            size="sm"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {t('common.save', 'Save')}
          </Button>
        </div>
      )}
    </div>
  );
}
