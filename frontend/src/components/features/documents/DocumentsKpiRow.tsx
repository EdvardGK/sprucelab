import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Files, MessageSquareWarning, Clock, ListChecks } from 'lucide-react';

import { ModelsKpiTile } from '@/components/features/project-models/ModelsKpiTile';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import type { ProjectDocumentsKpis, DocumentsKpiSpark } from '@/hooks/useDocumentsKpis';

const SPARK_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8',
];

function toSegments(items: DocumentsKpiSpark[]): SparkSegment[] {
  return items.map((it, i) => ({
    key: it.key,
    value: it.value,
    color: SPARK_PALETTE[i % SPARK_PALETTE.length],
    label: it.label,
  }));
}

interface DocumentsKpiRowProps {
  kpis: ProjectDocumentsKpis;
}

/**
 * 4-tile project-level KPI row for the Documents page. Mirrors the
 * Models / Claims rows so the visual language stays consistent.
 * Modelers-own-data: amber em-dash for unavailable values (no fabricated
 * "classified %"). Raw counts only.
 */
export function DocumentsKpiRow({ kpis }: DocumentsKpiRowProps) {
  const { t } = useTranslation();

  const uploadsSegs = useMemo(
    () => toSegments(kpis.uploadsPerWeek),
    [kpis.uploadsPerWeek],
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
      <ModelsKpiTile
        id="kpi-docs-total"
        icon={<Files className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('documents.kpi.total')}
        value={kpis.totalDocuments}
        loading={kpis.isLoading}
        spark={<Sparkline segments={uploadsSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="kpi-docs-with-claims"
        icon={<MessageSquareWarning className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('documents.kpi.withClaims')}
        value={kpis.withClaims}
        tone={kpis.withClaims > 0 ? 'warning' : 'neutral'}
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="kpi-docs-pending"
        icon={<Clock className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('documents.kpi.pendingReview')}
        value={kpis.pendingReview}
        tone={kpis.pendingReview > 0 ? 'warning' : 'neutral'}
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="kpi-docs-classified"
        icon={<ListChecks className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('documents.kpi.classified')}
        value={kpis.classified ?? 0}
        unavailable={kpis.classified === null || kpis.classified === 0}
        loading={kpis.isLoading}
      />
    </div>
  );
}
