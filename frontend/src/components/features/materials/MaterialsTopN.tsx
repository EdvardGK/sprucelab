import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import {
  pickDominantUnit,
  MATERIAL_UNIT_ORDER,
  type AggregatedMaterial,
  type MaterialUnit,
} from '@/hooks/use-project-materials';
import { familyColor } from './familyColors';

type RankingAxis = 'quantity' | 'cost' | 'gwp';

interface MaterialsTopNProps {
  materials: AggregatedMaterial[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  topN?: number;
  className?: string;
}

interface RankedRow {
  key: string;
  name: string;
  family: AggregatedMaterial['family'];
  value: number;
  displayValue: string;
}

/**
 * Vertical Top-N ranking panel — mirrors TypeTopBarList visually but
 * lets the user switch the ranking axis between quantity, cost, and
 * GWP. Disabled axes (no data on any material) get an em-dash framing,
 * never a misleading zero.
 *
 * Click a row -> selects that material in the detail rail.
 */
export function MaterialsTopN({
  materials,
  selectedKey,
  onSelect,
  topN = 10,
  className,
}: MaterialsTopNProps) {
  const { t } = useTranslation();
  const [axis, setAxis] = useState<RankingAxis>('quantity');

  const costAvailable = useMemo(
    () => materials.some((m) => m.unit_cost !== null),
    [materials],
  );
  const gwpAvailable = useMemo(
    () => materials.some((m) => m.has_epd && m.gwp_per_unit !== null),
    [materials],
  );

  // When ranking by quantity, restrict to a single unit so the bar
  // widths represent apples-to-apples comparisons. Pick the unit with
  // the most materials referencing it, falling back to canonical
  // priority (m³ → m² → m → kg → pcs). Cost / GWP rankings convert to
  // currency / CO₂e so the unit collapses anyway.
  const quantityUnit: MaterialUnit | null = useMemo(() => {
    if (materials.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const m of materials) {
      const u = pickDominantUnit(m.quantities_by_unit);
      if (u) counts[u] = (counts[u] ?? 0) + 1;
    }
    const entries = Object.entries(counts) as [MaterialUnit, number][];
    if (entries.length === 0) return null;
    entries.sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return MATERIAL_UNIT_ORDER.indexOf(a[0]) - MATERIAL_UNIT_ORDER.indexOf(b[0]);
    });
    return entries[0][0];
  }, [materials]);

  const rows = useMemo<RankedRow[]>(() => {
    const ranked = materials
      .map((m) => {
        if (axis === 'quantity') {
          // Only consider materials whose dominant unit matches the
          // ranking unit. Materials in other units are listed elsewhere
          // (the table renders them all); ranking across units is
          // mathematically meaningless.
          if (!quantityUnit) return null;
          const matDominant = pickDominantUnit(m.quantities_by_unit);
          if (matDominant !== quantityUnit) return null;
          const qty = m.quantities_by_unit[quantityUnit];
          if (qty === 0) return null;
          return {
            key: m.key,
            name: m.name,
            family: m.family,
            value: qty,
            displayValue: `${formatNum(qty)} ${quantityUnit}`,
          };
        }
        const unit = pickDominantUnit(m.quantities_by_unit);
        const qty = unit ? m.quantities_by_unit[unit] : 0;
        if (axis === 'cost') {
          if (m.unit_cost === null || qty === 0) {
            return null;
          }
          const c = qty * m.unit_cost;
          return {
            key: m.key,
            name: m.name,
            family: m.family,
            value: c,
            displayValue: formatNok(c),
          };
        }
        if (axis === 'gwp') {
          if (!m.has_epd || m.gwp_per_unit === null || qty === 0) {
            return null;
          }
          const g = qty * m.gwp_per_unit;
          return {
            key: m.key,
            name: m.name,
            family: m.family,
            value: g,
            displayValue: formatCo2e(g),
          };
        }
        return null;
      })
      .filter((r): r is RankedRow => r !== null && r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
    return ranked;
  }, [materials, axis, topN, quantityUnit]);

  const maxValue = rows[0]?.value ?? 0;

  return (
    <DashboardTile
      id="materials-top-n"
      className={cn('p-[clamp(0.625rem,1.2vw,1.25rem)] flex flex-col', className)}
    >
      <div className="flex items-center justify-between gap-2 mb-[clamp(0.375rem,0.75vh,0.75rem)] flex-shrink-0">
        <h3 className="text-[clamp(0.6rem,0.8vw,0.85rem)] font-semibold uppercase tracking-wide text-muted-foreground truncate">
          {t('materialBrowser.topN.title', { count: rows.length })}
          {axis === 'quantity' && quantityUnit && (
            <span className="ml-1.5 text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground/70 normal-case tracking-normal">
              · {quantityUnit}
            </span>
          )}
        </h3>
        <AxisToggle
          axis={axis}
          onChange={setAxis}
          costAvailable={costAvailable}
          gwpAvailable={gwpAvailable}
        />
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[clamp(0.6rem,0.85vw,0.75rem)] text-muted-foreground">
          {axis === 'cost' && !costAvailable
            ? t('materialBrowser.topN.noCost')
            : axis === 'gwp' && !gwpAvailable
              ? t('materialBrowser.topN.noGwp')
              : t('materialBrowser.topN.empty')}
        </div>
      ) : (
        <ul className="flex flex-col gap-1 flex-1 min-h-0 overflow-auto pr-1">
          {rows.map((row) => {
            const widthPct = maxValue > 0 ? (row.value / maxValue) * 100 : 0;
            const isSelected = selectedKey === row.key;
            return (
              <li key={row.key} className="list-none">
                <button
                  type="button"
                  onClick={() => onSelect(row.key === selectedKey ? null : row.key)}
                  className={cn(
                    'w-full text-left rounded-md transition-colors px-1 -mx-1 py-0.5 text-[clamp(0.6rem,0.78vw,0.8rem)]',
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        aria-hidden
                        className="h-[clamp(0.4rem,0.55vw,0.55rem)] w-[clamp(0.4rem,0.55vw,0.55rem)] rounded-sm shrink-0"
                        style={{ background: familyColor(row.family) }}
                      />
                      <span
                        className={cn(
                          'truncate',
                          isSelected ? 'font-semibold text-[hsl(158_70%_28%)]' : 'font-medium',
                        )}
                        title={row.name}
                      >
                        {row.name}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {row.displayValue}
                    </span>
                  </div>
                  <div className="mt-0.5 h-[clamp(0.25rem,0.4vh,0.4rem)] w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${widthPct}%`,
                        background: familyColor(row.family),
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardTile>
  );
}

function AxisToggle({
  axis,
  onChange,
  costAvailable,
  gwpAvailable,
}: {
  axis: RankingAxis;
  onChange: (a: RankingAxis) => void;
  costAvailable: boolean;
  gwpAvailable: boolean;
}) {
  const { t } = useTranslation();
  const buttons: { id: RankingAxis; label: string; enabled: boolean }[] = [
    {
      id: 'quantity',
      label: t('materialBrowser.topN.axis.quantity'),
      enabled: true,
    },
    {
      id: 'cost',
      label: t('materialBrowser.topN.axis.cost'),
      enabled: costAvailable,
    },
    {
      id: 'gwp',
      label: t('materialBrowser.topN.axis.gwp'),
      enabled: gwpAvailable,
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('materialBrowser.topN.axisLabel')}
      className="flex items-center gap-0.5 rounded-md border bg-background p-0.5"
    >
      {buttons.map((b) => {
        const active = axis === b.id;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!b.enabled}
            onClick={() => b.enabled && onChange(b.id)}
            className={cn(
              'rounded px-[clamp(0.375rem,0.7vw,0.625rem)] py-[2px] text-[clamp(0.5rem,0.7vw,0.65rem)] font-medium uppercase tracking-wide transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : b.enabled
                  ? 'text-text-secondary hover:text-text-primary'
                  : 'text-text-tertiary/50 cursor-not-allowed',
            )}
            title={
              b.enabled
                ? b.label
                : b.id === 'cost'
                  ? t('materialBrowser.topN.noCost')
                  : t('materialBrowser.topN.noGwp')
            }
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function formatNok(n: number): string {
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `kr ${n.toFixed(0)}`;
  }
}

function formatCo2e(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)} t CO₂e`;
  return `${n.toFixed(0)} kg CO₂e`;
}
