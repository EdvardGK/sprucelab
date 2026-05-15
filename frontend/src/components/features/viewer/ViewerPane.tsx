import * as React from 'react';
import { X } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Reusable viewer-pane shell used across every dashboard that embeds a
 * BIM viewer next to a data rail. The shell is intentionally predictable:
 * header bar (optional) + canvas slot + optional rail slot in one of three
 * orientations. Parent owns width/height via `className`; ViewerPane fills
 * its container.
 *
 * Use it instead of a bespoke `<Card>` + viewer + sibling `<Card>` rail —
 * keeps spacing, borders, and behavior identical between the Type page,
 * Model dashboard, fullscreen overlays, and any embed surface.
 */
export interface ViewerPaneProps {
  /** Outer className — parent decides width / height (e.g. `h-full w-full`, `flex-1`). */
  className?: string;
  /** Stable id for the DashboardTile (data-tile-id, useful for embed bindings). */
  id?: string;

  /** Title text or node. When undefined and no other header content is set, the header bar is omitted. */
  title?: React.ReactNode;
  /** Icon rendered before the title. */
  icon?: React.ReactNode;
  /** Right-aligned subtitle/hint placed beside the title. */
  subtitle?: React.ReactNode;
  /** Buttons or badges placed in the header-right cluster, before the optional clear-X. */
  headerActions?: React.ReactNode;
  /** Render a clear (X) button at the far-right of the header. */
  onClear?: () => void;
  /** Tooltip on the clear button. */
  clearTitle?: string;

  /** Main canvas content — viewer canvas, footprint view, empty state, anything. */
  children: React.ReactNode;

  /** Optional rail/sidebar content. When undefined the rail slot is collapsed. */
  rail?: React.ReactNode;
  /** Rail position. Default `right`. */
  railSide?: 'right' | 'left' | 'bottom';
  /** Override the default Tailwind classes on the rail container. */
  railClassName?: string;
}

const DEFAULT_RAIL_CLASS: Record<NonNullable<ViewerPaneProps['railSide']>, string> = {
  right:
    'w-[clamp(280px,22vw,420px)] shrink-0 border-l border-border/60 overflow-y-auto bg-muted/10',
  left:
    'w-[clamp(280px,22vw,420px)] shrink-0 border-r border-border/60 overflow-y-auto bg-muted/10',
  bottom:
    'h-[clamp(160px,24vh,260px)] shrink-0 border-t border-border/60 overflow-y-auto bg-muted/10 w-full',
};

export function ViewerPane({
  className,
  id = 'viewer-pane',
  title,
  icon,
  subtitle,
  headerActions,
  onClear,
  clearTitle,
  children,
  rail,
  railSide = 'right',
  railClassName,
}: ViewerPaneProps) {
  const hasHeader =
    title !== undefined ||
    icon !== undefined ||
    subtitle !== undefined ||
    headerActions !== undefined ||
    onClear !== undefined;

  const bodyDirection = railSide === 'bottom' ? 'flex-col' : 'flex-row';

  return (
    <DashboardTile
      id={id}
      className={cn('p-0 flex flex-col h-full overflow-hidden', className)}
    >
      {hasHeader && (
        <div className="flex items-center justify-between px-[clamp(0.5rem,1vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-[clamp(0.375rem,0.5vw,0.625rem)] min-w-0">
            {icon !== undefined && <span className="shrink-0 flex items-center">{icon}</span>}
            {title !== undefined && (
              <h2 className="text-[clamp(0.7rem,0.9vw,0.95rem)] font-medium truncate">
                {title}
              </h2>
            )}
            {subtitle !== undefined && (
              <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums truncate">
                {subtitle}
              </span>
            )}
          </div>
          {(headerActions || onClear) && (
            <div className="flex items-center gap-1 shrink-0">
              {headerActions}
              {onClear && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClear}
                  className="h-[clamp(1rem,1.5vw,1.5rem)] w-[clamp(1rem,1.5vw,1.5rem)] p-0"
                  title={clearTitle}
                  aria-label={clearTitle}
                >
                  <X className="h-[clamp(0.625rem,0.9vw,0.875rem)] w-[clamp(0.625rem,0.9vw,0.875rem)]" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className={cn('flex-1 min-h-0 flex', bodyDirection)}>
        {rail && railSide === 'left' && (
          <div className={railClassName ?? DEFAULT_RAIL_CLASS.left}>{rail}</div>
        )}
        <div className="flex-1 min-w-0 min-h-0 relative">{children}</div>
        {rail && (railSide === 'right' || railSide === 'bottom') && (
          <div className={railClassName ?? DEFAULT_RAIL_CLASS[railSide]}>{rail}</div>
        )}
      </div>
    </DashboardTile>
  );
}
