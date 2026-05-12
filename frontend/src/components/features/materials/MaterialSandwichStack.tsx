import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { AggregatedMaterial } from '@/hooks/use-project-materials';
import { familyColor } from './familyColors';

interface MaterialSandwichStackProps {
  material: AggregatedMaterial;
}

interface Segment {
  key: string;
  type_id: string;
  type_name: string;
  ifc_type: string;
  thickness_mm: number;
  instance_count: number;
  layer_order: number;
}

/**
 * Sandwich-stack visualization for layered materials. Renders a single
 * horizontal stacked-bar where each segment is one layer occurrence of
 * this material across all the types in the project that use it. Width
 * is proportional to layer thickness (mm).
 *
 * Sibling concept to MaterialSetDetail's composition strip, but inverted:
 * MaterialSetDetail shows all layers in one set; this shows all
 * occurrences of one material across many sets.
 *
 * When a material has no thickness data (e.g. used only as a bulk
 * material), this falls back to even-width segments — the visualization
 * still communicates "this material participates in N layered
 * assemblies", which is the at-a-glance signal.
 */
export function MaterialSandwichStack({ material }: MaterialSandwichStackProps) {
  const { t } = useTranslation();

  const segments = useMemo<Segment[]>(() => {
    return material.used_in_types
      .filter((u) => u.thickness_mm !== null && (u.thickness_mm ?? 0) > 0)
      .map((u) => ({
        key: `${u.type_id}-${u.layer_order}`,
        type_id: u.type_id,
        type_name: u.type_name ?? u.ifc_type,
        ifc_type: u.ifc_type,
        thickness_mm: u.thickness_mm ?? 0,
        instance_count: u.instance_count,
        layer_order: u.layer_order,
      }))
      .sort((a, b) => b.thickness_mm - a.thickness_mm);
  }, [material]);

  if (segments.length === 0) return null;

  const totalThickness = segments.reduce((s, seg) => s + seg.thickness_mm, 0);
  const uniqueTypeCount = new Set(segments.map((s) => s.type_id)).size;
  const color = familyColor(material.family);

  return (
    <div className="flex flex-col gap-[clamp(0.375rem,0.8vw,0.625rem)]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.sandwich.title', {
            occurrences: segments.length,
            types: uniqueTypeCount,
          })}
        </div>
        <div className="text-[clamp(0.5rem,0.8vw,0.65rem)] text-text-tertiary tabular-nums">
          {totalThickness.toFixed(0)} mm
        </div>
      </div>

      <div
        className="flex h-[clamp(3.5rem,5vh,5rem)] w-full overflow-hidden rounded-md border border-border/60 bg-muted/20"
        role="img"
        aria-label={t('materialBrowser.sandwich.ariaLabel', {
          name: material.name,
          occurrences: segments.length,
        })}
      >
        {segments.map((seg, i) => {
          const share = (seg.thickness_mm / totalThickness) * 100;
          return (
            <div
              key={seg.key}
              className={cn(
                'relative h-full transition-all duration-500 ease-out',
                'border-r border-border/30 last:border-r-0',
                'flex items-center justify-center overflow-hidden',
              )}
              style={{
                width: `${Math.max(share, 0.8)}%`,
                background: color,
                // Stripe variant so neighboring segments remain distinguishable
                // when the material family color is identical.
                opacity: 0.55 + ((i % 5) * 0.09),
              }}
              title={`${seg.type_name} · ${seg.thickness_mm} mm · ×${seg.instance_count}`}
            >
              {share > 7 && (
                <span className="text-[clamp(0.45rem,0.7vw,0.65rem)] font-medium text-white/95 truncate px-1">
                  {seg.thickness_mm}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ul className="flex flex-col gap-[clamp(0.125rem,0.3vh,0.3rem)] text-[clamp(0.55rem,0.8vw,0.75rem)] text-muted-foreground max-h-[clamp(7rem,16vh,11rem)] overflow-auto">
        {segments.map((seg, i) => (
          <li key={`${seg.key}-leg`} className="flex items-center gap-1.5">
            <span
              className="h-[clamp(0.45rem,0.55vw,0.6rem)] w-[clamp(0.45rem,0.55vw,0.6rem)] rounded-sm shrink-0"
              style={{ background: color, opacity: 0.55 + ((i % 5) * 0.09) }}
            />
            <span className="truncate flex-1 text-text-primary">
              {seg.type_name}
            </span>
            <span className="tabular-nums shrink-0">{seg.thickness_mm} mm</span>
            <span className="tabular-nums shrink-0 text-text-tertiary">
              ×{seg.instance_count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
