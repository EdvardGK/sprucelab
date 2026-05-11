import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import { treemapLayout } from '@/lib/treemap';
import type { IFCType } from '@/hooks/use-warehouse';

const TREEMAP_COLORS = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

interface TypeTreemapProps {
  types: IFCType[];
}

export function TypeTreemap({ types }: TypeTreemapProps) {
  const { t } = useTranslation();

  const items = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const type of types) {
      if (type.instance_count <= 0) continue;
      const cls = type.ifc_type.replace(/^Ifc/, '');
      counts[cls] = (counts[cls] || 0) + type.instance_count;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [types]);

  return (
    <DashboardTile id="treemap-by-class" className="p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h2 className="text-xs font-medium">{t('typesV2.viz.treemapTitle')}</h2>
      </div>

      <div className="relative flex-1 min-h-0 w-full bg-muted/20 rounded-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {t('typesV2.viz.empty')}
          </div>
        ) : (
          <TreemapCanvas items={items} />
        )}
      </div>
    </DashboardTile>
  );
}

function TreemapCanvas({ items }: { items: { label: string; value: number }[] }) {
  const W = 800;
  const H = 450;
  const rects = useMemo(() => treemapLayout(items, W, H), [items]);

  return (
    <div className="absolute inset-0">
      {rects.map((r, i) => {
        const pctX = (r.x / W) * 100;
        const pctY = (r.y / H) * 100;
        const pctW = (r.w / W) * 100;
        const pctH = (r.h / H) * 100;
        const color = TREEMAP_COLORS[i % TREEMAP_COLORS.length];
        const showLabel = pctW > 6 && pctH > 6;
        return (
          <div
            key={r.label}
            className="absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center text-white"
            style={{
              left: `${pctX}%`,
              top: `${pctY}%`,
              width: `${pctW}%`,
              height: `${pctH}%`,
              background: color,
              opacity: 0.9,
            }}
            title={`${r.label}: ${r.value.toLocaleString()}`}
          >
            {showLabel && (
              <>
                <span className="text-[clamp(0.55rem,0.9vw,0.75rem)] font-medium leading-tight truncate max-w-full px-1">
                  {r.label}
                </span>
                <span className="text-[clamp(0.5rem,0.8vw,0.65rem)] opacity-80 tabular-nums">
                  {r.value.toLocaleString()}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
