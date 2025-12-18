/**
 * ViewerTypeToolbar - Blender-style vertical toolbar for element type filtering
 *
 * Left sidebar with icons for each IFC element type.
 * - Click: Toggle visibility
 * - Shift+Click: Isolate (solo)
 * - Icons dim when type is hidden
 *
 * SIZING: Uses comfortable proportions - buttons are 56px, icons 24px
 * Toolbar width is 64px for breathing room
 */

import { useCallback } from 'react';
import {
  Square,
  Layers,
  DoorOpen,
  Grid3X3,
  CircleDot,
  Minus,
  Home,
  Footprints,
  Box,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================================================
// Types
// ============================================================================

export interface TypeInfo {
  type: string;
  count: number;
  visible: boolean;
}

interface ViewerTypeToolbarProps {
  types: TypeInfo[];
  onToggle: (type: string) => void;
  onIsolate: (type: string) => void;
  className?: string;
}

// ============================================================================
// Type Configuration
// ============================================================================

// Priority order for display (most common types first)
const TYPE_PRIORITY = [
  'IfcWall',
  'IfcSlab',
  'IfcDoor',
  'IfcWindow',
  'IfcColumn',
  'IfcBeam',
  'IfcRoof',
  'IfcStair',
  'IfcRailing',
  'IfcCurtainWall',
  'IfcPlate',
  'IfcMember',
  'IfcFooting',
  'IfcCovering',
  'IfcFurnishingElement',
  'IfcBuildingElementProxy',
];

// Icon mapping for IFC types
const TYPE_ICONS: Record<string, React.ElementType> = {
  IfcWall: Square,
  IfcSlab: Layers,
  IfcDoor: DoorOpen,
  IfcWindow: Grid3X3,
  IfcColumn: CircleDot,
  IfcBeam: Minus,
  IfcRoof: Home,
  IfcStair: Footprints,
  IfcRailing: Minus,
  IfcCurtainWall: Grid3X3,
  IfcPlate: Layers,
  IfcMember: Minus,
  IfcFooting: Layers,
  IfcCovering: Layers,
  IfcFurnishingElement: Box,
  IfcBuildingElementProxy: Box,
};

// Short names for display
const TYPE_SHORT_NAMES: Record<string, string> = {
  IfcWall: 'Wall',
  IfcSlab: 'Slab',
  IfcDoor: 'Door',
  IfcWindow: 'Window',
  IfcColumn: 'Column',
  IfcBeam: 'Beam',
  IfcRoof: 'Roof',
  IfcStair: 'Stair',
  IfcRailing: 'Railing',
  IfcCurtainWall: 'Curtain',
  IfcPlate: 'Plate',
  IfcMember: 'Member',
  IfcFooting: 'Footing',
  IfcCovering: 'Cover',
  IfcFurnishingElement: 'Furniture',
  IfcBuildingElementProxy: 'Proxy',
};

const MAX_VISIBLE_TYPES = 6; // Show up to 6 types (larger buttons = fewer fit)

// ============================================================================
// Component
// ============================================================================

export function ViewerTypeToolbar({
  types,
  onToggle,
  onIsolate,
  className,
}: ViewerTypeToolbarProps) {
  // Sort types by priority and count
  const sortedTypes = [...types].sort((a, b) => {
    const aPriority = TYPE_PRIORITY.indexOf(a.type);
    const bPriority = TYPE_PRIORITY.indexOf(b.type);
    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    if (aPriority !== -1) return -1;
    if (bPriority !== -1) return 1;
    return b.count - a.count;
  });

  // Split into visible and overflow
  const visibleTypes = sortedTypes.slice(0, MAX_VISIBLE_TYPES);
  const overflowTypes = sortedTypes.slice(MAX_VISIBLE_TYPES);

  // Handle click with shift detection
  const handleClick = useCallback(
    (type: string, e: React.MouseEvent) => {
      if (e.shiftKey) {
        onIsolate(type);
      } else {
        onToggle(type);
      }
    },
    [onToggle, onIsolate]
  );

  if (types.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          // Comfortable width: 64px gives breathing room
          'w-16 bg-surface border-r border-border flex flex-col items-center py-3 gap-2',
          className
        )}
      >
        {/* Visible type buttons */}
        {visibleTypes.map((typeInfo) => (
          <TypeButton
            key={typeInfo.type}
            typeInfo={typeInfo}
            onClick={handleClick}
          />
        ))}

        {/* Overflow menu */}
        {overflowTypes.length > 0 && (
          <OverflowMenu
            types={overflowTypes}
            onToggle={onToggle}
            onIsolate={onIsolate}
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Show all at bottom */}
        <div className="border-t border-border pt-3 mt-2 w-full flex flex-col items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => types.forEach((t) => !t.visible && onToggle(t.type))}
                className="w-12 h-10 rounded-lg flex items-center justify-center text-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                All
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-sm">Show all types</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function TypeButton({
  typeInfo,
  onClick,
}: {
  typeInfo: TypeInfo;
  onClick: (type: string, e: React.MouseEvent) => void;
}) {
  const Icon = TYPE_ICONS[typeInfo.type] || Box;
  const shortName = TYPE_SHORT_NAMES[typeInfo.type] || typeInfo.type.replace('Ifc', '');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => onClick(typeInfo.type, e)}
          className={cn(
            // Comfortable size: 52x52px buttons with proper spacing
            'w-13 h-13 rounded-xl flex flex-col items-center justify-center gap-1 transition-all',
            // Use w-[52px] h-[52px] for exact sizing
            'min-w-[52px] min-h-[52px]',
            typeInfo.visible
              ? 'bg-accent/20 text-accent hover:bg-accent/30'
              : 'text-text-tertiary/50 hover:text-text-tertiary hover:bg-surface-hover'
          )}
        >
          {/* Larger icons: 20px */}
          <Icon className="h-5 w-5" />
          {/* Readable count: 11px */}
          <span className="text-[11px] font-medium tabular-nums">
            {typeInfo.count}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex flex-col gap-1 p-3">
        <p className="font-semibold text-sm">{shortName}</p>
        <p className="text-sm text-text-secondary">
          {typeInfo.count} elements {typeInfo.visible ? '(visible)' : '(hidden)'}
        </p>
        <p className="text-xs text-text-tertiary mt-1 pt-1 border-t border-border">
          Click: Toggle | Shift+Click: Isolate
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function OverflowMenu({
  types,
  onToggle,
  onIsolate,
}: {
  types: TypeInfo[];
  onToggle: (type: string) => void;
  onIsolate: (type: string) => void;
}) {
  const hiddenCount = types.filter((t) => !t.visible).length;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                // Match TypeButton sizing
                'min-w-[52px] min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all',
                'text-text-tertiary hover:text-text-primary hover:bg-surface-hover',
                hiddenCount > 0 && 'ring-2 ring-warning/50'
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[11px] font-medium">+{types.length}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" className="p-3">
          <p className="text-sm">{types.length} more types</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent side="right" align="start" className="w-56 p-2">
        {types.map((typeInfo) => {
          const shortName =
            TYPE_SHORT_NAMES[typeInfo.type] || typeInfo.type.replace('Ifc', '');
          return (
            <DropdownMenuItem
              key={typeInfo.type}
              onClick={(e) => {
                if (e.shiftKey) {
                  onIsolate(typeInfo.type);
                } else {
                  onToggle(typeInfo.type);
                }
              }}
              className={cn(
                'flex items-center justify-between cursor-pointer py-2 px-3 text-sm',
                !typeInfo.visible && 'opacity-50'
              )}
            >
              <span>{shortName}</span>
              <span className="text-sm text-text-tertiary tabular-nums">{typeInfo.count}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
