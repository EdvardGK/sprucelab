import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import { DrillTarget } from '@/components/filters/DrillTarget';
import { treemapLayout } from '@/lib/treemap';
import type { IFCType } from '@/hooks/use-warehouse';

const TREEMAP_COLORS = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

interface TypeTreemapProps {
  types: IFCType[];
  /** Currently active IFC-class filter ("all" = none). */
  activeIfcClass?: string;
  /** Shared color map. Falls back to ordinal palette if omitted. */
  classColors?: Map<string, string>;
  /** Click handler receiving the full IFC class name (with "Ifc" prefix). */
  onClassClick?: (ifcClass: string) => void;
}

export function TypeTreemap({
  types,
  activeIfcClass = 'all',
  classColors,
  onClassClick,
}: TypeTreemapProps) {
  const { t } = useTranslation();

  const items = useMemo(() => {
    const counts: Record<string, { value: number; fullClass: string }> = {};
    for (const type of types) {
      if (type.instance_count <= 0) continue;
      const cls = type.ifc_type.replace(/^Ifc/, '');
      if (!counts[cls]) counts[cls] = { value: 0, fullClass: type.ifc_type };
      counts[cls].value += type.instance_count;
    }
    return Object.entries(counts)
      .map(([label, { value, fullClass }]) => ({ label, value, fullClass }))
      .sort((a, b) => b.value - a.value);
  }, [types]);

  return (
    <DashboardTile id="treemap-by-class" className="p-[clamp(0.625rem,1.2vw,1.25rem)] flex flex-col h-full">
      <div className="flex items-center justify-between mb-[clamp(0.5rem,1vh,0.875rem)] gap-[clamp(0.5rem,1vw,1rem)] flex-shrink-0">
        <h2 className="text-[clamp(0.75rem,1vw,1rem)] font-medium">
          {t('typesV2.viz.treemapTitle')}
        </h2>
        <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground truncate">
          {t('typesV2.viz.treemapSubtitle')}
        </span>
      </div>

      <div className="relative flex-1 min-h-0 w-full bg-muted/20 rounded-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {t('typesV2.viz.empty')}
          </div>
        ) : (
          <TreemapCanvas
            items={items}
            activeIfcClass={activeIfcClass}
            classColors={classColors}
            onClassClick={onClassClick}
          />
        )}
      </div>
    </DashboardTile>
  );
}

function TreemapCanvas({
  items,
  activeIfcClass,
  classColors,
  onClassClick,
}: {
  items: { label: string; value: number; fullClass: string }[];
  activeIfcClass?: string;
  classColors?: Map<string, string>;
  onClassClick?: (ifcClass: string) => void;
}) {
  const W = 800;
  const H = 450;
  const rects = useMemo(
    () =>
      treemapLayout(
        items.map((i) => ({ label: i.label, value: i.value })),
        W,
        H
      ),
    [items]
  );
  const fullByLabel = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => m.set(i.label, i.fullClass));
    return m;
  }, [items]);

  return (
    <div className="absolute inset-0">
      {rects.map((r, i) => {
        const pctX = (r.x / W) * 100;
        const pctY = (r.y / H) * 100;
        const pctW = (r.w / W) * 100;
        const pctH = (r.h / H) * 100;
        const fullClass = fullByLabel.get(r.label) ?? 'Ifc' + r.label;
        const color = classColors?.get(fullClass) ?? TREEMAP_COLORS[i % TREEMAP_COLORS.length];
        const showLabel = pctW > 6 && pctH > 6;
        const isActive =
          activeIfcClass !== undefined && activeIfcClass !== 'all' && activeIfcClass === fullClass;
        const interactive = !!onClassClick;
        const tileStyle: React.CSSProperties = {
          left: `${pctX}%`,
          top: `${pctY}%`,
          width: `${pctW}%`,
          height: `${pctH}%`,
          background: color,
          opacity: isActive ? 1 : 0.9,
        };
        const tileClassName =
          'absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center text-white transition-opacity duration-200';
        const tileContent = showLabel && (
          <>
            <span className="text-[clamp(0.55rem,0.9vw,0.75rem)] font-medium leading-tight truncate max-w-full px-1">
              {r.label}
            </span>
            <span className="text-[clamp(0.5rem,0.8vw,0.65rem)] opacity-80 tabular-nums">
              {r.value.toLocaleString()}
            </span>
          </>
        );
        if (!interactive) {
          return (
            <div
              key={r.label}
              className={tileClassName}
              style={tileStyle}
              title={`${r.label}: ${r.value.toLocaleString()}`}
            >
              {tileContent}
            </div>
          );
        }
        return (
          <DrillTarget
            key={r.label}
            active={isActive}
            ariaLabel={`Filter by ${r.label}`}
            title={`${r.label}: ${r.value.toLocaleString()}`}
            className={tileClassName}
            style={tileStyle}
            onActivate={() => onClassClick!(fullClass)}
          >
            {tileContent}
          </DrillTarget>
        );
      })}
    </div>
  );
}
