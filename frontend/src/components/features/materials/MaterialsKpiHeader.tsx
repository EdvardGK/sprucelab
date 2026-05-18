import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  Ruler,
  Leaf,
  ShoppingCart,
  Coins,
  CloudFog,
} from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import { familyColor } from './familyColors';
import type {
  AggregatedMaterial,
  MaterialUnit,
  ProjectMaterialsSummary,
} from '@/hooks/use-project-materials';
import {
  MATERIAL_UNIT_ORDER,
  pickDominantUnit,
} from '@/hooks/use-project-materials';

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

interface MaterialsKpiHeaderProps {
  summary: ProjectMaterialsSummary;
  materials: AggregatedMaterial[];
  /** Count of materials passing the active dashboard filters. Used to
   * render the MATERIALS KPI as "N/total" so the headline tracks the
   * active filter (issue #17 finding 7). */
  filteredCount?: number;
  loading?: boolean;
  dataUpdatedAt?: number;
}

/**
 * Materials dash KPI row — six tiles aligned with the four axes the
 * dashboard surfaces (QTO · Cost · Product mapping · LCA) plus total
 * materials count and total quantity.
 *
 * Modelers-own-data: every tile renders raw counts (not "Mapped %"),
 * with amber em-dash when source data is missing. Cost + GWP tiles
 * surface em-dash until `unit_cost` / `gwp_per_unit` land on the
 * AggregatedMaterial record (the hook keeps them null for now).
 */
export function MaterialsKpiHeader({
  summary,
  materials,
  filteredCount,
  loading,
  dataUpdatedAt,
}: MaterialsKpiHeaderProps) {
  const { t } = useTranslation();

  // Distribution by family — reused as the sparkline under "Total materials".
  const familySegments: SparkSegment[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of materials) counts[m.family] = (counts[m.family] || 0) + 1;
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({
        key,
        value,
        color: familyColor(key as Parameters<typeof familyColor>[0]),
        label: key,
      }));
  }, [materials]);

  // Top materials by dominant-unit quantity — sparkline under "Total quantity".
  const topQuantitySegments: SparkSegment[] = useMemo(() => {
    return materials
      .map((m) => {
        const unit = pickDominantUnit(m.quantities_by_unit);
        const qty = unit ? m.quantities_by_unit[unit] : 0;
        return { m, qty };
      })
      .filter(({ qty }) => qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map(({ m, qty }) => ({
        key: m.key,
        value: qty,
        color: familyColor(m.family),
        label: m.name,
      }));
  }, [materials]);

  const productSegments: SparkSegment[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of materials) {
      if (m.has_product) counts[m.family] = (counts[m.family] || 0) + 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({
        key,
        value,
        color: familyColor(key as Parameters<typeof familyColor>[0]),
      }));
  }, [materials]);

  const epdSegments: SparkSegment[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of materials) {
      if (m.has_epd) counts[m.family] = (counts[m.family] || 0) + 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({
        key,
        value,
        color: familyColor(key as Parameters<typeof familyColor>[0]),
      }));
  }, [materials]);

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,1vw,0.875rem)]">
      <div className="flex items-center justify-between gap-[clamp(0.5rem,1vw,1rem)] flex-wrap">
        <h2 className="text-[clamp(0.85rem,1.2vw,1.05rem)] font-semibold tracking-tight text-text-primary">
          {t('materialBrowser.kpi.title')}
        </h2>
        <MaterialsFreshness dataUpdatedAt={dataUpdatedAt} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[clamp(0.5rem,1vw,0.875rem)]">
        <KpiCard
          id="kpi-mat-total-materials"
          icon={<Boxes className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.totalMaterials')}
          rawValue={filteredCount ?? summary.total_materials}
          totalValue={
            filteredCount !== undefined && filteredCount !== summary.total_materials
              ? summary.total_materials
              : undefined
          }
          renderValue={(animated) => animated.toLocaleString()}
          loading={loading}
          spark={<Sparkline segments={familySegments} variant="stacked" />}
        />

        <QuantityKpiCard summary={summary} loading={loading} sparkSegments={topQuantitySegments} />


        <KpiCard
          id="kpi-mat-product"
          icon={<ShoppingCart className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.mappedToProduct')}
          rawValue={summary.procurement_linked_count}
          totalValue={summary.total_materials}
          renderValue={(animated) => animated.toLocaleString()}
          missing={
            summary.procurement_linked_count === 0 && summary.total_materials > 0
          }
          missingHint={t('materialBrowser.kpi.productMissingHint')}
          tone={
            summary.procurement_linked_count === 0
              ? 'warning'
              : summary.procurement_linked_count >= summary.total_materials * 0.9
                ? 'good'
                : summary.procurement_linked_count >= summary.total_materials * 0.5
                  ? 'neutral'
                  : 'warning'
          }
          loading={loading}
          spark={
            productSegments.length > 0 ? (
              <Sparkline segments={productSegments} variant="stacked" />
            ) : (
              <Sparkline segments={[]} variant="progress" progressValue={0} />
            )
          }
        />

        <KpiCard
          id="kpi-mat-epd"
          icon={<Leaf className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.epdLinked')}
          rawValue={summary.epd_linked_count}
          totalValue={summary.total_materials}
          renderValue={(animated) => animated.toLocaleString()}
          missing={summary.epd_linked_count === 0 && summary.total_materials > 0}
          missingHint={t('materialBrowser.kpi.epdMissingHint')}
          tone={
            summary.epd_linked_count === 0
              ? 'warning'
              : summary.epd_linked_count >= summary.total_materials * 0.9
                ? 'good'
                : 'neutral'
          }
          loading={loading}
          spark={
            epdSegments.length > 0 ? (
              <Sparkline segments={epdSegments} variant="stacked" />
            ) : (
              <Sparkline segments={[]} variant="progress" progressValue={0} />
            )
          }
        />

        <KpiCard
          id="kpi-mat-cost"
          icon={<Coins className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.totalCost')}
          rawValue={summary.total_cost_nok ?? 0}
          fraction
          renderValue={(animated) =>
            summary.total_cost_nok === null ? '—' : formatNok(animated)
          }
          missing={summary.total_cost_nok === null}
          missingHint={t('materialBrowser.kpi.costMissingHint')}
          loading={loading}
        />

        <KpiCard
          id="kpi-mat-gwp"
          icon={<CloudFog className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.totalGwp')}
          rawValue={summary.total_gwp_kg_co2e ?? 0}
          fraction
          renderValue={(animated) =>
            summary.total_gwp_kg_co2e === null ? '—' : formatCo2e(animated)
          }
          missing={summary.total_gwp_kg_co2e === null}
          missingHint={t('materialBrowser.kpi.gwpMissingHint')}
          loading={loading}
        />
      </div>
    </div>
  );
}

const TONE_STYLES: Record<Tone, { card: string; value: string; icon: string }> = {
  neutral: {
    card: '',
    value: '',
    icon: 'text-muted-foreground',
  },
  good: {
    card: 'ring-1 ring-[hsl(158_70%_28%/0.25)]',
    value: 'text-[hsl(158_70%_28%)]',
    icon: 'text-[hsl(158_70%_28%)]',
  },
  warning: {
    card: 'ring-1 ring-amber-400/40',
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500',
  },
  danger: {
    card: 'ring-1 ring-red-400/50',
    value: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500',
  },
};

interface KpiCardProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  rawValue: number;
  /** Render the live count-up value as a formatted string. */
  renderValue: (animated: number) => string;
  /** Allow fractional count-up (default rounds to int). */
  fraction?: boolean;
  /** Unfiltered/total reference shown faded as "/ N". */
  totalValue?: number;
  /** When true, value renders as amber em-dash regardless of rawValue. */
  missing?: boolean;
  /** Tooltip hint when missing. */
  missingHint?: string;
  /** Optional subline under the value (small, muted). */
  subline?: string;
  loading?: boolean;
  tone?: Tone;
  spark?: React.ReactNode;
}

interface QuantityKpiCardProps {
  summary: ProjectMaterialsSummary;
  loading?: boolean;
  sparkSegments: SparkSegment[];
}

/**
 * Quantity tile. Cross-unit aggregation is invalid (you can't add m³ to
 * m as scalars), so when multiple units carry meaningful subtotals we
 * render each one stacked — there is no single "total quantity" to
 * report. The single-unit path keeps the count-up affordance for parity
 * with the rest of the row.
 */
function QuantityKpiCard({ summary, loading, sparkSegments }: QuantityKpiCardProps) {
  const { t } = useTranslation();
  const buckets = (Object.entries(summary.quantities_by_unit) as [MaterialUnit, number][])
    .filter(([, v]) => v > 0)
    .sort(([ua], [ub]) => MATERIAL_UNIT_ORDER.indexOf(ua) - MATERIAL_UNIT_ORDER.indexOf(ub));
  const single = buckets.length <= 1;

  if (single) {
    return (
      <KpiCard
        id="kpi-mat-total-quantity"
        icon={<Ruler className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('materialBrowser.kpi.totalQuantity')}
        rawValue={summary.total_quantity}
        fraction
        renderValue={(animated) =>
          summary.dominant_unit
            ? `${formatQty(animated)} ${summary.dominant_unit}`
            : '—'
        }
        missing={!summary.dominant_unit}
        loading={loading}
        spark={<Sparkline segments={sparkSegments} variant="stacked" />}
      />
    );
  }

  // Mixed-unit layout: stacked rows, one per unit. No headline number —
  // the previous "61210 m" headline silently dropped m² / m³ buckets.
  return (
    <DashboardTile
      id="kpi-mat-total-quantity"
      className={cn(
        'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between h-[clamp(7rem,12vh,9rem)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium truncate">
          {t('materialBrowser.kpi.totalQuantity')}
        </span>
        <span className="shrink-0 text-muted-foreground">
          <Ruler className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />
        </span>
      </div>
      {loading ? (
        <ShimmerBlock className="h-[clamp(1.5rem,3vw,2.5rem)] w-[clamp(2.5rem,5vw,4rem)]" />
      ) : (
        <ul className="flex flex-col gap-[1px] flex-1 justify-center min-h-0">
          {buckets.map(([unit, value]) => (
            <li
              key={unit}
              className="flex items-baseline justify-between gap-2 text-[clamp(0.7rem,1vw,0.95rem)] tabular-nums leading-tight"
            >
              <span className="font-semibold tracking-tight">{formatQty(value)}</span>
              <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] uppercase tracking-wide text-muted-foreground/80">
                {unit}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!loading && (
        <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">
          <Sparkline segments={sparkSegments} variant="stacked" />
        </div>
      )}
    </DashboardTile>
  );
}

function KpiCard({
  id,
  icon,
  label,
  rawValue,
  renderValue,
  fraction,
  totalValue,
  missing,
  missingHint,
  subline,
  loading,
  tone = 'neutral',
  spark,
}: KpiCardProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(rawValue, { fraction });
  const showTotal = totalValue !== undefined && totalValue !== rawValue;

  return (
    <DashboardTile
      id={id}
      className={cn(
        'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between h-[clamp(7rem,12vh,9rem)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        toneStyles.card,
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium truncate">
          {label}
        </span>
        <span className={cn(toneStyles.icon, 'shrink-0')}>{icon}</span>
      </div>
      <div>
        <div className="flex items-baseline gap-[clamp(0.25rem,0.5vw,0.5rem)] flex-wrap">
          {loading ? (
            <ShimmerBlock className="h-[clamp(1.5rem,3vw,2.5rem)] w-[clamp(2.5rem,5vw,4rem)]" />
          ) : missing ? (
            <span
              className="text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none text-amber-600 dark:text-amber-400"
              title={missingHint}
              aria-label="missing"
            >
              —
            </span>
          ) : (
            <span
              className={cn(
                'text-[clamp(1.1rem,2vw,1.8rem)] font-semibold tabular-nums tracking-tight leading-none',
                toneStyles.value,
              )}
            >
              {renderValue(animated)}
            </span>
          )}
          {showTotal && !loading && !missing && totalValue !== undefined && (
            <span className="text-[clamp(0.65rem,0.9vw,0.95rem)] text-muted-foreground/70 tabular-nums leading-none">
              / {totalValue.toLocaleString()}
            </span>
          )}
        </div>
        {subline && !loading && !missing && (
          <div className="mt-0.5 text-[clamp(0.5rem,0.7vw,0.65rem)] text-muted-foreground/70">
            {subline}
          </div>
        )}
      </div>
      {spark && !loading && (
        <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">{spark}</div>
      )}
    </DashboardTile>
  );
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]',
        className,
      )}
    />
  );
}

function formatQty(n: number): string {
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

/**
 * "Updated N min ago" badge — same pattern as warehouse-v2's freshness
 * widget, retained from the previous KPI header.
 */
function MaterialsFreshness({
  dataUpdatedAt,
  tickMs = 10_000,
}: {
  dataUpdatedAt?: number;
  tickMs?: number;
}) {
  const { t } = useTranslation();
  const [, force] = useState(0);

  useEffect(() => {
    if (!dataUpdatedAt) return;
    const id = window.setInterval(() => force((n) => n + 1), tickMs);
    return () => window.clearInterval(id);
  }, [dataUpdatedAt, tickMs]);

  if (!dataUpdatedAt) return null;

  const ago = relativeAgo(Date.now() - dataUpdatedAt, t);

  return (
    <span
      className="inline-flex items-center gap-[clamp(0.25rem,0.4vw,0.5rem)] text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums"
      title={new Date(dataUpdatedAt).toLocaleString()}
    >
      <span className="relative inline-flex h-[clamp(0.375rem,0.55vw,0.55rem)] w-[clamp(0.375rem,0.55vw,0.55rem)]">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(158_70%_28%)] opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-full w-full rounded-full bg-[hsl(158_70%_28%)]" />
      </span>
      <span>{t('materialBrowser.live.updatedAgo', { ago })}</span>
    </span>
  );
}

function relativeAgo(
  diffMs: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 5) return t('materialBrowser.live.justNow');
  if (diffSec < 60) return t('materialBrowser.live.seconds', { count: diffSec });
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('materialBrowser.live.minutes', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('materialBrowser.live.hours', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  return t('materialBrowser.live.days', { count: diffDay });
}
