/**
 * ViewerFilterPanel
 *
 * The single faceted filter UI for the BIM viewer. Replaces the old
 * ViewerFilterHUD (bottom pills) and ViewerTypeToolbar (left icons).
 *
 * Facets stack with AND:
 *   IFC class · Storey · NS3451 · Verification · System · Model
 *
 * Backed by `ProjectFilterProvider` (project-scoped, shared with every
 * dashboard tile and the URL `?d=` sync) — the legacy Zustand store
 * was retired in PR 1.2.
 *
 * Click semantics (capture-doc Item 014): toggle-isolate (inclusion
 * model). Click a class → only that class visible; cmd/ctrl-click adds
 * to the inclusion set; click an active class → removes it. Right-click
 * subtracts the class via `excluded_ifc_class[]` so users can hide a
 * single class without first selecting everything else.
 *
 * Properties (NS3451, MMI, LoadBearing, FireRating, Materials…) are filtered
 * uniformly via a generic facet group — none of them get a special UI inside
 * the viewer. Classification of NS3451 lives in the Type Mapper, not here.
 *
 * Verification / System sections are visible but disabled until the
 * `ifc_guids` field on `/api/types/` lands (see plan §3.5).
 */

import { useMemo, useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Filter, RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';
import type { CanonicalFloor } from '@/hooks/use-scopes';
import type { TypeInfo } from './ViewerFilterHUD';

interface StoreyInfo { name: string; count: number }

interface ViewerFilterPanelProps {
  types: TypeInfo[];
  storeys?: StoreyInfo[];
  /** When provided, the Storey section renders canonical floor entries
   *  (button label = floor name, value = canonical code) instead of the
   *  per-IFC discovered storey names. */
  canonicalFloors?: CanonicalFloor[];
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  className?: string;
}

export function ViewerFilterPanel({
  types,
  storeys = [],
  canonicalFloors,
  collapsed = false,
  onCollapseToggle,
  className,
}: ViewerFilterPanelProps) {
  const filter = useProjectFilter();
  const { setIfcClass, setExcludedIfcClass, setFloorCode } =
    useProjectFilterActions();

  const includedClasses = filter.ifc_class ?? [];
  const excludedClasses = filter.excluded_ifc_class ?? [];
  const floorCode = filter.floor_code?.[0] ?? null;

  // Inclusion model:
  //   plain click   → switch inclusion to [class] (replace, always — even
  //                   if the same class is clicked twice; idempotent)
  //   shift-click   → toggle membership in the current inclusion
  //                   (multi-select; click another to add, click an
  //                   already-included class to remove it)
  //   right-click   → toggle exclusion (subtract this class regardless of
  //                   inclusion; see handleToggleExcluded below)
  // To clear the inclusion entirely, use the "Show all" button. We
  // deliberately do NOT clear-on-second-click of the only active chip —
  // that path was confusing in PR 1.2 review and never an explicit ask.
  const handleIsolate = (cls: string, multi: boolean) => {
    if (multi) {
      const current = includedClasses;
      const next = current.includes(cls)
        ? current.filter((c) => c !== cls)
        : [...current, cls];
      setIfcClass(next.length === 0 ? undefined : next);
      return;
    }
    setIfcClass([cls]);
    // Clear any matching exclusion so a fresh isolate gesture doesn't
    // immediately fight a stale right-click hide on the same class.
    if (excludedClasses.includes(cls)) {
      const nextExcluded = excludedClasses.filter((c) => c !== cls);
      setExcludedIfcClass(nextExcluded.length === 0 ? undefined : nextExcluded);
    }
  };

  // Right-click → exclude / un-exclude.
  const handleToggleExcluded = (cls: string) => {
    const next = excludedClasses.includes(cls)
      ? excludedClasses.filter((c) => c !== cls)
      : [...excludedClasses, cls];
    setExcludedIfcClass(next.length === 0 ? undefined : next);
  };

  // "Show all" — drop class facets only, preserve floor + property facets.
  const handleShowAll = () => {
    setIfcClass(undefined);
    setExcludedIfcClass(undefined);
  };

  const [classSearch, setClassSearch] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    class: true,
    storey: true,
    properties: false,
    verification: false,
    system: false,
  });

  const totalElements = useMemo(() => types.reduce((s, t) => s + t.count, 0), [types]);
  const visibleElements = useMemo(() => {
    const includeSet =
      includedClasses.length > 0 ? new Set(includedClasses) : null;
    const excludeSet =
      excludedClasses.length > 0 ? new Set(excludedClasses) : null;
    return types
      .filter((t) => {
        const passesInclusion = includeSet === null || includeSet.has(t.type);
        const passesExclusion = excludeSet === null || !excludeSet.has(t.type);
        return passesInclusion && passesExclusion;
      })
      .reduce((s, t) => s + t.count, 0);
  }, [types, includedClasses, excludedClasses]);

  const filteredTypes = useMemo(() => {
    if (!classSearch.trim()) return types;
    const q = classSearch.toLowerCase();
    return types.filter((t) => t.type.toLowerCase().includes(q));
  }, [types, classSearch]);

  const noneFiltered =
    includedClasses.length === 0 && excludedClasses.length === 0;

  const activeFacetCount =
    (includedClasses.length > 0 ? 1 : 0) +
    (excludedClasses.length > 0 ? 1 : 0) +
    (floorCode ? 1 : 0);

  if (collapsed) {
    return (
      <div className={cn(
        'absolute left-3 top-3 z-20 flex flex-col gap-1',
        'bg-black/70 backdrop-blur-md rounded-lg border border-white/10 shadow-lg p-1.5',
        className,
      )}>
        <button
          onClick={onCollapseToggle}
          title="Filters"
          className="relative p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Filter className="h-4 w-4" />
          {activeFacetCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-cyan-500 text-[9px] font-semibold text-black rounded-full h-4 w-4 flex items-center justify-center">
              {activeFacetCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'absolute left-3 top-3 bottom-3 z-20 w-[260px]',
        'flex flex-col bg-black/70 backdrop-blur-md rounded-lg border border-white/10 shadow-lg overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-white/80">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold tracking-wide">Filters</span>
          {activeFacetCount > 0 && (
            <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-medium rounded-full px-1.5 py-0.5">
              {activeFacetCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeFacetCount > 0 && (
            <button
              onClick={() => {
                setIfcClass(undefined);
                setExcludedIfcClass(undefined);
                setFloorCode(undefined);
              }}
              title="Reset all filters"
              className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          {onCollapseToggle && (
            <button
              onClick={onCollapseToggle}
              title="Collapse"
              className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Element count summary */}
      <div className="px-3 py-2 border-b border-white/10 text-[10px] text-white/50 tabular-nums shrink-0">
        Showing <span className="text-white font-medium">{visibleElements.toLocaleString()}</span>
        {' / '}
        <span>{totalElements.toLocaleString()}</span> elements
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto">
        {/* IFC Class facet */}
        <Section
          title="IFC Class"
          count={types.length}
          isOpen={openSections.class}
          onToggle={() => setOpenSections((s) => ({ ...s, class: !s.class }))}
        >
          <div className="space-y-2">
            {/* Show all — clears class inclusion + exclusion (preserves
                floor + property facets). No "Hide all" in inclusion-model
                — there's no clean equivalent. */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleShowAll}
                disabled={noneFiltered}
                className={cn(
                  'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                  noneFiltered ? 'bg-white/5 text-white/30' : 'bg-white/10 text-white/70 hover:bg-white/15',
                )}
              >
                <Eye className="h-3 w-3 inline mr-1" />Show all
              </button>
            </div>
            {types.length > 6 && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30" />
                <input
                  type="text"
                  value={classSearch}
                  onChange={(e) => setClassSearch(e.target.value)}
                  placeholder="Search classes…"
                  className="w-full pl-7 pr-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/40"
                />
              </div>
            )}
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {filteredTypes.length === 0 && (
                <div className="text-[10px] text-white/30 italic py-2 text-center">No matching classes</div>
              )}
              {filteredTypes.map(({ type, count }) => {
                const isolated = includedClasses.includes(type);
                const excluded = excludedClasses.includes(type);
                const inclusionActive = includedClasses.length > 0;
                // visible = passes inclusion AND not excluded
                const visible =
                  (!inclusionActive || isolated) && !excluded;
                return (
                  <button
                    key={type}
                    onClick={(e: MouseEvent<HTMLButtonElement>) =>
                      handleIsolate(type, e.shiftKey)
                    }
                    onContextMenu={(e: MouseEvent<HTMLButtonElement>) => {
                      e.preventDefault();
                      handleToggleExcluded(type);
                    }}
                    title={
                      excluded
                        ? 'Right-click to unhide'
                        : 'Click to isolate · shift-click toggles in selection · right-click hides'
                    }
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors border',
                      excluded
                        ? 'border-rose-400/40 bg-rose-500/10 text-rose-200/70 line-through hover:bg-rose-500/15'
                        : isolated
                          ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20'
                          : 'border-transparent text-white/80 hover:bg-white/10',
                    )}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {visible
                        ? <Eye className="h-3 w-3 shrink-0 text-cyan-400/70" />
                        : <EyeOff className="h-3 w-3 shrink-0 text-white/30" />}
                      <span className="truncate">{type.replace('Ifc', '')}</span>
                    </span>
                    <span
                      className={cn(
                        'tabular-nums shrink-0',
                        excluded
                          ? 'text-rose-200/50'
                          : isolated
                            ? 'text-cyan-200/70'
                            : visible
                              ? 'text-white/40'
                              : 'text-white/20',
                      )}
                    >
                      {count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* Storey facet — prefers canonical floors when the project has them. */}
        {(canonicalFloors && canonicalFloors.length > 0) ? (
          <Section
            title="Storey"
            count={canonicalFloors.length}
            isOpen={openSections.storey}
            onToggle={() => setOpenSections((s) => ({ ...s, storey: !s.storey }))}
          >
            <div className="space-y-0.5">
              <button
                onClick={() => setFloorCode(undefined)}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors',
                  floorCode === null
                    ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30'
                    : 'text-white/60 hover:bg-white/10 border border-transparent',
                )}
              >
                <span>All storeys</span>
              </button>
              {canonicalFloors.map(({ code, name, elevation_m }) => {
                const active = floorCode === code;
                return (
                  <button
                    key={code}
                    onClick={() => setFloorCode(active ? undefined : [code])}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors',
                      active
                        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30'
                        : 'text-white/60 hover:bg-white/10 border border-transparent',
                    )}
                  >
                    <span className="truncate text-left">
                      <span className="font-mono text-white/40 mr-1.5">{code}</span>
                      {name}
                    </span>
                    {elevation_m !== null && elevation_m !== undefined && (
                      <span className="tabular-nums shrink-0 text-white/40">
                        {elevation_m.toFixed(2)}m
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        ) : storeys.length > 0 ? (
          <Section
            title="Storey"
            count={storeys.length}
            isOpen={openSections.storey}
            onToggle={() => setOpenSections((s) => ({ ...s, storey: !s.storey }))}
          >
            <div className="space-y-0.5">
              <button
                onClick={() => setFloorCode(undefined)}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors',
                  floorCode === null
                    ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30'
                    : 'text-white/60 hover:bg-white/10 border border-transparent',
                )}
              >
                <span>All storeys</span>
              </button>
              {storeys.map(({ name, count }) => {
                const active = floorCode === name;
                return (
                  <button
                    key={name}
                    onClick={() => setFloorCode(active ? undefined : [name])}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors',
                      active
                        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30'
                        : 'text-white/60 hover:bg-white/10 border border-transparent',
                    )}
                  >
                    <span className="truncate text-left">{name}</span>
                    <span className="tabular-nums shrink-0 text-white/40">{count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        ) : null}

        {/* Generic property filters — NS3451, MMI, LoadBearing, FireRating,
            Materials, IsExternal, etc. all live here uniformly. */}
        <Section
          title="Properties"
          count={0}
          isOpen={openSections.properties}
          onToggle={() => setOpenSections((s) => ({ ...s, properties: !s.properties }))}
        >
          <div className="space-y-1.5 px-1 py-1">
            <div className="text-[10px] text-white/30 italic">
              Coming soon — filter by property presence/value:
            </div>
            <div className="flex flex-wrap gap-1">
              {['NS3451', 'MMI', 'LoadBearing', 'FireRating', 'Materials', 'IsExternal'].map((p) => (
                <span
                  key={p}
                  className="text-[9px] text-white/40 bg-white/5 border border-white/10 rounded px-1.5 py-0.5"
                >
                  {p}
                </span>
              ))}
            </div>
            <div className="text-[9px] text-white/25 italic pt-0.5">
              Classification of these stays in the Type Mapper.
            </div>
          </div>
        </Section>

        {/* Verification status placeholder */}
        <Section
          title="Verification"
          count={0}
          isOpen={openSections.verification}
          onToggle={() => setOpenSections((s) => ({ ...s, verification: !s.verification }))}
        >
          <div className="text-[10px] text-white/30 italic px-2 py-1.5">
            Coming soon — verified / flagged / pending / auto
          </div>
        </Section>
      </div>
    </div>
  );
}

// --- Section ---

function Section({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80 uppercase tracking-wide">
          {isOpen
            ? <ChevronDown className="h-3 w-3 text-white/40" />
            : <ChevronRight className="h-3 w-3 text-white/40" />}
          {title}
        </span>
        {count > 0 && (
          <span className="text-[10px] text-white/40 tabular-nums">{count}</span>
        )}
      </button>
      {isOpen && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

// Convenience: a tiny floating toggle button to open the panel from collapsed.
export function ViewerFilterPanelTrigger({
  activeFacetCount,
  onClick,
  className,
}: {
  activeFacetCount: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn('h-8 gap-1.5 bg-black/60 backdrop-blur-md border-white/10', className)}
    >
      <Filter className="h-3.5 w-3.5" />
      Filters
      {activeFacetCount > 0 && (
        <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-medium rounded-full px-1.5">
          {activeFacetCount}
        </span>
      )}
    </Button>
  );
}
