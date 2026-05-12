import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import { treemapLayout } from '@/lib/treemap';
import { cn } from '@/lib/utils';
import type { FamilyKey } from '@/lib/material-families';
import type { AggregatedMaterial } from '@/hooks/use-project-materials';
import { familyColor } from './familyColors';

interface MaterialsFamilyTreemapProps {
  materials: AggregatedMaterial[];
  activeFamily?: FamilyKey | null;
  onFamilyClick?: (family: FamilyKey) => void;
  className?: string;
}

/**
 * Treemap of material families, sized by aggregated material count
 * (with instance count as a secondary weight) and colored by family.
 * Clicking a tile toggles the family filter at the parent.
 *
 * Sibling to TypeTreemap — structure copied, vocabulary swapped from
 * IFC classes to material families.
 */
export function MaterialsFamilyTreemap({
  materials,
  activeFamily,
  onFamilyClick,
  className,
}: MaterialsFamilyTreemapProps) {
  const { t } = useTranslation();

  const items = useMemo(() => {
    // Size by total instance count across all type-usages of materials in
    // this family — that's the "real" quantity. Fall back to material
    // count when there are no instance counts available (template-only).
    const byFamily = new Map<
      FamilyKey,
      { materialCount: number; instanceCount: number }
    >();
    for (const m of materials) {
      const slot = byFamily.get(m.family) ?? { materialCount: 0, instanceCount: 0 };
      slot.materialCount += 1;
      slot.instanceCount += m.used_in_types.reduce(
        (sum, u) => sum + u.instance_count,
        0,
      );
      byFamily.set(m.family, slot);
    }
    const totalInstances = Array.from(byFamily.values()).reduce(
      (s, v) => s + v.instanceCount,
      0,
    );
    return Array.from(byFamily.entries())
      .map(([family, stats]) => ({
        family,
        // Use instance count when meaningful, material count otherwise.
        value: totalInstances > 0 ? stats.instanceCount : stats.materialCount,
        materialCount: stats.materialCount,
        instanceCount: stats.instanceCount,
      }))
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [materials]);

  return (
    <DashboardTile
      id="materials-family-treemap"
      className={cn('p-[clamp(0.625rem,1.2vw,1.25rem)] flex flex-col', className)}
    >
      <div className="flex items-center justify-between mb-[clamp(0.5rem,1vh,0.875rem)] gap-[clamp(0.5rem,1vw,1rem)] flex-shrink-0">
        <h3 className="text-[clamp(0.75rem,1vw,1rem)] font-medium">
          {t('materialBrowser.viz.treemapTitle')}
        </h3>
        <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground truncate">
          {t('materialBrowser.viz.treemapSubtitle')}
        </span>
      </div>

      <div className="relative flex-1 min-h-0 w-full bg-muted/20 rounded-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[clamp(0.625rem,1vw,0.75rem)] text-muted-foreground">
            {t('materialBrowser.viz.empty')}
          </div>
        ) : (
          <TreemapCanvas
            items={items}
            activeFamily={activeFamily ?? null}
            onFamilyClick={onFamilyClick}
          />
        )}
      </div>
    </DashboardTile>
  );
}

interface TreemapCanvasProps {
  items: {
    family: FamilyKey;
    value: number;
    materialCount: number;
    instanceCount: number;
  }[];
  activeFamily: FamilyKey | null;
  onFamilyClick?: (family: FamilyKey) => void;
}

function TreemapCanvas({ items, activeFamily, onFamilyClick }: TreemapCanvasProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The tiling algorithm is aspect-sensitive — pass the *actual* container
  // dimensions in so a squarish wrapper yields squarish tiles instead of
  // the sliver-rows you get when you feed a 16:9 W/H into a 4:3 container.
  // Default to a 4:3 surface (matches aspect-[4/3] wrappers used by the
  // dash) until the ResizeObserver kicks in.
  const [size, setSize] = useState({ W: 640, H: 480 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize({ W: w, H: h });
    };
    apply();
    const obs = new ResizeObserver(apply);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { W, H } = size;
  const rects = useMemo(
    () =>
      treemapLayout(
        items.map((i) => ({ label: i.family, value: i.value })),
        W,
        H,
      ),
    [items, W, H],
  );
  const statsByFamily = useMemo(() => {
    const m = new Map<
      string,
      { materialCount: number; instanceCount: number }
    >();
    for (const i of items) {
      m.set(i.family, {
        materialCount: i.materialCount,
        instanceCount: i.instanceCount,
      });
    }
    return m;
  }, [items]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {rects.map((r) => {
        const family = r.label as FamilyKey;
        const stats = statsByFamily.get(r.label) ?? {
          materialCount: 0,
          instanceCount: 0,
        };
        const pctX = (r.x / W) * 100;
        const pctY = (r.y / H) * 100;
        const pctW = (r.w / W) * 100;
        const pctH = (r.h / H) * 100;
        const color = familyColor(family);
        const showLabel = pctW > 6 && pctH > 6;
        const isActive = activeFamily !== null && activeFamily === family;
        const isDimmed = activeFamily !== null && !isActive;

        const tileStyle: React.CSSProperties = {
          left: `${pctX}%`,
          top: `${pctY}%`,
          width: `${pctW}%`,
          height: `${pctH}%`,
          background: color,
          opacity: isDimmed ? 0.45 : isActive ? 1 : 0.9,
          outline: isActive ? '2px solid rgba(255,255,255,0.6)' : undefined,
          outlineOffset: isActive ? '-2px' : undefined,
        };
        const tileClassName =
          'absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center text-white transition-all duration-200';
        const labelText = t(`materialBrowser.family.${family}`);
        const tileContent = showLabel && (
          <>
            <span className="text-[clamp(0.55rem,0.9vw,0.75rem)] font-medium leading-tight truncate max-w-full px-1">
              {labelText}
            </span>
            <span className="text-[clamp(0.5rem,0.8vw,0.65rem)] opacity-80 tabular-nums">
              {stats.instanceCount > 0
                ? stats.instanceCount.toLocaleString()
                : stats.materialCount.toLocaleString()}
            </span>
          </>
        );

        if (!onFamilyClick) {
          return (
            <div
              key={r.label}
              className={tileClassName}
              style={tileStyle}
              title={`${labelText}: ${stats.materialCount} materials, ${stats.instanceCount.toLocaleString()} instances`}
            >
              {tileContent}
            </div>
          );
        }
        return (
          <button
            key={r.label}
            type="button"
            onClick={() => onFamilyClick(family)}
            aria-pressed={isActive}
            className={cn(
              tileClassName,
              'cursor-pointer hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            style={tileStyle}
            title={`${labelText}: ${stats.materialCount} materials, ${stats.instanceCount.toLocaleString()} instances`}
          >
            {tileContent}
          </button>
        );
      })}
    </div>
  );
}
