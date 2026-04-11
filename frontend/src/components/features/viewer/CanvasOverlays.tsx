/**
 * Canvas Overlays — HUD elements positioned on top of the 3D canvas
 *
 * 1. TypeToolbar: Vertical buttons on left edge (Vegg, Dekke, Dør, etc.)
 * 2. SectionFloat: Active section planes on top-right
 * 3. FilterHUD: Active filter pills below toolbar
 * 4. CameraInfo: Camera stats on bottom-right
 */

import { useTranslation } from 'react-i18next';
import { Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionPlane } from '@/hooks/useSectionPlanes';

// ── Shared type info ──

export interface TypeFilterInfo {
  type: string;
  visible: boolean;
  count?: number;
}

export interface ActiveFilter {
  id: string;
  label: string;
}

// ═══ TYPE TOOLBAR ═══

const IFC_TYPE_CONFIG: Record<string, { label: string; i18nKey: string; icon: React.ReactNode }> = {
  IfcWall: { label: 'Vegg', i18nKey: 'wall', icon: <WallIcon /> },
  IfcSlab: { label: 'Dekke', i18nKey: 'slab', icon: <SlabIcon /> },
  IfcDoor: { label: 'Dør', i18nKey: 'door', icon: <DoorIcon /> },
  IfcWindow: { label: 'Vindu', i18nKey: 'window', icon: <WindowIcon /> },
  IfcColumn: { label: 'Søyle', i18nKey: 'column', icon: <ColumnIcon /> },
  IfcBeam: { label: 'Bjelke', i18nKey: 'beam', icon: <BeamIcon /> },
  IfcRoof: { label: 'Tak', i18nKey: 'roof', icon: <WallIcon /> },
  IfcStair: { label: 'Trapp', i18nKey: 'stair', icon: <WallIcon /> },
  IfcRailing: { label: 'Rekkverk', i18nKey: 'railing', icon: <BeamIcon /> },
  IfcCurtainWall: { label: 'Fasade', i18nKey: 'curtainWall', icon: <WindowIcon /> },
  IfcPlate: { label: 'Plate', i18nKey: 'plate', icon: <SlabIcon /> },
  IfcMember: { label: 'Profil', i18nKey: 'member', icon: <BeamIcon /> },
  IfcFooting: { label: 'Fundament', i18nKey: 'footing', icon: <SlabIcon /> },
  IfcCovering: { label: 'Kledning', i18nKey: 'covering', icon: <SlabIcon /> },
  IfcFurnishingElement: { label: 'Inventar', i18nKey: 'furniture', icon: <ColumnIcon /> },
  IfcBuildingElementProxy: { label: 'Proxy', i18nKey: 'proxy', icon: <ColumnIcon /> },
};

// Ordered by priority
const TYPE_PRIORITY = [
  'IfcWall', 'IfcSlab', 'IfcDoor', 'IfcWindow', 'IfcColumn', 'IfcBeam',
  'IfcRoof', 'IfcStair', 'IfcRailing', 'IfcCurtainWall', 'IfcPlate',
  'IfcMember', 'IfcFooting', 'IfcCovering', 'IfcFurnishingElement',
  'IfcBuildingElementProxy',
];

const MAX_VISIBLE_TYPES = 6;

interface TypeToolbarProps {
  types: TypeFilterInfo[];
  onToggle: (type: string) => void;
  onShowAll: () => void;
  className?: string;
}

export function TypeToolbar({ types, onToggle, onShowAll, className }: TypeToolbarProps) {
  const { t } = useTranslation();

  // Sort by priority, take top N
  const sorted = [...types].sort((a, b) => {
    const ai = TYPE_PRIORITY.indexOf(a.type);
    const bi = TYPE_PRIORITY.indexOf(b.type);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const visible = sorted.slice(0, MAX_VISIBLE_TYPES);
  const hasStructural = sorted.some(t => ['IfcColumn', 'IfcBeam', 'IfcMember', 'IfcFooting'].includes(t.type));

  // Group: architectural types, then separator, then structural
  const archTypes = visible.filter(t => !['IfcColumn', 'IfcBeam', 'IfcMember', 'IfcFooting'].includes(t.type));
  const structTypes = visible.filter(t => ['IfcColumn', 'IfcBeam', 'IfcMember', 'IfcFooting'].includes(t.type));

  return (
    <div className={cn(
      'absolute top-2 left-2 z-[5] flex flex-col gap-0.5',
      'bg-[rgba(15,19,33,0.8)] backdrop-blur-[12px]',
      'border border-white/[0.08] rounded-md p-1',
      className,
    )}>
      {archTypes.map(tf => (
        <TypeButton key={tf.type} typeFilter={tf} onToggle={onToggle} />
      ))}

      {hasStructural && archTypes.length > 0 && structTypes.length > 0 && (
        <div className="h-px bg-white/[0.06] mx-1 my-0.5" />
      )}

      {structTypes.map(tf => (
        <TypeButton key={tf.type} typeFilter={tf} onToggle={onToggle} />
      ))}

      <div className="h-px bg-white/[0.06] mx-1 my-0.5" />

      {/* Show all button */}
      <button
        onClick={onShowAll}
        className="w-[42px] h-9 flex flex-col items-center justify-center gap-px rounded border border-transparent bg-transparent text-white/55 hover:bg-white/[0.06] hover:text-white/70 hover:border-white/[0.08] transition-all cursor-pointer"
        title={t('viewer.types.allVisible')}
      >
        <Eye className="w-3.5 h-3.5" />
        <span className="text-[7px] font-semibold uppercase tracking-tight leading-none">
          {t('viewer.types.allVisible')}
        </span>
      </button>
    </div>
  );
}

function TypeButton({ typeFilter, onToggle }: { typeFilter: TypeFilterInfo; onToggle: (type: string) => void }) {
  const { t } = useTranslation();
  const config = IFC_TYPE_CONFIG[typeFilter.type];
  if (!config) return null;

  const label = t(`viewer.types.${config.i18nKey}`);

  return (
    <button
      onClick={() => onToggle(typeFilter.type)}
      title={label}
      className={cn(
        'w-[42px] h-9 flex flex-col items-center justify-center gap-px rounded border transition-all cursor-pointer',
        typeFilter.visible
          ? 'border-transparent bg-transparent text-white/45 hover:bg-white/[0.06] hover:text-white/70 hover:border-white/[0.08]'
          : 'border-transparent bg-transparent text-white/45 opacity-25',
      )}
    >
      {config.icon}
      <span className="text-[7px] font-semibold uppercase tracking-tight leading-none">{label}</span>
    </button>
  );
}


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


// ═══ FILTER HUD ═══

interface FilterHUDProps {
  filters: ActiveFilter[];
  onRemoveFilter: (id: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function FilterHUD({ filters, onRemoveFilter, onClearAll, className }: FilterHUDProps) {
  const { t } = useTranslation();

  if (filters.length === 0) return null;

  return (
    <div className={cn(
      'absolute top-11 left-[60px] z-[4] flex items-center gap-[3px] flex-wrap',
      className,
    )}>
      {filters.map(f => (
        <span
          key={f.id}
          className="flex items-center gap-[3px] px-[7px] py-[2px] rounded-[3px] text-[9px] font-semibold bg-[rgba(21,121,84,0.15)] text-[rgba(208,211,77,0.85)] border border-[rgba(21,121,84,0.25)] cursor-pointer hover:bg-[rgba(21,121,84,0.25)] transition-all"
        >
          {f.label}
          <button
            onClick={() => onRemoveFilter(f.id)}
            className="w-[10px] h-[10px] flex items-center justify-center opacity-50 hover:opacity-100"
          >
            <X className="w-2 h-2" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-[8.5px] text-white/30 px-1 py-0.5 rounded-[3px] hover:text-white/60 hover:bg-white/[0.06] transition-all cursor-pointer"
      >
        {t('viewer.filters.reset')}
      </button>
    </div>
  );
}


// ═══ CAMERA INFO ═══

interface CameraInfoProps {
  visibleModelCount: number;
  visibleElementCount: number;
  viewMode: string;
  className?: string;
}

export function CameraInfo({ visibleModelCount, visibleElementCount, viewMode, className }: CameraInfoProps) {
  const { t } = useTranslation();

  return (
    <div className={cn(
      'absolute bottom-11 right-2.5 z-[2] text-[9px] text-white/[0.18] text-right leading-relaxed tabular-nums',
      className,
    )}>
      {visibleModelCount} {t('viewer.platform.models').toLowerCase()}<br />
      {visibleElementCount.toLocaleString('nb-NO')} {t('viewer.platform.elements')}<br />
      {viewMode}
    </div>
  );
}


// ═══ SVG ICONS ═══

function WallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="2" width="16" height="20" rx="1" />
    </svg>
  );
}

function SlabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="9" width="20" height="6" rx="1" />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="2" width="12" height="20" rx="1" />
      <circle cx="15" cy="12" r="1.5" />
    </svg>
  );
}

function WindowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function ColumnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="8" y="2" width="8" height="20" rx="1" />
    </svg>
  );
}

function BeamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="8" width="20" height="8" rx="1" />
    </svg>
  );
}
