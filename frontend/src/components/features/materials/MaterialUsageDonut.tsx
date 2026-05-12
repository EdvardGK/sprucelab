import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { pickDominantUnit, type AggregatedMaterial } from '@/hooks/use-project-materials';
import { familyColor } from './familyColors';

interface MaterialUsageDonutProps {
  material: AggregatedMaterial;
  onTypeClick?: (typeId: string, modelId: string) => void;
}

interface Wedge {
  key: string;
  type_id: string | null;
  model_id: string | null;
  label: string;
  value: number;
  color: string;
  /** Cumulative start angle, radians from +x axis (12-o'clock = -π/2). */
  start: number;
  /** End angle, radians. */
  end: number;
}

/**
 * Donut breakdown of a single material's quantity across the types that
 * reference it. Used as the visual fallback when a material isn't part
 * of any layered assembly (sandwich-stack doesn't apply).
 *
 * Renders pure SVG arcs — no chart library. Top 6 wedges plus "Other"
 * to keep the legend legible. Click wedge -> caller drills to the type.
 */
export function MaterialUsageDonut({ material, onTypeClick }: MaterialUsageDonutProps) {
  const { t } = useTranslation();
  const color = familyColor(material.family);

  const dominantUnit = useMemo(
    () => pickDominantUnit(material.quantities_by_unit),
    [material.quantities_by_unit],
  );

  const wedges = useMemo<Wedge[]>(() => {
    // Dedupe per type — a single type can appear multiple times in
    // used_in_types when the material participates as multiple layers.
    const byType = new Map<
      string,
      { type_id: string; model_id: string; label: string; value: number }
    >();
    for (const u of material.used_in_types) {
      const existing = byType.get(u.type_id);
      // quantity_per_unit × instance_count = contribution to project total
      const value = u.quantity_per_unit * u.instance_count;
      if (existing) {
        existing.value += value;
      } else {
        byType.set(u.type_id, {
          type_id: u.type_id,
          model_id: u.model_id,
          label: u.type_name ?? u.ifc_type,
          value,
        });
      }
    }

    const sorted = Array.from(byType.values())
      .filter((t) => t.value > 0)
      .sort((a, b) => b.value - a.value);

    const TOP = 6;
    const top = sorted.slice(0, TOP);
    const rest = sorted.slice(TOP);
    const restValue = rest.reduce((s, r) => s + r.value, 0);

    const total = sorted.reduce((s, r) => s + r.value, 0);
    if (total === 0) return [];

    const out: Wedge[] = [];
    let cursor = -Math.PI / 2; // 12 o'clock
    top.forEach((row, i) => {
      const frac = row.value / total;
      const start = cursor;
      const end = cursor + frac * Math.PI * 2;
      out.push({
        key: row.type_id,
        type_id: row.type_id,
        model_id: row.model_id,
        label: row.label,
        value: row.value,
        color,
        // Distinguish wedges of the same family color with opacity ramp.
        start,
        end,
      });
      // Family color used uniformly, but we vary lightness via inline
      // opacity in the renderer below so adjacent wedges remain distinct.
      void i;
      cursor = end;
    });
    if (restValue > 0) {
      out.push({
        key: '__other__',
        type_id: null,
        model_id: null,
        label: t('materialBrowser.donut.other', { count: rest.length }),
        value: restValue,
        color: 'hsl(var(--muted-foreground))',
        start: cursor,
        end: -Math.PI / 2 + Math.PI * 2,
      });
    }
    return out;
  }, [material.used_in_types, color, t]);

  if (wedges.length === 0) return null;

  // 100x100 viewbox, ring from r=30 to r=46, center 50,50
  const R_OUTER = 46;
  const R_INNER = 30;
  const total = wedges.reduce((s, w) => s + w.value, 0);

  return (
    <div className="flex flex-col gap-[clamp(0.375rem,0.8vw,0.625rem)]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.donut.title')}
        </div>
        <div className="text-[clamp(0.5rem,0.8vw,0.65rem)] text-text-tertiary tabular-nums">
          {dominantUnit ? `${formatNum(total)} ${dominantUnit}` : '—'}
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-[clamp(0.5rem,1vw,0.875rem)] items-center">
        <div className="aspect-square w-[clamp(7rem,14vw,10rem)]">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <title>{t('materialBrowser.donut.title')}</title>
            {wedges.map((w, i) => {
              const d = arcPath(50, 50, R_INNER, R_OUTER, w.start, w.end);
              const interactive = w.type_id && w.model_id && onTypeClick;
              const opacity =
                w.key === '__other__' ? 0.6 : 0.45 + ((i % 5) * 0.13);
              return (
                <path
                  key={w.key}
                  d={d}
                  fill={w.color}
                  opacity={opacity}
                  className={cn(
                    'transition-opacity duration-200',
                    interactive ? 'cursor-pointer hover:opacity-100' : '',
                  )}
                  onClick={() => {
                    if (interactive && w.type_id && w.model_id) {
                      onTypeClick(w.type_id, w.model_id);
                    }
                  }}
                >
                  <title>
                    {w.label} · {formatNum(w.value)}
                    {dominantUnit ? ` ${dominantUnit}` : ''}
                  </title>
                </path>
              );
            })}
            <text
              x="50"
              y="48"
              textAnchor="middle"
              className="fill-text-primary"
              style={{ fontSize: 7, fontWeight: 600 }}
            >
              {wedges.filter((w) => w.key !== '__other__').length}
            </text>
            <text
              x="50"
              y="58"
              textAnchor="middle"
              className="fill-text-tertiary"
              style={{ fontSize: 4 }}
            >
              {t('materialBrowser.donut.typesLabel')}
            </text>
          </svg>
        </div>

        <ul className="flex flex-col gap-[clamp(0.125rem,0.3vh,0.3rem)] text-[clamp(0.55rem,0.8vw,0.72rem)] min-w-0">
          {wedges.map((w, i) => {
            const opacity =
              w.key === '__other__' ? 0.6 : 0.45 + ((i % 5) * 0.13);
            const pct = (w.value / total) * 100;
            const clickable =
              w.type_id && w.model_id && onTypeClick !== undefined;
            return (
              <li
                key={`${w.key}-leg`}
                className={cn(
                  'flex items-center gap-1.5',
                  clickable && 'cursor-pointer hover:text-text-primary',
                )}
                onClick={() => {
                  if (clickable && w.type_id && w.model_id && onTypeClick) {
                    onTypeClick(w.type_id, w.model_id);
                  }
                }}
              >
                <span
                  className="h-[clamp(0.45rem,0.55vw,0.6rem)] w-[clamp(0.45rem,0.55vw,0.6rem)] rounded-sm shrink-0"
                  style={{ background: w.color, opacity }}
                />
                <span className="truncate flex-1 text-text-primary">
                  {w.label}
                </span>
                <span className="tabular-nums shrink-0 text-text-tertiary">
                  {pct.toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function arcPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  start: number,
  end: number,
): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const x0 = cx + rOuter * Math.cos(start);
  const y0 = cy + rOuter * Math.sin(start);
  const x1 = cx + rOuter * Math.cos(end);
  const y1 = cy + rOuter * Math.sin(end);
  const x2 = cx + rInner * Math.cos(end);
  const y2 = cy + rInner * Math.sin(end);
  const x3 = cx + rInner * Math.cos(start);
  const y3 = cy + rInner * Math.sin(start);
  return [
    `M ${x0.toFixed(3)} ${y0.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `L ${x2.toFixed(3)} ${y2.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x3.toFixed(3)} ${y3.toFixed(3)}`,
    'Z',
  ].join(' ');
}

function formatNum(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
