import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Webhook, CheckCircle2 } from 'lucide-react';
import { KpiTile, SectionCard } from '@/components/admin/primitives';
import { formatPercent, formatRelative, toneForRate } from '@/components/admin/helpers';
import type { AdminOutletContext } from '@/components/admin/types';

/**
 * AdminWebhooks — outbound subscription health + recent delivery failures.
 * Aggregated counts surface as KPIs at the top; the failed-delivery list
 * is the meat. Subscription management itself still lives in
 * /settings/webhooks for now — this is the operator view.
 */
export default function AdminWebhooks() {
  const { t } = useTranslation();
  const { data } = useOutletContext<AdminOutletContext>();
  const { outbound } = data;
  const tone = toneForRate(outbound.success_rate_24h);

  return (
    <div className="flex flex-col w-full py-6 px-6 md:px-8 lg:px-10 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      <header>
        <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-text-primary">
          {t('admin.nav.webhooks')}
        </h1>
        <p className="text-xs text-text-tertiary mt-1">{t('admin.webhooksPage.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-wh-success"
          label={t('admin.outbound.success24h')}
          icon={CheckCircle2}
          info={t('admin.tooltips.outbound')}
          tone={tone}
          displayValue={formatPercent(outbound.success_rate_24h)}
          progressFraction={outbound.success_rate_24h ?? 0}
        />
        <KpiTile
          id="kpi-wh-active"
          label={t('admin.outbound.activeSubs')}
          icon={Webhook}
          info={t('admin.tooltips.outboundActive')}
          numericValue={outbound.subscriptions.active}
          subline={`${outbound.subscriptions.total} ${t('admin.outbound.totalSubs').toLowerCase()}`}
        />
        <KpiTile
          id="kpi-wh-success-n"
          label={t('admin.outbound.success24h')}
          icon={CheckCircle2}
          info={t('admin.tooltips.outbound24hSuccess')}
          tone="good"
          numericValue={outbound.last_24h.success ?? 0}
        />
        <KpiTile
          id="kpi-wh-failed-n"
          label={t('admin.processing.failed')}
          icon={Webhook}
          info={t('admin.tooltips.outbound24hFailed')}
          tone={(outbound.last_24h.failed ?? 0) > 0 ? 'danger' : 'neutral'}
          numericValue={outbound.last_24h.failed ?? 0}
        />
      </div>

      <SectionCard
        title={t('admin.outbound.recentFailures')}
        info={t('admin.tooltips.outboundFailures')}
        icon={Webhook}
      >
        {outbound.recent_failures.length === 0 ? (
          <p className="text-[hsl(158_70%_28%)] text-[clamp(0.625rem,1.2vw,0.75rem)] py-4">
            {t('admin.webhooksPage.noFailures')}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {outbound.recent_failures.map((d) => (
              <li key={d.id} className="py-2 text-[clamp(0.625rem,1.2vw,0.75rem)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono truncate font-medium">{d.event_type}</span>
                  <span className="text-text-secondary tabular-nums">
                    {formatRelative(d.last_attempt_at)}
                  </span>
                </div>
                <div className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] truncate">
                  → {d.target_url}
                  {d.response_status_code ? (
                    <span className="text-red-600 ml-1">[{d.response_status_code}]</span>
                  ) : null}
                </div>
                {d.error && (
                  <div className="text-red-700 text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 line-clamp-2">
                    {d.error}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
