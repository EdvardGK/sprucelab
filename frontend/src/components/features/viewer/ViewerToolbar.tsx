/**
 * ViewerToolbar — Dark horizontal toolbar above the 3D canvas
 *
 * Tools: Select, Section Plane, Measure
 * View modes: Perspective, Wireframe, X-ray
 * Actions: Fit to view
 * Right side: breadcrumb showing spatial context
 */

import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  Scissors,
  Ruler,
  Box,
  Eye,
  Maximize,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewerTool = 'select' | 'section' | 'measure';
export type ViewMode = 'perspective' | 'wireframe' | 'xray';

interface ViewerToolbarProps {
  activeTool: ViewerTool;
  viewMode: ViewMode;
  sectionPlaneCount: number;
  breadcrumb?: string[];
  onToolChange: (tool: ViewerTool) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onFitView: () => void;
  className?: string;
}

export function ViewerToolbar({
  activeTool,
  viewMode,
  sectionPlaneCount,
  breadcrumb,
  onToolChange,
  onViewModeChange,
  onFitView,
  className,
}: ViewerToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-1 bg-white/[0.03] border-b border-white/[0.05] flex-shrink-0 z-[3]',
      className,
    )}>
      {/* Tools */}
      <ToolButton
        active={activeTool === 'select'}
        onClick={() => onToolChange('select')}
        title={`${t('viewer.toolbar.select')} (V)`}
      >
        <MousePointer2 className="w-3 h-3" />
      </ToolButton>

      <ToolButton
        active={activeTool === 'section'}
        onClick={() => onToolChange('section')}
        title={`${t('viewer.toolbar.sectionPlane')} (S)`}
        badge={sectionPlaneCount > 0 ? sectionPlaneCount : undefined}
      >
        <Scissors className="w-3 h-3" />
      </ToolButton>

      <ToolButton
        active={activeTool === 'measure'}
        onClick={() => onToolChange('measure')}
        title={`${t('viewer.toolbar.measure')} (M)`}
        disabled
      >
        <Ruler className="w-3 h-3" />
      </ToolButton>

      <div className="w-px h-4 bg-white/[0.05] mx-0.5" />

      {/* View modes */}
      <ToolButton
        active={viewMode === 'perspective'}
        onClick={() => onViewModeChange('perspective')}
        title={`${t('viewer.toolbar.perspective')} (P)`}
      >
        <Box className="w-3 h-3" />
      </ToolButton>

      <ToolButton
        active={viewMode === 'wireframe'}
        onClick={() => onViewModeChange('wireframe')}
        title={`${t('viewer.toolbar.wireframe')} (W)`}
      >
        <WireframeIcon />
      </ToolButton>

      <ToolButton
        active={viewMode === 'xray'}
        onClick={() => onViewModeChange('xray')}
        title={`${t('viewer.toolbar.xray')} (X)`}
      >
        <Eye className="w-3 h-3" />
      </ToolButton>

      <div className="w-px h-4 bg-white/[0.05] mx-0.5" />

      {/* Fit to view */}
      <ToolButton
        onClick={onFitView}
        title={`${t('viewer.toolbar.fitView')} (F)`}
      >
        <Maximize className="w-3 h-3" />
      </ToolButton>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-white/30">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
              <span className={cn(
                'font-medium',
                i === breadcrumb.length - 1 ? 'text-[var(--accent)]' : 'text-white/55',
              )}>
                {crumb}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ToolButton ──

function ToolButton({
  active,
  disabled,
  badge,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      className={cn(
        'w-7 h-7 flex items-center justify-center border rounded relative transition-all',
        disabled && 'opacity-25 cursor-default pointer-events-none',
        !disabled && !active && 'border-white/[0.08] bg-transparent text-white/40 hover:bg-white/[0.06] hover:text-white/70 hover:border-white/[0.15] cursor-pointer',
        active && 'bg-[rgba(21,121,84,0.2)] text-[var(--accent)] border-[rgba(21,121,84,0.4)]',
      )}
    >
      {children}
      {badge != null && (
        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full text-[8px] font-bold leading-[14px] text-center bg-[var(--accent)] text-[var(--navy)]">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Custom wireframe icon ──

function WireframeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <line x1="3.3" x2="12" y1="7" y2="12" />
      <line x1="20.7" x2="12" y1="7" y2="12" />
      <line x1="12" x2="12" y1="22" y2="12" />
    </svg>
  );
}
