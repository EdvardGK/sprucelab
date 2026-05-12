import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileImage, CheckCircle2, CircleDashed } from 'lucide-react';

import { ModelsKpiTile } from '@/components/features/project-models/ModelsKpiTile';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import type { ProjectDrawingsKpis, DrawingsKpiSpark } from '@/hooks/useDrawingsKpis';

const SPARK_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8',
];

function toSegments(items: DrawingsKpiSpark[]): SparkSegment[] {
  return items.map((it, i) => ({
    key: it.key,
    value: it.value,
    color: SPARK_PALETTE[i % SPARK_PALETTE.length],
    label: it.label,
  }));
}

interface DrawingsKpiRowProps {
  kpis: ProjectDrawingsKpis;
}

/**
 * 3-tile project-level KPI row for the Drawings page. Mirrors the
 * Models / Claims / Documents rows so the visual language stays
 * consistent. Modelers-own-data: amber em-dash on unregistered when
 * the project has no drawings yet.
 */
export function DrawingsKpiRow({ kpis }: DrawingsKpiRowProps) {
  const { t } = useTranslation();

  const sheetSegs = useMemo(
    () => toSegments(kpis.drawingsBySheet),
    [kpis.drawingsBySheet],
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-[clamp(0.5rem,1vw,1rem)]">
      <ModelsKpiTile
        id="kpi-drawings-total"
        icon={<FileImage className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('drawings.kpi.total')}
        value={kpis.totalDrawings}
        loading={kpis.isLoading}
        spark={<Sparkline segments={sheetSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-drawings-registered"
        icon={<CheckCircle2 className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('drawings.kpi.registered')}
        value={kpis.registered}
        tone={kpis.registered > 0 ? 'good' : 'neutral'}
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="kpi-drawings-unregistered"
        icon={<CircleDashed className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('drawings.kpi.unregistered')}
        value={kpis.unregistered}
        tone={kpis.unregistered > 0 ? 'warning' : 'neutral'}
        loading={kpis.isLoading}
      />
    </div>
  );
}
