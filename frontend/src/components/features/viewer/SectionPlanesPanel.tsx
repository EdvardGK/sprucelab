/**
 * Section Planes Panel
 *
 * UI panel for managing section planes in the BIM viewer.
 * Displays active planes with color-coding and provides controls for:
 * - Selecting active plane (for ctrl+scroll manipulation)
 * - Deleting individual planes
 * - Clearing all planes
 */

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scissors, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionPlane } from '@/hooks/useSectionPlanes';

interface SectionPlanesPanelProps {
  planes: SectionPlane[];
  activePlaneId: string | null;
  onSelectPlane: (planeId: string | null) => void;
  onDeletePlane: (planeId: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function SectionPlanesPanel({
  planes,
  activePlaneId,
  onSelectPlane,
  onDeletePlane,
  onClearAll,
  className,
}: SectionPlanesPanelProps) {
  return (
    <Card className={cn('p-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Scissors className="h-4 w-4 text-text-secondary" />
        <h3 className="text-xs font-semibold text-text-primary">Section Planes</h3>
        {planes.length > 0 && (
          <span className="text-xs text-text-tertiary ml-auto">
            {planes.length}/4
          </span>
        )}
      </div>

      {planes.length === 0 ? (
        <p className="text-xs text-text-tertiary py-2">
          Right-click on a surface to create a section plane
        </p>
      ) : (
        <div className="space-y-1.5">
          {planes.map((plane) => (
            <div
              key={plane.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                'hover:bg-surface-hover',
                activePlaneId === plane.id && 'bg-accent/20 ring-1 ring-accent'
              )}
              onClick={() => onSelectPlane(activePlaneId === plane.id ? null : plane.id)}
            >
              {/* Color indicator */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: plane.color }}
              />

              {/* Label */}
              <span className="text-xs text-text-primary flex-1">
                {plane.label}
              </span>

              {/* Active indicator */}
              {activePlaneId === plane.id && (
                <span className="text-[10px] text-accent px-1.5 py-0.5 bg-accent/10 rounded">
                  Active
                </span>
              )}

              {/* Delete button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePlane(plane.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {/* Clear All button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2 text-xs gap-2"
            onClick={onClearAll}
          >
            <Trash2 className="h-3 w-3" />
            Clear All Planes
          </Button>

          {/* Help text for active plane */}
          {activePlaneId && (
            <div className="text-[10px] text-text-tertiary mt-2 space-y-0.5">
              <div className="font-medium text-text-secondary">Keyboard:</div>
              <div>E/R: Push/Pull</div>
              <div>Q: Rotate 90°</div>
              <div>←→↑↓: Fine rotate</div>
              <div>F: Flip | Del: Delete</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
