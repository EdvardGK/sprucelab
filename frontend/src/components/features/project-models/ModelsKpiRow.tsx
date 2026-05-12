import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Hash, Layers3, HardDrive, Timer, Clock } from 'lucide-react';

import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { formatFileSize } from '@/lib/format';
import type { ProjectModelsKpis, ModelKpiSpark } from '@/hooks/useProjectModelsKpis';
import { ModelsKpiTile } from './ModelsKpiTile';

// Discipline-friendly palette — same vocabulary as TypeKpiGrid so the
// project-level row and the per-type page rhyme visually.
const SPARK_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

function toSegments(items: ModelKpiSpark[]): SparkSegment[] {
  return items.map((it, i) => ({
    key: it.key,
    value: it.value,
    color: SPARK_PALETTE[i % SPARK_PALETTE.length],
    label: it.label,
  }));
}

function relativeTime(
  iso: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (!iso) return '—';
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return t('projectModels.relative.justNow');
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('projectModels.relative.minutesAgo', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('projectModels.relative.hoursAgo', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t('projectModels.relative.daysAgo', { count: diffDay });
  const diffMo = Math.round(diffDay / 30);
  return t('projectModels.relative.monthsAgo', { count: diffMo });
}

interface ModelsKpiRowProps {
  kpis: ProjectModelsKpis;
}

/**
 * 6-tile project-level KPI row for the IFC Models page. Mirrors the
 * `<TypeKpiGrid>` aesthetic (tone rings, sparklines, count-up, tabular
 * nums) but the values are model-scoped, not type-scoped.
 *
 * Layout: 2 columns on mobile, 3 on tablet, 6 across on desktop so the
 * row stays a single line above the model cards on the laptop target.
 */
export function ModelsKpiRow({ kpis }: ModelsKpiRowProps) {
  const { t } = useTranslation();

  const elementsSegs = useMemo(() => toSegments(kpis.elementsByModel), [kpis.elementsByModel]);
  const storeysSegs = useMemo(() => toSegments(kpis.storeysByModel), [kpis.storeysByModel]);
  const sizesSegs = useMemo(() => toSegments(kpis.sizesByModel), [kpis.sizesByModel]);
  const modelsPerWeekSegs = useMemo(
    () => toSegments(kpis.modelsPerWeek),
    [kpis.modelsPerWeek]
  );

  // File-size: rounded to MB for the headline, with the raw bytes shown
  // via the formatFileSize helper. The unit pivots, so we use `display`
  // instead of useCountUp + suffix to keep the units honest.
  const sizeDisplay = formatFileSize(kpis.totalFileSizeBytes);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[clamp(0.5rem,1vw,1rem)]">
      <ModelsKpiTile
        id="kpi-total-models"
        icon={<Box className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectModels.kpi.totalModels')}
        value={kpis.totalModels}
        loading={kpis.isLoading}
        spark={<Sparkline segments={modelsPerWeekSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-total-elements"
        icon={<Hash className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectModels.kpi.totalElements')}
        value={kpis.totalElements}
        loading={kpis.isLoading}
        spark={<Sparkline segments={elementsSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-total-storeys"
        icon={<Layers3 className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectModels.kpi.totalStoreys')}
        value={kpis.totalStoreys}
        loading={kpis.isLoading}
        spark={<Sparkline segments={storeysSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-total-size"
        icon={<HardDrive className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectModels.kpi.totalSize')}
        display={kpis.isLoading ? undefined : sizeDisplay}
        loading={kpis.isLoading}
        spark={<Sparkline segments={sizesSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-avg-processing"
        icon={<Timer className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectModels.kpi.avgProcessing')}
        value={kpis.avgProcessingSeconds ?? 0}
        unavailable={kpis.avgProcessingSeconds === null}
        suffix=" s"
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="kpi-latest-upload"
        icon={<Clock className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectModels.kpi.latestUpload')}
        display={kpis.isLoading ? undefined : relativeTime(kpis.latestUploadIso, t)}
        loading={kpis.isLoading}
      />
    </div>
  );
}
