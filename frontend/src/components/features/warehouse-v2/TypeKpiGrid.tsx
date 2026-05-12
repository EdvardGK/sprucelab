import { useTranslation } from 'react-i18next';
import { Layers, Hash, BarChart3, HelpCircle, Unlink, AlertTriangle } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { useCountUp } from './useCountUp';

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
}

interface TypeKpiGridProps {
  stats: TypeKpiStats;
  loading?: boolean;
}

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

function trafficLight(percent: number, thresholds: { warn: number; danger: number }): Tone {
  if (percent <= 0) return 'good';
  if (percent >= thresholds.danger) return 'danger';
  if (percent >= thresholds.warn) return 'warning';
  return 'warning';
}

export function TypeKpiGrid({ stats, loading }: TypeKpiGridProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-3 h-full">
      <KpiCard
        id="kpi-total-types"
        icon={<Layers className="h-4 w-4" />}
        label={t('typesV2.stats.totalTypes')}
        value={stats.totalTypes}
        loading={loading}
      />
      <KpiCard
        id="kpi-instances"
        icon={<Hash className="h-4 w-4" />}
        label={t('typesV2.stats.instances')}
        value={stats.instances}
        loading={loading}
      />
      <KpiCard
        id="kpi-avg-per-type"
        icon={<BarChart3 className="h-4 w-4" />}
        label={t('typesV2.stats.avgPerType')}
        value={stats.avgInstancesPerType}
        loading={loading}
        fraction
      />
      <KpiCard
        id="kpi-untyped"
        icon={<HelpCircle className="h-4 w-4" />}
        label={t('typesV2.stats.untyped')}
        value={stats.untypedInstances}
        subValue={
          stats.instances > 0
            ? t('typesV2.stats.percentOfInstances', { percent: stats.untypedPercent.toFixed(1) })
            : undefined
        }
        loading={loading}
        tone={trafficLight(stats.untypedPercent, { warn: 5, danger: 15 })}
      />
      <KpiCard
        id="kpi-orphan"
        icon={<Unlink className="h-4 w-4" />}
        label={t('typesV2.stats.orphan')}
        value={stats.orphanTypes}
        subValue={
          stats.totalTypes > 0
            ? t('typesV2.stats.percentOfTypes', { percent: stats.orphanPercent.toFixed(1) })
            : undefined
        }
        loading={loading}
        tone={trafficLight(stats.orphanPercent, { warn: 10, danger: 25 })}
      />
      <KpiCard
        id="kpi-missing"
        icon={<AlertTriangle className="h-4 w-4" />}
        label={t('typesV2.stats.missingClassification')}
        value={stats.missingClassification}
        subValue={
          stats.totalTypes > 0
            ? t('typesV2.stats.percentOfTypes', { percent: stats.missingPercent.toFixed(1) })
            : undefined
        }
        loading={loading}
        tone={trafficLight(stats.missingPercent, { warn: 25, danger: 60 })}
      />
    </div>
  );
}

interface KpiCardProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  subValue?: string;
  loading?: boolean;
  tone?: Tone;
  fraction?: boolean;
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
  subValue,
  loading,
  tone = 'neutral',
  fraction,
}: KpiCardProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(value, { fraction });
  return (
    <DashboardTile
      id={id}
      className={cn(
        'p-3 flex flex-col justify-between h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        toneStyles.card
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[0.65rem] uppercase tracking-wide font-medium truncate">{label}</span>
        <span className={toneStyles.icon}>{icon}</span>
      </div>
      <div>
        <div className={cn('text-2xl font-semibold tabular-nums tracking-tight leading-none', toneStyles.value)}>
          {loading ? (
            <ShimmerBlock className="h-7 w-16" />
          ) : fraction ? (
            animated.toFixed(1)
          ) : (
            animated.toLocaleString()
          )}
        </div>
        {subValue && !loading && (
          <div className="mt-1 text-[0.65rem] text-muted-foreground tabular-nums">{subValue}</div>
        )}
      </div>
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
