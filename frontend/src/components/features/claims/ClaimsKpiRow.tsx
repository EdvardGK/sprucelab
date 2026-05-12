import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, UserCheck, CheckCircle2, Timer } from 'lucide-react';

import { ModelsKpiTile } from '@/components/features/project-models/ModelsKpiTile';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import type { ProjectClaimsKpis, ClaimsKpiSpark } from '@/hooks/useClaimsKpis';

const SPARK_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171',
];

function toSegments(items: ClaimsKpiSpark[]): SparkSegment[] {
  return items.map((it, i) => ({
    key: it.key,
    value: it.value,
    color: SPARK_PALETTE[i % SPARK_PALETTE.length],
    label: it.label,
  }));
}

interface ClaimsKpiRowProps {
  kpis: ProjectClaimsKpis;
}

/**
 * 4-tile project-level KPI row for the Claims page. Same primitive as
 * the IFC Models row (ModelsKpiTile + Sparkline), so visual language
 * rhymes across surfaces. Modelers-own-data: amber em-dash where the
 * backend can't supply the value (assignee, time-to-resolve).
 */
export function ClaimsKpiRow({ kpis }: ClaimsKpiRowProps) {
  const { t } = useTranslation();

  const resolutionsSegs = useMemo(
    () => toSegments(kpis.resolutionsPerDay),
    [kpis.resolutionsPerDay],
  );

  const avgTimeDisplay =
    kpis.avgTimeToResolveDays === null
      ? undefined
      : `${kpis.avgTimeToResolveDays.toFixed(1)} d`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
      <ModelsKpiTile
        id="kpi-claims-open"
        icon={<Inbox className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('claims.kpi.open')}
        value={kpis.openClaims}
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="kpi-claims-assigned-me"
        icon={<UserCheck className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('claims.kpi.assignedToMe')}
        value={kpis.assignedToMe ?? 0}
        unavailable={kpis.assignedToMe === null}
        tone={
          kpis.assignedToMe !== null && kpis.assignedToMe > 0 ? 'warning' : 'neutral'
        }
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="kpi-claims-resolved-week"
        icon={<CheckCircle2 className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('claims.kpi.resolvedThisWeek')}
        value={kpis.resolvedThisWeek}
        tone={kpis.resolvedThisWeek > 0 ? 'good' : 'neutral'}
        loading={kpis.isLoading}
        spark={<Sparkline segments={resolutionsSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-claims-avg-time"
        icon={<Timer className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('claims.kpi.avgTimeToResolve')}
        display={avgTimeDisplay}
        unavailable={kpis.avgTimeToResolveDays === null}
        loading={kpis.isLoading}
      />
    </div>
  );
}
