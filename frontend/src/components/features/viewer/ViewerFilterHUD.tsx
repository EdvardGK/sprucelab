/**
 * ViewerFilterHUD - Compact HUD for filtering IFC elements by type
 *
 * Displays auto-discovered IFC types as clickable pills at the center-bottom of the viewer.
 * Click a pill to toggle visibility of that element type.
 */

import { Box, Layers, Minus, Square, DoorOpen, Grid3X3, Footprints, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TypeInfo {
  type: string;
  count: number;
  visible: boolean;
}

interface ViewerFilterHUDProps {
  types: TypeInfo[];
  onToggleType: (type: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  className?: string;
}

// Map IFC types to icons and short display names
const TYPE_CONFIG: Record<string, { icon: React.ElementType; shortName: string }> = {
  IfcWall: { icon: Square, shortName: 'Wall' },
  IfcDoor: { icon: DoorOpen, shortName: 'Door' },
  IfcWindow: { icon: Grid3X3, shortName: 'Window' },
  IfcSlab: { icon: Layers, shortName: 'Slab' },
  IfcBeam: { icon: Minus, shortName: 'Beam' },
  IfcColumn: { icon: CircleDot, shortName: 'Column' },
  IfcStair: { icon: Footprints, shortName: 'Stair' },
  IfcRailing: { icon: Minus, shortName: 'Railing' },
  IfcRoof: { icon: Layers, shortName: 'Roof' },
  IfcCurtainWall: { icon: Grid3X3, shortName: 'Curtain' },
  IfcPlate: { icon: Layers, shortName: 'Plate' },
  IfcMember: { icon: Minus, shortName: 'Member' },
  IfcFooting: { icon: Layers, shortName: 'Footing' },
  IfcPile: { icon: CircleDot, shortName: 'Pile' },
  IfcCovering: { icon: Layers, shortName: 'Cover' },
  IfcFurnishingElement: { icon: Box, shortName: 'Furn.' },
  IfcBuildingElementProxy: { icon: Box, shortName: 'Proxy' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || {
    icon: Box,
    shortName: type.replace('Ifc', '').slice(0, 6),
  };
}

export function ViewerFilterHUD({
  types,
  onToggleType,
  onShowAll,
  onHideAll,
  className,
}: ViewerFilterHUDProps) {
  if (types.length === 0) return null;

  const allVisible = types.every(t => t.visible);
  const noneVisible = types.every(t => !t.visible);

  return (
    <div
      className={cn(
        'absolute bottom-4 left-1/2 -translate-x-1/2 z-20',
        'flex items-center gap-1 px-2 py-1.5',
        'bg-black/70 backdrop-blur-sm rounded-full',
        'shadow-lg border border-white/10',
        className
      )}
    >
      {/* All/None buttons */}
      <button
        onClick={onShowAll}
        className={cn(
          'px-2 py-1 rounded-full text-[10px] font-medium transition-all',
          allVisible
            ? 'bg-white/20 text-white'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        )}
      >
        All
      </button>
      <button
        onClick={onHideAll}
        className={cn(
          'px-2 py-1 rounded-full text-[10px] font-medium transition-all',
          noneVisible
            ? 'bg-white/20 text-white'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        )}
      >
        None
      </button>

      <div className="w-px h-4 bg-white/20 mx-1" />

      {/* Type pills */}
      {types.map(({ type, count, visible }) => {
        const config = getTypeConfig(type);
        const Icon = config.icon;

        return (
          <button
            key={type}
            onClick={() => onToggleType(type)}
            title={`${type} (${count})`}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all',
              visible
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{config.shortName}</span>
            <span className={cn(
              'ml-0.5 tabular-nums',
              visible ? 'text-white/70' : 'text-white/30'
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
