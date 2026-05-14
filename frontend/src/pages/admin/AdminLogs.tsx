import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ScrollText } from 'lucide-react';
import { KpiTile, SectionCard, FailureItem } from '@/components/admin/primitives';
import { formatRelative } from '@/components/admin/helpers';
import type { AdminOutletContext, FailureKind, FailureRow } from '@/components/admin/types';
import { cn } from '@/lib/utils';

/**
 * AdminLogs — the dedicated log page. Aggregates failure rows from every
 * processing path (ExtractionRun, PipelineRun, Model.parsing_status,
 * Model.fragments_status) into one filterable feed.
 *
 * Aggregated counts live as KPIs at the top — same numbers as on /admin,
 * here with full drill-in.
 */

const KIND_OPTIONS: { value: FailureKind | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'admin.logs.filter.all' },
  { value: 'extraction', labelKey: 'admin.failures.kind.extraction' },
  { value: 'pipeline', labelKey: 'admin.failures.kind.pipeline' },
  { value: 'model_parsing', labelKey: 'admin.failures.kind.model_parsing' },
  { value: 'fragments', labelKey: 'admin.failures.kind.fragments' },
];

export default function AdminLogs() {
  const { t } = useTranslation();
  const { data } = useOutletContext<AdminOutletContext>();
  const [activeKind, setActiveKind] = useState<FailureKind | 'all'>('all');

  const allFailures: FailureRow[] = useMemo(
    () =>
      [
        ...data.processing.extraction.recent_failures,
        ...data.processing.pipelines.recent_failures,
        ...data.processing.models.recent_parsing_failures,
        ...data.processing.models.recent_fragments_failures,
      ].sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')),
    [data],
  );

  const filtered = useMemo(
    () => (activeKind === 'all' ? allFailures : allFailures.filter((f) => f.kind === activeKind)),
    [allFailures, activeKind],
  );

  const counts = useMemo(
    () =>
      allFailures.reduce<Record<FailureKind, number>>(
        (acc, f) => {
          acc[f.kind] = (acc[f.kind] ?? 0) + 1;
          return acc;
        },
        { extraction: 0, pipeline: 0, model_parsing: 0, fragments: 0 },
      ),
    [allFailures],
  );

  const total = allFailures.length;
  const silentBacklog =
    data.processing.models.failure_counts.parsing_failed +
    data.processing.models.failure_counts.fragments_failed +
    data.processing.models.failure_counts.legacy_error;

  return (
    <div className="flex flex-col w-full py-6 px-6 md:px-8 lg:px-10 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      <header>
        <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-text-primary">
          {t('admin.nav.logs')}
        </h1>
        <p className="text-xs text-text-tertiary mt-1">{t('admin.logs.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-log-total"
          label={t('admin.logs.totalRecent')}
          icon={ScrollText}
          info={t('admin.tooltips.logTotal')}
          tone={total > 0 ? 'warning' : 'good'}
          numericValue={total}
        />
        <KpiTile
          id="kpi-log-extraction"
          label={t('admin.failures.kind.extraction')}
          icon={AlertTriangle}
          info={t('admin.tooltips.logExtraction')}
          numericValue={counts.extraction}
        />
        <KpiTile
          id="kpi-log-pipeline"
          label={t('admin.failures.kind.pipeline')}
          icon={AlertTriangle}
          info={t('admin.tooltips.logPipeline')}
          numericValue={counts.pipeline}
        />
        <KpiTile
          id="kpi-log-parse"
          label={t('admin.failures.kind.model_parsing')}
          icon={AlertTriangle}
          info={t('admin.tooltips.logParse')}
          numericValue={counts.model_parsing}
        />
        <KpiTile
          id="kpi-log-fragments"
          label={t('admin.failures.kind.fragments')}
          icon={AlertTriangle}
          info={t('admin.tooltips.logFragments')}
          numericValue={counts.fragments}
        />
      </div>

      <SectionCard
        title={t('admin.failures.title')}
        info={t('admin.tooltips.failures')}
        icon={AlertTriangle}
        actions={
          <div className="flex items-center gap-1 text-xs">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setActiveKind(opt.value)}
                className={cn(
                  'px-2 py-0.5 rounded-md transition-colors',
                  activeKind === opt.value
                    ? 'bg-surface-primary text-text-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-primary/60',
                )}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        }
      >
        {silentBacklog > 0 && (
          <div className="mb-3 text-[clamp(0.625rem,1.2vw,0.75rem)] flex flex-wrap items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-800 dark:text-amber-300">
              {t('admin.failures.silentBanner', {
                total: silentBacklog,
                parsing: data.processing.models.failure_counts.parsing_failed,
                fragments: data.processing.models.failure_counts.fragments_failed,
              })}
            </span>
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="text-[hsl(158_70%_28%)] text-[clamp(0.625rem,1.2vw,0.75rem)] py-4">
            {t('admin.failures.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((f) => (
              <FailureItem
                key={`${f.kind}-${f.id}`}
                f={f}
                kindLabel={t(`admin.failures.kind.${f.kind}`)}
                relative={formatRelative(f.started_at)}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
