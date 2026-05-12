import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Hash, BarChart3, HelpCircle, Unlink, AlertTriangle } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { Sparkline, type SparkSegment } from './Sparkline';
import { useCountUp } from './useCountUp';

// Discipline palette — mirrors the treemap colors so KPI sparklines and the
// treemap visually share a vocabulary.
const KPI_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

function toSegments(
  distribution: Record<string, number>,
  classColors?: Map<string, string>,
  limit = 12
): SparkSegment[] {
  const entries = Object.entries(distribution)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  return entries.map(([key, value], i) => ({
    key,
    value,
    color: classColors?.get(key) ?? KPI_PALETTE[i % KPI_PALETTE.length],
    label: key.replace(/^Ifc/, ''),
  }));
}

export interface TypeKpiStats {
  totalTypes: number;
  ifcClasses: number;
  instances: number;
  avgInstancesPerType: number;
  untypedInstances: number;
  untypedPercent: number;
  orphanTypes: number;
  orphanPercent: number;
  missingClassification: number;
  missingPercent: number;
  // Distributions for sparklines
  typesByClass: Record<string, number>;
  instancesByClass: Record<string, number>;
  untypedByClass: Record<string, number>;
  orphanByClass: Record<string, number>;
  missingByClass: Record<string, number>;
}

interface TypeKpiGridProps {
  stats: TypeKpiStats;
  /** Unfiltered totals shown faded beside each filtered value when set. */
  totalStats?: TypeKpiStats;
  loading?: boolean;
  classColors?: Map<string, string>;
  /** When set (not 'all'), sparklines render as single-class progress bars
      in that class's color instead of full-distribution stacked bars. */
  activeIfcClass?: string;
}

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

function trafficLight(percent: number, thresholds: { warn: number; danger: number }): Tone {
  if (percent <= 0) return 'good';
  if (percent >= thresholds.danger) return 'danger';
  if (percent >= thresholds.warn) return 'warning';
  return 'warning';
}

export function TypeKpiGrid({
  stats,
  totalStats,
  loading,
  classColors,
  activeIfcClass = 'all',
}: TypeKpiGridProps) {
  const { t } = useTranslation();
  const isFiltered = activeIfcClass !== 'all';
  const filteredColor = isFiltered ? classColors?.get(activeIfcClass) : undefined;

  // Memoize sparkline data so the count-up animation doesn't re-key on render.
  const typesSegments = useMemo(
    () => toSegments(stats.typesByClass, classColors),
    [stats.typesByClass, classColors]
  );
  const instancesSegments = useMemo(
    () => toSegments(stats.instancesByClass, classColors),
    [stats.instancesByClass, classColors]
  );
  const untypedSegments = useMemo(
    () => toSegments(stats.untypedByClass, classColors),
    [stats.untypedByClass, classColors]
  );
  const missingSegments = useMemo(
    () => toSegments(stats.missingByClass, classColors),
    [stats.missingByClass, classColors]
  );

  // When a class filter is active, replace the distribution sparkline with a
  // single-class progress strip in that class's treemap color showing the
  // filtered slice's share of the unfiltered total.
  const renderSpark = (
    distributionSpark: React.ReactNode,
    filteredValue: number,
    totalValue: number | undefined
  ): React.ReactNode => {
    if (!isFiltered) return distributionSpark;
    const total = totalValue ?? 0;
    const pct = total > 0 ? (filteredValue / total) * 100 : 0;
    return (
      <Sparkline
        segments={[]}
        variant="progress"
        progressValue={pct}
        progressColor={filteredColor ?? 'hsl(158 70% 28%)'}
      />
    );
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-[clamp(0.5rem,1vw,1rem)] h-full">
      <KpiCard
        id="kpi-total-types"
        icon={<Layers className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('typesV2.stats.totalTypes')}
        value={stats.totalTypes}
        totalValue={totalStats?.totalTypes}
        loading={loading}
        spark={renderSpark(
          <Sparkline segments={typesSegments} variant="stacked" />,
          stats.totalTypes,
          totalStats?.totalTypes
        )}
      />
      <KpiCard
        id="kpi-instances"
        icon={<Hash className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('typesV2.stats.instances')}
        value={stats.instances}
        totalValue={totalStats?.instances}
        loading={loading}
        spark={renderSpark(
          <Sparkline segments={instancesSegments} variant="stacked" />,
          stats.instances,
          totalStats?.instances
        )}
      />
      <KpiCard
        id="kpi-avg-per-type"
        icon={<BarChart3 className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('typesV2.stats.avgPerType')}
        value={stats.avgInstancesPerType}
        totalValue={totalStats?.avgInstancesPerType}
        loading={loading}
        fraction
        spark={renderSpark(
          <Sparkline segments={instancesSegments} variant="stacked" />,
          stats.instances,
          totalStats?.instances
        )}
      />
      <KpiCard
        id="kpi-untyped"
        icon={<HelpCircle className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('typesV2.stats.untyped')}
        value={stats.untypedInstances}
        totalValue={totalStats?.untypedInstances}
        subValue={
          stats.instances > 0
            ? t('typesV2.stats.percentOfInstances', { percent: stats.untypedPercent.toFixed(1) })
            : undefined
        }
        loading={loading}
        tone={trafficLight(stats.untypedPercent, { warn: 5, danger: 15 })}
        spark={renderSpark(
          untypedSegments.length > 0
            ? <Sparkline segments={untypedSegments} variant="stacked" />
            : <Sparkline segments={[]} variant="progress" progressValue={0} />,
          stats.untypedInstances,
          totalStats?.untypedInstances
        )}
      />
      <KpiCard
        id="kpi-orphan"
        icon={<Unlink className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('typesV2.stats.orphan')}
        value={stats.orphanTypes}
        totalValue={totalStats?.orphanTypes}
        subValue={
          stats.totalTypes > 0
            ? t('typesV2.stats.percentOfTypes', { percent: stats.orphanPercent.toFixed(1) })
            : undefined
        }
        loading={loading}
        tone={trafficLight(stats.orphanPercent, { warn: 10, danger: 25 })}
        spark={renderSpark(
          <Sparkline
            segments={[]}
            variant="progress"
            progressValue={stats.orphanPercent}
            progressColor="hsl(25 96% 61%)"
          />,
          stats.orphanTypes,
          totalStats?.orphanTypes
        )}
      />
      <KpiCard
        id="kpi-missing"
        icon={<AlertTriangle className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('typesV2.stats.missingClassification')}
        value={stats.missingClassification}
        totalValue={totalStats?.missingClassification}
        subValue={
          stats.totalTypes > 0
            ? t('typesV2.stats.percentOfTypes', { percent: stats.missingPercent.toFixed(1) })
            : undefined
        }
        loading={loading}
        tone={trafficLight(stats.missingPercent, { warn: 25, danger: 60 })}
        spark={renderSpark(
          <Sparkline segments={missingSegments} variant="stacked" />,
          stats.missingClassification,
          totalStats?.missingClassification
        )}
      />
    </div>
  );
}

interface KpiCardProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  /** Unfiltered total shown in parens beside `value` when different. */
  totalValue?: number;
  subValue?: string;
  loading?: boolean;
  tone?: Tone;
  fraction?: boolean;
  spark?: React.ReactNode;
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

function KpiCard({
  id,
  icon,
  label,
  value,
  totalValue,
  subValue,
  loading,
  tone = 'neutral',
  fraction,
  spark,
}: KpiCardProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(value, { fraction });
  // Snap the total — no animation, just a faded reference. Show it only
  // when it actually differs from the filtered value (eps tolerance for
  // the avg-per-type case).
  const showTotal =
    totalValue !== undefined &&
    Math.abs(totalValue - value) > (fraction ? 0.05 : 0);
  const totalDisplay = totalValue !== undefined
    ? (fraction ? totalValue.toFixed(1) : totalValue.toLocaleString())
    : null;

  return (
    <DashboardTile
      id={id}
      className={cn(
        'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        toneStyles.card
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
          <span
            className={cn(
              'text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none',
              toneStyles.value
            )}
          >
            {loading ? (
              <ShimmerBlock className="h-[clamp(1.5rem,3vw,2.5rem)] w-[clamp(2.5rem,5vw,4rem)]" />
            ) : fraction ? (
              animated.toFixed(1)
            ) : (
              animated.toLocaleString()
            )}
          </span>
          {showTotal && !loading && (
            <span className="text-[clamp(0.65rem,0.9vw,0.95rem)] text-muted-foreground/70 tabular-nums leading-none">
              / {totalDisplay}
            </span>
          )}
        </div>
        {subValue && !loading && (
          <div className="mt-[clamp(0.125rem,0.4vh,0.375rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums">
            {subValue}
          </div>
        )}
      </div>
      {spark && !loading && <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">{spark}</div>}
    </DashboardTile>
  );
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]',
        className
      )}
    />
  );
}
