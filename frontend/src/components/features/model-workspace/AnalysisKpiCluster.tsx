import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  Layers3,
  Network,
  Shapes,
  HelpCircle,
  Unlink,
} from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import type { ModelAnalysis } from '@/lib/api-types';

const KPI_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

export interface AnalysisKpiClusterProps {
  analysis: ModelAnalysis;
  /** Optional fallbacks when the model record has the raw counts but the
   *  analysis hasn't materialised systems/etc. yet. */
  elementCountFallback?: number;
  storeyCountFallback?: number;
  systemCountFallback?: number | null;
  /** Class→color map matching the treemap (without `Ifc` prefix). */
  classColorMap?: Record<string, string>;
}

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

const TONE_STYLES: Record<Tone, { card: string; value: string; icon: string }> = {
  neutral: {
    card: '',
    value: 'text-text-primary',
    icon: 'text-text-tertiary',
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

function trafficLight(
  percent: number,
  thresholds: { warn: number; danger: number }
): Tone {
  if (percent <= 0) return 'good';
  if (percent >= thresholds.danger) return 'danger';
  if (percent >= thresholds.warn) return 'warning';
  return 'warning';
}

export function AnalysisKpiCluster({
  analysis,
  elementCountFallback,
  storeyCountFallback,
  systemCountFallback,
  classColorMap,
}: AnalysisKpiClusterProps) {
  const { t } = useTranslation();

  const stats = useMemo(() => computeKpiStats(analysis), [analysis]);

  // Sparkline data per metric. We always use the unfiltered analysis set
  // so the macro vocabulary stays cohesive across the cluster.
  const instancesSegments = useMemo(
    () => toSegments(stats.instancesByClass, classColorMap),
    [stats.instancesByClass, classColorMap]
  );
  const typesSegments = useMemo(
    () => toSegments(stats.typesByClass, classColorMap),
    [stats.typesByClass, classColorMap]
  );
  const untypedSegments = useMemo(
    () => toSegments(stats.untypedByClass, classColorMap),
    [stats.untypedByClass, classColorMap]
  );

  const elementCount = stats.totalInstances || elementCountFallback || 0;
  const storeyCount =
    analysis.total_storeys || storeyCountFallback || 0;
  const systemCount = systemCountFallback ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[clamp(0.4rem,0.8vw,0.75rem)]">
      <KpiTile
        id="kpi-elements"
        icon={<Boxes className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('modelDash.kpis.elements')}
        value={elementCount}
        spark={
          <Sparkline segments={instancesSegments} variant="stacked" />
        }
      />
      <KpiTile
        id="kpi-storeys"
        icon={<Layers3 className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('modelDash.kpis.storeys')}
        value={storeyCount}
        missingValue={storeyCount === 0}
      />
      <KpiTile
        id="kpi-systems"
        icon={<Network className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('modelDash.kpis.systems')}
        value={systemCount}
        missingValue={systemCount === 0 && systemCountFallback === null}
      />
      <KpiTile
        id="kpi-types"
        icon={<Shapes className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('modelDash.kpis.types')}
        value={analysis.total_types}
        spark={<Sparkline segments={typesSegments} variant="stacked" />}
      />
      <KpiTile
        id="kpi-untyped"
        icon={<HelpCircle className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('modelDash.kpis.untyped')}
        value={stats.untypedPercent}
        suffix="%"
        fraction
        tone={trafficLight(stats.untypedPercent, { warn: 5, danger: 15 })}
        subValue={t('modelDash.kpis.percentOfInstancesShort', {
          n: stats.untypedInstances.toLocaleString(),
        })}
        spark={
          untypedSegments.length > 0 ? (
            <Sparkline segments={untypedSegments} variant="stacked" />
          ) : (
            <Sparkline
              segments={[]}
              variant="progress"
              progressValue={stats.untypedPercent}
              progressColor="hsl(25 96% 61%)"
            />
          )
        }
      />
      <KpiTile
        id="kpi-orphan"
        icon={<Unlink className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('modelDash.kpis.orphan')}
        value={stats.orphanPercent}
        suffix="%"
        fraction
        tone={trafficLight(stats.orphanPercent, { warn: 10, danger: 25 })}
        subValue={t('modelDash.kpis.percentOfTypesShort', {
          n: stats.orphanTypes.toLocaleString(),
        })}
        spark={
          <Sparkline
            segments={[]}
            variant="progress"
            progressValue={stats.orphanPercent}
            progressColor="hsl(25 96% 61%)"
          />
        }
      />
    </div>
  );
}

interface KpiTileProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  fraction?: boolean;
  /** When true, render an amber em-dash instead of the value (modelers-own-data). */
  missingValue?: boolean;
  subValue?: string;
  tone?: Tone;
  spark?: React.ReactNode;
}

function KpiTile({
  id,
  icon,
  label,
  value,
  suffix,
  fraction,
  missingValue,
  subValue,
  tone = 'neutral',
  spark,
}: KpiTileProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(value, { fraction });

  return (
    <DashboardTile
      id={id}
      className={cn(
        'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md min-h-[clamp(5.5rem,11vh,7.5rem)]',
        toneStyles.card
      )}
    >
      <div className="flex items-center justify-between text-text-tertiary">
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium truncate">
          {label}
        </span>
        <span className={cn(toneStyles.icon, 'shrink-0')}>{icon}</span>
      </div>
      <div>
        <div className="flex items-baseline gap-[clamp(0.15rem,0.3vw,0.3rem)] flex-wrap">
          {missingValue ? (
            <span
              className="text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums leading-none text-amber-600/80 dark:text-amber-400/80"
              title="—"
            >
              —
            </span>
          ) : (
            <>
              <span
                className={cn(
                  'text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none',
                  toneStyles.value
                )}
              >
                {fraction ? animated.toFixed(1) : animated.toLocaleString()}
              </span>
              {suffix && (
                <span
                  className={cn(
                    'text-[clamp(0.7rem,0.9vw,0.95rem)] tabular-nums leading-none',
                    toneStyles.value
                  )}
                >
                  {suffix}
                </span>
              )}
            </>
          )}
        </div>
        {subValue && (
          <div className="mt-[clamp(0.125rem,0.4vh,0.375rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] text-text-tertiary tabular-nums truncate">
            {subValue}
          </div>
        )}
      </div>
      {spark && (
        <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">{spark}</div>
      )}
    </DashboardTile>
  );
}

interface KpiStats {
  totalInstances: number;
  untypedInstances: number;
  untypedPercent: number;
  orphanTypes: number;
  orphanPercent: number;
  typesByClass: Record<string, number>;
  instancesByClass: Record<string, number>;
  untypedByClass: Record<string, number>;
}

function computeKpiStats(analysis: ModelAnalysis): KpiStats {
  let totalInstances = 0;
  let untypedInstances = 0;
  let orphanTypes = 0;
  const typesByClass: Record<string, number> = {};
  const instancesByClass: Record<string, number> = {};
  const untypedByClass: Record<string, number> = {};

  for (const t of analysis.types) {
    totalInstances += t.instance_count;
    const cls = (t.element_class || t.type_class.replace(/Type$/, '')).replace(
      /^Ifc/,
      ''
    );
    typesByClass[cls] = (typesByClass[cls] || 0) + 1;
    instancesByClass[cls] =
      (instancesByClass[cls] || 0) + t.instance_count;

    if (t.is_untyped) {
      untypedInstances += t.instance_count;
      untypedByClass[cls] =
        (untypedByClass[cls] || 0) + t.instance_count;
    }
    // "Orphan" = type definition with zero instances.
    if (t.is_empty || t.instance_count === 0) {
      orphanTypes++;
    }
  }

  const untypedPercent =
    totalInstances > 0 ? (untypedInstances / totalInstances) * 100 : 0;
  const orphanPercent =
    analysis.total_types > 0 ? (orphanTypes / analysis.total_types) * 100 : 0;

  return {
    totalInstances,
    untypedInstances,
    untypedPercent,
    orphanTypes,
    orphanPercent,
    typesByClass,
    instancesByClass,
    untypedByClass,
  };
}

function toSegments(
  distribution: Record<string, number>,
  classColors?: Record<string, string>,
  limit = 12
): SparkSegment[] {
  const entries = Object.entries(distribution)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  return entries.map(([key, value], i) => ({
    key,
    value,
    color: classColors?.[key] ?? KPI_PALETTE[i % KPI_PALETTE.length],
    label: key,
  }));
}
