/**
 * Canvas Overlays — HUD elements positioned on top of the 3D canvas
 *
 * 1. SectionFloat: Active section planes on top-right
 * 2. ViewerHUD: Floating toolbar at bottom-center (tools only)
 * 3. CanvasStatusPanel: Floating info panel at bottom-right (filters, sections, measurements, camera)
 *
 * (TypeToolbar was retired in favour of <ViewerFilterPanel> on the left edge.)
 */

import { useTranslation } from 'react-i18next';
import {
  Eye,
  X,
  Scissors,
  Ruler,
  Box,
  Maximize,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionPlane } from '@/hooks/useSectionPlanes';

// ── Shared types ──

export interface ActiveFilter {
  id: string;
  label: string;
}

export type ViewerTool = 'select' | 'section' | 'measure';
export type ViewMode = 'perspective' | 'wireframe' | 'xray';


// ═══ SECTION FLOAT ═══

const PLANE_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'];

interface SectionFloatProps {
  planes: SectionPlane[];
  activePlaneId: string | null;
  onSelectPlane: (id: string | null) => void;
  onDeletePlane: (id: string) => void;
  className?: string;
}

export function SectionFloat({ planes, activePlaneId, onSelectPlane, onDeletePlane, className }: SectionFloatProps) {
  const { t } = useTranslation();

  if (planes.length === 0) return null;

  return (
    <div className={cn(
      'absolute top-2 right-2 z-[5] flex flex-col gap-0.5 min-w-[130px]',
      'bg-[rgba(15,19,33,0.8)] backdrop-blur-[12px]',
      'border border-white/[0.08] rounded-[5px] p-[5px]',
      className,
    )}>
      <div className="text-[8px] font-bold uppercase tracking-wider text-white/30 px-[3px] pb-0.5">
        {t('viewer.sections.title')}
      </div>
      {planes.map((plane, i) => (
        <div
          key={plane.id}
          onClick={() => onSelectPlane(activePlaneId === plane.id ? null : plane.id)}
          className={cn(
            'flex items-center gap-[5px] px-1 py-[3px] rounded-[3px] text-[9.5px] cursor-pointer transition-colors group',
            activePlaneId === plane.id
              ? 'bg-white/[0.07] text-white/80'
              : 'text-white/50 hover:bg-white/[0.05]',
          )}
        >
          <span
            className="w-[7px] h-[7px] rounded-full flex-shrink-0"
            style={{ background: PLANE_COLORS[i % PLANE_COLORS.length] }}
          />
          <span className="flex-1">{plane.label || `Plane ${i + 1}`}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDeletePlane(plane.id); }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 text-white/35 hover:text-white/80 hover:bg-white/[0.08] transition-opacity"
          >
            <X className="w-[9px] h-[9px]" />
          </button>
        </div>
      ))}
    </div>
  );
}


// ═══ VIEWER HUD (floating toolbar, bottom-center) ═══

interface ViewerHUDProps {
  activeTool: ViewerTool;
  viewMode: ViewMode;
  sectionPlaneCount: number;
  onToolChange: (tool: ViewerTool) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onFitView: () => void;
  className?: string;
}

export function ViewerHUD({
  activeTool,
  viewMode,
  sectionPlaneCount,
  onToolChange,
  onViewModeChange,
  onFitView,
  className,
}: ViewerHUDProps) {
  const { t } = useTranslation();

  return (
    <div className={cn(
      'absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10',
      'flex items-center h-[44px]',
      'bg-[rgba(15,19,33,0.85)] backdrop-blur-[14px]',
      'border border-white/[0.08] rounded-lg',
      'shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
      className,
    )}>
      {/* Axes gizmo */}
      <div className="w-[44px] h-full flex items-center justify-center flex-shrink-0 border-r border-white/[0.06]">
        <svg width="32" height="32" viewBox="0 0 48 48">
          <line x1="10" y1="38" x2="38" y2="38" stroke="#ef4444" opacity="0.5" strokeWidth="2" />
          <text x="40" y="40" fill="#ef4444" opacity="0.5" fontSize="7" fontWeight="700">X</text>
          <line x1="10" y1="38" x2="10" y2="10" stroke="#22c55e" opacity="0.5" strokeWidth="2" />
          <text x="6" y="8" fill="#22c55e" opacity="0.5" fontSize="7" fontWeight="700">Y</text>
          <line x1="10" y1="38" x2="26" y2="26" stroke="#3b82f6" opacity="0.5" strokeWidth="2" />
          <text x="28" y="24" fill="#3b82f6" opacity="0.5" fontSize="7" fontWeight="700">Z</text>
        </svg>
      </div>

      {/* Tool + view mode buttons */}
      <div className="flex items-center gap-1 px-2">
        {/* Section plane */}
        <HUDButton
          active={activeTool === 'section'}
          onClick={() => onToolChange(activeTool === 'section' ? 'select' : 'section')}
          title={`${t('viewer.toolbar.sectionPlane')} (S)`}
          badge={sectionPlaneCount > 0 ? sectionPlaneCount : undefined}
        >
          <Scissors className="w-4 h-4" />
        </HUDButton>

        {/* Measure */}
        <HUDButton
          onClick={() => onToolChange('measure')}
          title={`${t('viewer.toolbar.measure')} (M)`}
          disabled
        >
          <Ruler className="w-4 h-4" />
        </HUDButton>

        <div className="w-px h-5 bg-white/[0.06] mx-0.5" />

        {/* Perspective */}
        <HUDButton
          active={viewMode === 'perspective'}
          onClick={() => onViewModeChange('perspective')}
          title={`${t('viewer.toolbar.perspective')} (P)`}
        >
          <Box className="w-4 h-4" />
        </HUDButton>

        {/* Wireframe */}
        <HUDButton
          active={viewMode === 'wireframe'}
          onClick={() => onViewModeChange('wireframe')}
          title={`${t('viewer.toolbar.wireframe')} (W)`}
        >
          <WireframeIcon />
        </HUDButton>

        {/* X-ray */}
        <HUDButton
          active={viewMode === 'xray'}
          onClick={() => onViewModeChange('xray')}
          title={`${t('viewer.toolbar.xray')} (X)`}
        >
          <Eye className="w-4 h-4" />
        </HUDButton>

        <div className="w-px h-5 bg-white/[0.06] mx-0.5" />

        {/* Fit to view */}
        <HUDButton
          onClick={onFitView}
          title={`${t('viewer.toolbar.fitView')} (F)`}
        >
          <Maximize className="w-4 h-4" />
        </HUDButton>
      </div>
    </div>
  );
}

function HUDButton({
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
        'w-8 h-8 flex items-center justify-center rounded relative transition-all',
        disabled && 'opacity-25 cursor-default pointer-events-none',
        !disabled && !active && 'text-white/45 hover:bg-white/[0.06] hover:text-white/70 cursor-pointer',
        active && 'bg-[rgba(21,121,84,0.2)] text-[var(--accent)]',
      )}
    >
      {children}
      {badge != null && (
        <span className="absolute -top-1 -right-1 min-w-[12px] h-[12px] px-[2px] rounded-full text-[7px] font-bold leading-[12px] text-center bg-[var(--accent)] text-[var(--navy)]">
          {badge}
        </span>
      )}
    </button>
  );
}


// ═══ CANVAS STATUS PANEL (floating bottom-right) ═══

interface CanvasStatusPanelProps {
  filters: ActiveFilter[];
  planes: SectionPlane[];
  activePlaneId: string | null;
  visibleModelCount: number;
  visibleElementCount: number;
  viewMode: string;
  onRemoveFilter: (id: string) => void;
  onClearFilters: () => void;
  onSelectPlane: (id: string | null) => void;
  onDeletePlane: (id: string) => void;
  className?: string;
}

export function CanvasStatusPanel({
  filters,
  planes,
  activePlaneId,
  visibleModelCount,
  visibleElementCount,
  viewMode,
  onRemoveFilter,
  onClearFilters,
  onSelectPlane,
  onDeletePlane,
  className,
}: CanvasStatusPanelProps) {
  const { t } = useTranslation();

  const hasFilters = filters.length > 0;
  const hasPlanes = planes.length > 0;
  return (
    <div className={cn(
      'absolute bottom-2.5 right-2.5 z-10',
      'flex flex-col min-w-[180px]',
      'bg-[rgba(15,19,33,0.85)] backdrop-blur-[14px]',
      'border border-white/[0.08] rounded-[6px]',
      'shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
      'text-[9px] text-white/45 overflow-hidden',
      className,
    )}>
      {/* Filters */}
      {hasFilters && (
        <>
          <div className="flex items-center gap-[3px] flex-wrap px-2 py-[5px]">
            {filters.map(f => (
              <span
                key={f.id}
                className="flex items-center gap-[3px] px-[7px] py-[2px] rounded-[3px] text-[8.5px] font-semibold bg-[rgba(21,121,84,0.15)] text-[rgba(208,211,77,0.85)] border border-[rgba(21,121,84,0.25)] cursor-pointer hover:bg-[rgba(21,121,84,0.25)] transition-all"
              >
                {f.label}
                <button
                  onClick={() => onRemoveFilter(f.id)}
                  className="w-[10px] h-[10px] flex items-center justify-center opacity-50 hover:opacity-100"
                >
                  <X className="w-[7px] h-[7px]" />
                </button>
              </span>
            ))}
            <button
              onClick={onClearFilters}
              className="text-[8px] text-white/25 px-1 py-0.5 rounded-[3px] hover:text-white/60 hover:bg-white/[0.06] transition-all cursor-pointer"
            >
              {t('viewer.filters.reset')}
            </button>
          </div>
          <div className="h-px bg-white/[0.06]" />
        </>
      )}

      {/* Section planes */}
      {hasPlanes && (
        <>
          <div className="flex items-center gap-1 px-2 py-1">
            <span className="text-[7.5px] font-bold uppercase tracking-wider text-white/20 mr-0.5">
              {t('viewer.sections.title')}
            </span>
            {planes.map((plane, i) => (
              <div
                key={plane.id}
                onClick={() => onSelectPlane(activePlaneId === plane.id ? null : plane.id)}
                className={cn(
                  'flex items-center gap-[3px] px-[5px] py-[2px] rounded-[3px] cursor-pointer transition-colors group',
                  activePlaneId === plane.id
                    ? 'bg-white/[0.07] text-white/80'
                    : 'text-white/45 hover:bg-white/[0.05]',
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: PLANE_COLORS[i % PLANE_COLORS.length] }}
                />
                <span className="whitespace-nowrap">{plane.label || `${i + 1}`}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeletePlane(plane.id); }}
                  className="w-3 h-3 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 text-white/35 hover:text-white/80 hover:bg-white/[0.08] transition-opacity"
                >
                  <X className="w-2 h-2" />
                </button>
              </div>
            ))}
          </div>
          <div className="h-px bg-white/[0.06]" />
        </>
      )}

      {/* Camera info (always visible) */}
      <div className="flex items-center gap-2 px-2 py-[3px] text-[8px] text-white/20 tabular-nums whitespace-nowrap bg-white/[0.02]">
        <span>{visibleModelCount} mod.</span>
        <span>{visibleElementCount.toLocaleString('nb-NO')} elem.</span>
        <span className="font-semibold text-white/35 uppercase tracking-wide">
          {viewMode}
        </span>
      </div>
    </div>
  );
}


// ═══ SVG ICONS ═══

function WireframeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <line x1="3.3" x2="12" y1="7" y2="12" />
      <line x1="20.7" x2="12" y1="7" y2="12" />
      <line x1="12" x2="12" y1="22" y2="12" />
    </svg>
  );
}
