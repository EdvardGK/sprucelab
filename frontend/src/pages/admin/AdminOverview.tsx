import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FolderOpen,
  Server,
  Users,
  Webhook,
} from 'lucide-react';
import { KpiTile } from '@/components/admin/primitives';
import {
  formatBytes,
  formatMs,
  formatPercent,
  formatRelative,
  toneForRate,
} from '@/components/admin/helpers';
import type { AdminOutletContext } from '@/components/admin/types';

/**
 * AdminOverview — the main dash. Only KPIs and most important tracking.
 * Logs and detail tables live on dedicated routes; every drill-in card
 * here links to its full page via `href`.
 *
 * Log-aggregated data is itself a KPI (e.g. "12 failures in 24h" linking
 * to /admin/logs). No log rows on this page.
 */
export default function AdminOverview() {
  const { t } = useTranslation();
  const { data } = useOutletContext<AdminOutletContext>();
  const { users, projects, models, types, processing, system, outbound } = data;

  // 24h health derived values used in the hero strip.
  const ext24 = processing.extraction.last_24h;
  const ext24Total = (ext24.completed ?? 0) + (ext24.failed ?? 0);
  const ext24SuccessRate = ext24Total ? (ext24.completed ?? 0) / ext24Total : null;
  const ext24Tone = toneForRate(ext24SuccessRate);

  const workersOk = (system.celery.active_workers ?? 0) > 0;
  const queueBusy = (system.celery.queue_depth ?? 0) > 50;

  // Log-aggregate KPIs — counts that the Logs page exposes in detail.
  const totalSilentFailures =
    processing.models.failure_counts.parsing_failed +
    processing.models.failure_counts.fragments_failed +
    processing.models.failure_counts.legacy_error;

  const failures24h =
    (ext24.failed ?? 0) +
    (processing.pipelines.last_24h.failed ?? 0);

  const slowestFormat = [...processing.extraction.by_format]
    .sort((a, b) => (b.p95_seconds || 0) - (a.p95_seconds || 0))[0];

  return (
    <div className="flex flex-col w-full py-6 px-6 md:px-8 lg:px-10 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      <header className="flex items-baseline gap-3">
        <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-text-primary">
          {t('admin.overview.title')}
        </h1>
        <span className="text-xs text-text-tertiary">{t('admin.overview.subtitle')}</span>
      </header>

      {/* Hero — operator's "is it on fire" strip. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-success-rate"
          label={t('admin.processing.successRate24h')}
          icon={Activity}
          info={t('admin.tooltips.successRate24h')}
          tone={ext24Tone}
          displayValue={formatPercent(ext24SuccessRate)}
          progressFraction={ext24SuccessRate ?? 0}
          subline={`${ext24.completed ?? 0} ${t('admin.processing.completed')} · ${ext24.failed ?? 0} ${t('admin.processing.failed')}`}
          href="/admin/processing"
        />
        <KpiTile
          id="kpi-failures-24h"
          label={t('admin.overview.failures24h')}
          icon={AlertTriangle}
          info={t('admin.tooltips.failures24h')}
          tone={failures24h > 0 ? 'danger' : 'good'}
          numericValue={failures24h}
          subline={
            totalSilentFailures > 0
              ? t('admin.overview.silentBacklog', { n: totalSilentFailures })
              : t('admin.overview.noBacklog')
          }
          href="/admin/logs"
        />
        <KpiTile
          id="kpi-queue-depth"
          label={t('admin.processing.queueDepth')}
          icon={Cpu}
          info={t('admin.tooltips.queueDepth')}
          tone={queueBusy ? 'warning' : 'neutral'}
          numericValue={system.celery.queue_depth ?? 0}
          displayValue={system.celery.queue_depth == null ? '—' : undefined}
          subline={t('admin.overview.queueSubline', { n: system.celery.active_workers ?? 0 })}
          href="/admin/system"
        />
        <KpiTile
          id="kpi-workers"
          label={t('admin.processing.activeWorkers')}
          icon={Server}
          info={t('admin.tooltips.workers')}
          tone={workersOk ? 'good' : 'danger'}
          numericValue={system.celery.active_workers ?? 0}
          displayValue={system.celery.active_workers == null ? '—' : undefined}
          subline={
            system.last_extraction_completed_at
              ? `${t('admin.overview.lastExtraction')}: ${formatRelative(system.last_extraction_completed_at)}`
              : t('admin.overview.idle')
          }
          href="/admin/system"
        />
      </div>

      {/* Platform counts. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-users"
          label={t('admin.totalUsers')}
          icon={Users}
          info={t('admin.tooltips.totalUsers')}
          numericValue={users.total}
          subline={`${users.approved} ${t('admin.approved').toLowerCase()}`}
          href="/admin/users"
        />
        <KpiTile
          id="kpi-approved"
          label={t('admin.approved')}
          icon={CheckCircle2}
          info={t('admin.tooltips.approved')}
          tone="good"
          numericValue={users.approved}
          progressFraction={users.total ? users.approved / users.total : 0}
          href="/admin/users"
        />
        <KpiTile
          id="kpi-pending"
          label={t('admin.pending')}
          icon={Clock}
          info={t('admin.tooltips.pending')}
          tone={users.pending > 0 ? 'warning' : 'neutral'}
          numericValue={users.pending}
          subline={
            users.pending > 0
              ? t('admin.overview.pendingNudge')
              : t('admin.overview.pendingClear')
          }
          href="/admin/users"
        />
        <KpiTile
          id="kpi-projects"
          label={t('admin.projects')}
          icon={FolderOpen}
          info={t('admin.tooltips.projects')}
          numericValue={projects.total}
          subline={`+${projects.recent} ${t('admin.in30d')}`}
        />
        <KpiTile
          id="kpi-models"
          label={t('admin.models')}
          icon={Box}
          info={t('admin.tooltips.models')}
          numericValue={models.total}
          subline={`${models.by_status.ready ?? 0} ${t('admin.ready').toLowerCase()} · ${models.by_status.error ?? 0} ${t('admin.error').toLowerCase()}`}
        />
        <KpiTile
          id="kpi-storage"
          label={t('admin.storage')}
          icon={Database}
          info={t('admin.tooltips.storage')}
          displayValue={formatBytes(models.total_size_bytes)}
        />
      </div>

      {/* Secondary KPIs — type mapping, pipeline avg, outbound, slowest fmt. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-mapping"
          label={t('admin.overview.typeMapping')}
          icon={CheckCircle2}
          info={t('admin.tooltips.typeMapping')}
          tone={toneForRate(types.total_types ? types.mapping_rate / 100 : null)}
          displayValue={`${types.mapping_rate}%`}
          progressFraction={types.total_types ? types.mapping_rate / 100 : 0}
          subline={`${types.total_mapped} / ${types.total_types}`}
        />
        <KpiTile
          id="kpi-avg-pipeline"
          label={t('admin.processing.avgPipeline')}
          icon={Clock}
          info={t('admin.tooltips.avgPipeline')}
          displayValue={formatMs(processing.pipelines.avg_duration_ms)}
          subline={`${processing.pipelines.last_24h.success ?? 0} ${t('admin.processing.completed')}`}
          href="/admin/processing"
        />
        <KpiTile
          id="kpi-outbound"
          label={t('admin.overview.outbound')}
          icon={Webhook}
          info={t('admin.tooltips.outbound')}
          tone={toneForRate(outbound.success_rate_24h)}
          displayValue={formatPercent(outbound.success_rate_24h)}
          subline={`${outbound.subscriptions.active} / ${outbound.subscriptions.total} ${t('admin.outbound.activeSubs').toLowerCase()}`}
          href="/admin/webhooks"
        />
        <KpiTile
          id="kpi-slowest"
          label={t('admin.overview.slowestFormat')}
          icon={Activity}
          info={t('admin.tooltips.slowestFormat')}
          displayValue={slowestFormat ? slowestFormat.format.toUpperCase() : '—'}
          subline={
            slowestFormat
              ? t('admin.overview.p95Sub', { p95: slowestFormat.p95_seconds.toFixed(1) })
              : t('admin.overview.noRuns')
          }
          href="/admin/processing"
        />
      </div>

      {/* Operator footer pulse — uptime, build, last activity. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-[clamp(0.625rem,1.2vw,0.75rem)] px-1">
        <FooterStat label={t('admin.system.gitSha')} value={system.git_sha.slice(0, 7)} />
        <FooterStat
          label={t('admin.system.uptime')}
          value={formatRelative(system.process_started_at).replace(' ago', '')}
        />
        <FooterStat
          label={t('admin.system.database')}
          value={system.database_ok ? t('admin.system.ok') : t('admin.system.down')}
          tone={system.database_ok ? 'good' : 'danger'}
        />
        <FooterStat
          label={t('admin.system.broker')}
          value={system.celery.broker_ok ? t('admin.system.ok') : t('admin.system.down')}
          tone={system.celery.broker_ok ? 'good' : 'danger'}
        />
      </div>
    </div>
  );
}

function FooterStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'danger';
}) {
  const toneClass =
    tone === 'good' ? 'text-[hsl(158_70%_28%)]' : tone === 'danger' ? 'text-red-600' : 'text-text-primary';
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-text-tertiary uppercase tracking-wider text-[clamp(0.5rem,1vw,0.625rem)]">
        {label}
      </span>
      <span className={`font-medium tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}
