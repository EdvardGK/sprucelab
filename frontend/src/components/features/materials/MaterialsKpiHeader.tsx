import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Boxes, Layers as LayersIcon, Tag, Leaf, ShoppingCart, Server } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import { familyColor } from './familyColors';
import type {
  AggregatedMaterial,
  ProjectMaterialsSummary,
} from '@/hooks/use-project-materials';

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

interface MaterialsKpiHeaderProps {
  summary: ProjectMaterialsSummary;
  materials: AggregatedMaterial[];
  loading?: boolean;
  dataUpdatedAt?: number;
}

/**
 * KPI grid + live freshness badge for the Materials page. Mirrors the
 * shape of TypeKpiGrid: 6 cards, tone rings, count-up, mini sparkline,
 * raw counts (not percentages) — gaps show an amber em-dash.
 */
export function MaterialsKpiHeader({
  summary,
  materials,
  loading,
  dataUpdatedAt,
}: MaterialsKpiHeaderProps) {
  const { t } = useTranslation();

  // Distribution by family for sparklines, reused across cards. The
  // dominant-family sparkline gives every KPI a visual hook into the
  // family palette the rest of the page uses.
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

  const classifiedSegments: SparkSegment[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of materials) {
      if (m.family !== 'other' && m.family_confidence !== 'unknown') {
        counts[m.family] = (counts[m.family] || 0) + 1;
      }
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

  const procurementSegments: SparkSegment[] = useMemo(() => {
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

  const totalModels = summary.models_loaded + summary.models_pending;

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
          value={summary.total_materials}
          totalValue={undefined}
          loading={loading}
          spark={<Sparkline segments={familySegments} variant="stacked" />}
        />
        <KpiCard
          id="kpi-mat-total-sets"
          icon={<LayersIcon className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.totalSets')}
          value={summary.total_sets}
          loading={loading}
          spark={<Sparkline segments={familySegments} variant="stacked" />}
        />
        <KpiCard
          id="kpi-mat-classified"
          icon={<Tag className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.classified')}
          value={summary.classified_count}
          totalValue={summary.total_materials}
          loading={loading}
          tone={toneFromShare(summary.classified_count, summary.total_materials, {
            warn: 0.7,
            good: 0.9,
          })}
          spark={
            classifiedSegments.length > 0 ? (
              <Sparkline segments={classifiedSegments} variant="stacked" />
            ) : (
              <Sparkline
                segments={[]}
                variant="progress"
                progressValue={0}
              />
            )
          }
        />
        <KpiCard
          id="kpi-mat-epd"
          icon={<Leaf className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.epdLinked')}
          value={summary.epd_linked_count}
          totalValue={summary.total_materials}
          missing={summary.epd_linked_count === 0 && summary.total_materials > 0}
          loading={loading}
          tone={
            summary.epd_linked_count === 0
              ? 'danger'
              : toneFromShare(summary.epd_linked_count, summary.total_materials, {
                  warn: 0.5,
                  good: 0.9,
                })
          }
          spark={
            epdSegments.length > 0 ? (
              <Sparkline segments={epdSegments} variant="stacked" />
            ) : (
              <Sparkline
                segments={[]}
                variant="progress"
                progressValue={0}
                progressColor="hsl(0 70% 55%)"
              />
            )
          }
        />
        <KpiCard
          id="kpi-mat-procurement"
          icon={<ShoppingCart className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.procurementLinked')}
          value={summary.procurement_linked_count}
          totalValue={summary.total_materials}
          missing={summary.procurement_linked_count === 0 && summary.total_materials > 0}
          loading={loading}
          tone={
            summary.procurement_linked_count === 0
              ? 'danger'
              : toneFromShare(summary.procurement_linked_count, summary.total_materials, {
                  warn: 0.5,
                  good: 0.9,
                })
          }
          spark={
            procurementSegments.length > 0 ? (
              <Sparkline segments={procurementSegments} variant="stacked" />
            ) : (
              <Sparkline
                segments={[]}
                variant="progress"
                progressValue={0}
                progressColor="hsl(0 70% 55%)"
              />
            )
          }
        />
        <KpiCard
          id="kpi-mat-models"
          icon={<Server className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
          label={t('materialBrowser.kpi.modelsLoaded')}
          value={summary.models_loaded}
          totalValue={totalModels}
          loading={loading}
          tone={
            summary.models_pending > 0
              ? 'warning'
              : summary.models_loaded === 0
              ? 'neutral'
              : 'good'
          }
          spark={
            <Sparkline
              segments={[]}
              variant="progress"
              progressValue={
                totalModels > 0 ? (summary.models_loaded / totalModels) * 100 : 0
              }
              progressColor={
                summary.models_pending > 0
                  ? 'hsl(25 96% 61%)'
                  : 'hsl(158 70% 28%)'
              }
            />
          }
        />
      </div>
    </div>
  );
}

function toneFromShare(
  count: number,
  total: number,
  thresholds: { warn: number; good: number },
): Tone {
  if (total <= 0) return 'neutral';
  const share = count / total;
  if (share >= thresholds.good) return 'good';
  if (share >= thresholds.warn) return 'warning';
  return 'danger';
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
  value: number;
  /** Unfiltered/total reference shown faded as "/ N". */
  totalValue?: number;
  /** When true and value is 0, the value renders as an amber em-dash. */
  missing?: boolean;
  loading?: boolean;
  tone?: Tone;
  spark?: React.ReactNode;
}

function KpiCard({
  id,
  icon,
  label,
  value,
  totalValue,
  missing,
  loading,
  tone = 'neutral',
  spark,
}: KpiCardProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(value);
  const showTotal = totalValue !== undefined && totalValue !== value;
  const showMissing = missing && value === 0;

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
          ) : showMissing ? (
            <span
              className="text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none text-amber-600 dark:text-amber-400"
              aria-label="missing"
            >
              —
            </span>
          ) : (
            <span
              className={cn(
                'text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none',
                toneStyles.value,
              )}
            >
              {animated.toLocaleString()}
            </span>
          )}
          {showTotal && !loading && !showMissing && totalValue !== undefined && (
            <span className="text-[clamp(0.65rem,0.9vw,0.95rem)] text-muted-foreground/70 tabular-nums leading-none">
              / {totalValue.toLocaleString()}
            </span>
          )}
        </div>
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

/**
 * "Updated N min ago" badge with a pulsing green dot. Re-renders on an
 * interval so the relative time stays current without a hard refetch.
 * Mirrors the LiveFreshness widget from warehouse-v2 but speaks the
 * materialBrowser i18n namespace.
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
