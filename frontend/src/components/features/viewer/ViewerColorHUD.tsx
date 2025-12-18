/**
 * ViewerColorHUD - Bottom center HUD for color modes and filter presets
 *
 * Features:
 * - Color by Model: Each model gets a distinct color
 * - Color by Property: Pick a property, color elements by value
 * - Presets: Saved filter/color combinations
 * - Auto-fades when idle
 *
 * SIZING: Comfortable pill bar with 14px text, proper padding
 * Buttons have min-height of 40px for easy clicking
 */

import { useState, useEffect, useCallback } from 'react';
import { Palette, Layers, Tag, Plus, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

// ============================================================================
// Types
// ============================================================================

export type ColorMode = 'none' | 'by-model' | 'by-property';

export interface FilterPreset {
  id: string;
  name: string;
  colorMode: ColorMode;
  colorProperty?: string;
  hiddenTypes?: string[];
}

export interface ModelColorInfo {
  id: string;
  name: string;
  color: string;
}

interface ViewerColorHUDProps {
  // Color mode state
  colorMode: ColorMode;
  colorProperty?: string;
  onColorModeChange: (mode: ColorMode, property?: string) => void;

  // Available options
  modelColors: ModelColorInfo[];
  availableProperties: string[];

  // Presets
  presets: FilterPreset[];
  activePreset?: string;
  onLoadPreset: (preset: FilterPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;

  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ViewerColorHUD({
  colorMode,
  colorProperty,
  onColorModeChange,
  modelColors,
  availableProperties,
  presets,
  activePreset,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  className,
}: ViewerColorHUDProps) {
  const [isIdle, setIsIdle] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Auto-fade after 3 seconds of no interaction
  useEffect(() => {
    const timer = setTimeout(() => setIsIdle(true), 3000);
    return () => clearTimeout(timer);
  }, [colorMode, colorProperty, activePreset]);

  const handleMouseEnter = useCallback(() => setIsIdle(false), []);

  const handleSavePreset = useCallback(() => {
    if (newPresetName.trim()) {
      onSavePreset(newPresetName.trim());
      setNewPresetName('');
      setSaveDialogOpen(false);
    }
  }, [newPresetName, onSavePreset]);

  const colorModeLabel =
    colorMode === 'none'
      ? 'Default'
      : colorMode === 'by-model'
      ? 'By Model'
      : `By ${colorProperty || 'Property'}`;

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        className={cn(
          // Comfortable pill bar: taller, more padding, readable text
          'flex items-center gap-3 px-4 py-2.5 rounded-2xl',
          'bg-black/80 backdrop-blur-md border border-white/15',
          'shadow-xl transition-opacity duration-300',
          isIdle ? 'opacity-50 hover:opacity-100' : 'opacity-100',
          className
        )}
      >
        {/* Color Mode Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3 text-white hover:bg-white/15 gap-2"
            >
              <Palette className="h-4 w-4" />
              <span className="text-sm font-medium">{colorModeLabel}</span>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56 p-2">
            <DropdownMenuItem onClick={() => onColorModeChange('none')} className="py-2.5 px-3">
              <X className="h-4 w-4 mr-3 opacity-50" />
              <span className="text-sm">Default Colors</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onColorModeChange('by-model')} className="py-2.5 px-3">
              <Layers className="h-4 w-4 mr-3" />
              <span className="text-sm">Color by Model</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-2" />
            <div className="px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wide">
              Color by Property
            </div>
            {availableProperties.length > 0 ? (
              availableProperties.slice(0, 10).map((prop) => (
                <DropdownMenuItem
                  key={prop}
                  onClick={() => onColorModeChange('by-property', prop)}
                  className="py-2.5 px-3"
                >
                  <Tag className="h-4 w-4 mr-3 opacity-50" />
                  <span className="text-sm">{prop}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-text-tertiary italic">
                No properties available
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div className="w-px h-6 bg-white/25" />

        {/* Model color indicators (when coloring by model) */}
        {colorMode === 'by-model' && modelColors.length > 0 && (
          <div className="flex items-center gap-1.5">
            {modelColors.slice(0, 4).map((model) => (
              <div
                key={model.id}
                title={model.name}
                className="w-5 h-5 rounded-full border-2 border-white/40"
                style={{ backgroundColor: model.color }}
              />
            ))}
            {modelColors.length > 4 && (
              <span className="text-xs text-white/70 ml-1 font-medium">
                +{modelColors.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Divider (when showing model colors) */}
        {colorMode === 'by-model' && modelColors.length > 0 && (
          <div className="w-px h-6 bg-white/25" />
        )}

        {/* Presets Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3 text-white hover:bg-white/15 gap-2"
            >
              <span className="text-sm font-medium">
                {activePreset
                  ? presets.find((p) => p.id === activePreset)?.name || 'Preset'
                  : 'Presets'}
              </span>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56 p-2">
            {presets.length > 0 ? (
              presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => onLoadPreset(preset)}
                  className="flex items-center justify-between py-2.5 px-3 group"
                >
                  <span className="text-sm">{preset.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePreset(preset.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-error p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-text-tertiary italic text-center">
                No saved presets
              </div>
            )}
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem onClick={() => setSaveDialogOpen(true)} className="py-2.5 px-3">
              <Plus className="h-4 w-4 mr-3" />
              <span className="text-sm">Save Current View</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Save Preset Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-lg">Save Preset</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Preset name"
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              autoFocus
              className="h-11 text-base"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)} className="h-10">
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!newPresetName.trim()} className="h-10">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
