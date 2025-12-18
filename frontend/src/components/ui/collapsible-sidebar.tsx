/**
 * CollapsibleSidebar - Smooth collapsing sidebar for viewer layouts
 *
 * Features:
 * - Animates between expanded and collapsed states
 * - Shows toggle button with rotating chevron
 * - Collapsed state shows icon strip only
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface CollapsibleSidebarProps {
  side: 'left' | 'right';
  collapsed: boolean;
  onToggle: () => void;
  expandedWidth?: number;
  collapsedWidth?: number;
  children: React.ReactNode;
  className?: string;
  /** Icon to show when collapsed (optional) */
  collapsedIcon?: React.ReactNode;
  /** Title shown in header when expanded */
  title?: string;
}

const COLLAPSED_WIDTH = 48;

export function CollapsibleSidebar({
  side,
  collapsed,
  onToggle,
  expandedWidth = 256,
  collapsedWidth = COLLAPSED_WIDTH,
  children,
  className,
  collapsedIcon,
  title,
}: CollapsibleSidebarProps) {
  const isLeft = side === 'left';

  return (
    <div
      className={cn(
        'relative flex flex-col bg-surface border-border transition-all duration-200 ease-out',
        isLeft ? 'border-r' : 'border-l',
        className
      )}
      style={{
        width: collapsed ? collapsedWidth : expandedWidth,
        minWidth: collapsed ? collapsedWidth : expandedWidth,
      }}
    >
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className={cn(
          'absolute top-2 z-10 h-7 w-7 rounded-full bg-surface border border-border shadow-sm hover:bg-surface-hover',
          isLeft ? '-right-3.5' : '-left-3.5'
        )}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {isLeft ? (
          collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )
        ) : collapsed ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>

      {/* Header (when expanded) */}
      {!collapsed && title && (
        <div className="h-10 border-b border-border flex items-center px-3 flex-shrink-0">
          <h2 className="text-xs font-semibold text-text-primary truncate">{title}</h2>
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          'flex-1 overflow-hidden transition-opacity duration-200',
          collapsed ? 'opacity-0' : 'opacity-100'
        )}
      >
        {!collapsed && children}
      </div>

      {/* Collapsed Icon Strip */}
      {collapsed && collapsedIcon && (
        <div className="flex flex-col items-center pt-12 gap-2">
          <div className="text-text-tertiary">{collapsedIcon}</div>
        </div>
      )}
    </div>
  );
}
