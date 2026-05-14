import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cpu, Database, GitCommit, Server } from 'lucide-react';
import { KpiTile, SectionCard, SystemStat } from '@/components/admin/primitives';
import { formatRelative } from '@/components/admin/helpers';
import type { AdminOutletContext } from '@/components/admin/types';

/**
 * AdminSystem — live introspection panel. Database ping, Redis broker,
 * Celery workers + queue depth, last successful pulses, build sha + host.
 * All values are computed at request time (no stored history).
 */
export default function AdminSystem() {
  const { t } = useTranslation();
  const { data } = useOutletContext<AdminOutletContext>();
  const { system } = data;
  const workersOk = (system.celery.active_workers ?? 0) > 0;
  const queueBusy = (system.celery.queue_depth ?? 0) > 50;

  return (
    <div className="flex flex-col w-full py-6 px-6 md:px-8 lg:px-10 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      <header>
        <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-text-primary">
          {t('admin.nav.system')}
        </h1>
        <p className="text-xs text-text-tertiary mt-1">{t('admin.systemPage.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-db"
          label={t('admin.system.database')}
          icon={Database}
          info={t('admin.tooltips.systemDb')}
          tone={system.database_ok ? 'good' : 'danger'}
          displayValue={system.database_ok ? t('admin.system.ok') : t('admin.system.down')}
        />
        <KpiTile
          id="kpi-broker"
          label={t('admin.system.broker')}
          icon={Server}
          info={t('admin.tooltips.systemBroker')}
          tone={system.celery.broker_ok ? 'good' : 'danger'}
          displayValue={system.celery.broker_ok ? t('admin.system.ok') : t('admin.system.down')}
        />
        <KpiTile
          id="kpi-sys-workers"
          label={t('admin.system.workers')}
          icon={Server}
          info={t('admin.tooltips.workers')}
          tone={workersOk ? 'good' : 'danger'}
          numericValue={system.celery.active_workers ?? 0}
          displayValue={system.celery.active_workers == null ? '—' : undefined}
        />
        <KpiTile
          id="kpi-sys-queue"
          label={t('admin.system.queue')}
          icon={Cpu}
          info={t('admin.tooltips.queueDepth')}
          tone={queueBusy ? 'warning' : 'neutral'}
          numericValue={system.celery.queue_depth ?? 0}
          displayValue={system.celery.queue_depth == null ? '—' : undefined}
        />
      </div>

      <SectionCard
        title={t('admin.system.title')}
        info={t('admin.tooltips.system')}
        icon={Server}
      >
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 text-[clamp(0.625rem,1.2vw,0.75rem)]">
          <SystemStat
            label={t('admin.system.uptime')}
            value={formatRelative(system.process_started_at).replace(' ago', '')}
          />
          <SystemStat
            label={t('admin.system.lastExtraction')}
            value={formatRelative(system.last_extraction_completed_at)}
          />
          <SystemStat
            label={t('admin.system.lastPipeline')}
            value={formatRelative(system.last_pipeline_completed_at)}
          />
          <SystemStat
            label={t('admin.system.gitSha')}
            value={system.git_sha.slice(0, 7)}
            icon={GitCommit}
          />
          <SystemStat label={t('admin.system.hostname')} value={system.hostname} />
        </dl>
      </SectionCard>
    </div>
  );
}
