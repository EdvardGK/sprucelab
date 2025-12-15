/**
 * Viewer Context Menu
 *
 * Right-click context menu for the BIM viewer providing:
 * - Add section plane (perpendicular to clicked surface)
 * - Hide/Isolate element types
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EyeOff, Focus, Eye, ArrowRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type SectionOrientation } from '@/hooks/useSectionPlanes';

export interface ContextMenuTarget {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  ifcType?: string;
  expressId?: number;
}

interface ViewerContextMenuProps {
  // Position for the menu
  position: { x: number; y: number } | null;
  // Target info from raycast
  target: ContextMenuTarget | null;
  // Whether we can add more planes
  canAddPlane: boolean;
  // Current number of planes
  planeCount: number;

  // Callbacks
  onAddSectionPlane: (point: THREE.Vector3, normal: THREE.Vector3, orientation: SectionOrientation) => void;
  onHideType: (ifcType: string) => void;
  onIsolateType: (ifcType: string) => void;
  onShowAllTypes: () => void;
  onClose: () => void;
}

export function ViewerContextMenu({
  position,
  target,
  canAddPlane,
  planeCount,
  onAddSectionPlane,
  onHideType,
  onIsolateType,
  onShowAllTypes,
  onClose,
}: ViewerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Add listeners after a short delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  if (!position || !target) return null;

  const menuItemClass = cn(
    'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer',
    'hover:bg-accent hover:text-accent-foreground',
    'transition-colors rounded-sm'
  );

  const disabledClass = 'opacity-50 pointer-events-none';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Section Plane Options */}
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Add Section Plane
      </div>

      {/* Horizontal Section (floor plan cut) */}
      <div
        className={cn(menuItemClass, !canAddPlane && disabledClass)}
        onClick={() => {
          if (canAddPlane) {
            onAddSectionPlane(target.point, target.normal, 'horizontal');
            onClose();
          }
        }}
      >
        <Layers className="h-4 w-4 text-blue-500" />
        <span>Horizontal Cut</span>
        <span className="ml-auto text-xs text-muted-foreground">floor plan</span>
      </div>

      {/* Vertical Section (starts as N-S, use Q to rotate 90°) */}
      <div
        className={cn(menuItemClass, !canAddPlane && disabledClass)}
        onClick={() => {
          if (canAddPlane) {
            onAddSectionPlane(target.point, target.normal, 'vertical-x');
            onClose();
          }
        }}
      >
        <ArrowRight className="h-4 w-4 text-red-500" />
        <span>Vertical Cut</span>
        <span className="ml-auto text-xs text-muted-foreground">Q to rotate</span>
      </div>

      {!canAddPlane && (
        <div className="px-3 py-1 text-xs text-muted-foreground">
          Max {planeCount} planes reached
        </div>
      )}

      {/* Type-specific actions (only if we know the type) */}
      {target.ifcType && (
        <>
          <div className="-mx-1 my-1 h-px bg-border" />

          <div
            className={menuItemClass}
            onClick={() => {
              onHideType(target.ifcType!);
              onClose();
            }}
          >
            <EyeOff className="h-4 w-4" />
            <span>Hide all {target.ifcType}</span>
          </div>

          <div
            className={menuItemClass}
            onClick={() => {
              onIsolateType(target.ifcType!);
              onClose();
            }}
          >
            <Focus className="h-4 w-4" />
            <span>Isolate {target.ifcType}</span>
          </div>
        </>
      )}

      <div className="-mx-1 my-1 h-px bg-border" />

      <div
        className={menuItemClass}
        onClick={() => {
          onShowAllTypes();
          onClose();
        }}
      >
        <Eye className="h-4 w-4" />
        <span>Show All Types</span>
      </div>
    </div>
  );
}

/**
 * Hook to manage context menu state
 */
export function useViewerContextMenu() {
  const [menuState, setMenuState] = useState<{
    position: { x: number; y: number } | null;
    target: ContextMenuTarget | null;
  }>({
    position: null,
    target: null,
  });

  const openMenu = (
    position: { x: number; y: number },
    target: ContextMenuTarget
  ) => {
    setMenuState({ position, target });
  };

  const closeMenu = () => {
    setMenuState({ position: null, target: null });
  };

  return {
    position: menuState.position,
    target: menuState.target,
    openMenu,
    closeMenu,
    isOpen: menuState.position !== null,
  };
}
