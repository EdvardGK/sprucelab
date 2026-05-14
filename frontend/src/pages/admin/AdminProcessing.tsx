import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Clock, Cpu, Server } from 'lucide-react';
import { KpiTile, SectionCard } from '@/components/admin/primitives';
import {
  formatMs,
  formatPercent,
  formatSeconds,
  toneForRate,
  TONE_STYLES,
} from '@/components/admin/helpers';
import type { AdminOutletContext } from '@/components/admin/types';
import { cn } from '@/lib/utils';

/**
 * AdminProcessing — per-format extraction stats, pipeline 24h breakdown,
 * and a full daily-bars view of recent throughput. No log rows: failures
 * roll up to counts here and link out to /admin/logs.
 */
export default function AdminProcessing() {
  const { t } = useTranslation();
  const { data } = useOutletContext<AdminOutletContext>();
  const { processing, system } = data;

  const ext24 = processing.extraction.last_24h;
  const ext24Total = (ext24.completed ?? 0) + (ext24.failed ?? 0);
  const ext24SuccessRate = ext24Total ? (ext24.completed ?? 0) / ext24Total : null;
  const ext24Tone = toneForRate(ext24SuccessRate);

  const pipe24 = processing.pipelines.last_24h;
  const pipe24Total = (pipe24.success ?? 0) + (pipe24.failed ?? 0);
  const pipe24SuccessRate = pipe24Total ? (pipe24.success ?? 0) / pipe24Total : null;

  return (
    <div className="flex flex-col w-full py-6 px-6 md:px-8 lg:px-10 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      <header>
        <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-text-primary">
          {t('admin.nav.processing')}
        </h1>
        <p className="text-xs text-text-tertiary mt-1">{t('admin.processingPage.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-ext-success"
          label={t('admin.processing.successRate24h')}
          icon={Activity}
          info={t('admin.tooltips.successRate24h')}
          tone={ext24Tone}
          displayValue={formatPercent(ext24SuccessRate)}
          progressFraction={ext24SuccessRate ?? 0}
          subline={`${ext24.completed ?? 0} ${t('admin.processing.completed')} · ${ext24.failed ?? 0} ${t('admin.processing.failed')}`}
        />
        <KpiTile
          id="kpi-pipe-success"
          label={t('admin.processingPage.pipelineSuccess')}
          icon={Activity}
          info={t('admin.tooltips.pipelineSuccess')}
          tone={toneForRate(pipe24SuccessRate)}
          displayValue={formatPercent(pipe24SuccessRate)}
          progressFraction={pipe24SuccessRate ?? 0}
          subline={`${pipe24.success ?? 0} / ${pipe24Total}`}
        />
        <KpiTile
          id="kpi-avg-pipe"
          label={t('admin.processing.avgPipeline')}
          icon={Clock}
          info={t('admin.tooltips.avgPipeline')}
          displayValue={formatMs(processing.pipelines.avg_duration_ms)}
        />
        <KpiTile
          id="kpi-queue"
          label={t('admin.processing.queueDepth')}
          icon={Cpu}
          info={t('admin.tooltips.queueDepth')}
          tone={(system.celery.queue_depth ?? 0) > 50 ? 'warning' : 'neutral'}
          numericValue={system.celery.queue_depth ?? 0}
          displayValue={system.celery.queue_depth == null ? '—' : undefined}
          subline={t('admin.overview.queueSubline', { n: system.celery.active_workers ?? 0 })}
        />
      </div>

      <SectionCard
        title={t('admin.processing.title')}
        info={t('admin.tooltips.processingByFormat')}
        icon={Activity}
      >
        <div className="overflow-x-auto">
          {processing.extraction.by_format.length === 0 ? (
            <p className="text-text-secondary text-[clamp(0.625rem,1.2vw,0.75rem)] py-4">
              {t('admin.processing.noRuns')}
            </p>
          ) : (
            <table className="w-full text-[clamp(0.625rem,1.2vw,0.75rem)]">
              <thead>
                <tr className="border-b text-left text-text-secondary">
                  <th className="py-2 px-2 font-medium">{t('admin.processing.tableFormat')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableCount')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableSuccess')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableAvg')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableP95')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableFailed')}</th>
                </tr>
              </thead>
              <tbody>
                {processing.extraction.by_format.map((row) => {
                  const tone = toneForRate(row.success_rate);
                  return (
                    <tr
                      key={row.format}
                      className="border-b border-border-subtle hover:bg-surface-secondary/40 transition-colors"
                    >
                      <td className="py-1.5 px-2 font-mono uppercase">{row.format}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{row.count}</td>
                      <td className={cn('py-1.5 px-2 text-right tabular-nums', TONE_STYLES[tone].value)}>
                        {formatPercent(row.success_rate)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {formatSeconds(row.avg_seconds)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {formatSeconds(row.p95_seconds)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-red-600">
                        {row.failed || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title={t('admin.processingPage.pipelineLast24h')}
        info={t('admin.tooltips.pipelineLast24h')}
        icon={Server}
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[clamp(0.625rem,1.2vw,0.75rem)] tabular-nums">
          <StatPill dot="bg-green-500" label={t('admin.processing.completed')} value={pipe24.success ?? 0} />
          <StatPill dot="bg-red-500" label={t('admin.processing.failed')} value={pipe24.failed ?? 0} />
          <StatPill dot="bg-amber-500" label="Partial" value={pipe24.partial ?? 0} />
          <StatPill dot="bg-blue-500" label={t('admin.processing.running')} value={pipe24.running ?? 0} />
          <StatPill dot="bg-text-tertiary" label="Queued" value={pipe24.queued ?? 0} />
        </div>
      </SectionCard>
    </div>
  );
}

function StatPill({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border-subtle px-3 py-2">
      <span className="inline-flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-text-secondary">{label}</span>
      </span>
      <span className="font-semibold text-text-primary">{value}</span>
    </div>
  );
}
