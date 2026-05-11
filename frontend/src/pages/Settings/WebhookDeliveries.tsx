import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  RotateCw,
  Send,
} from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useWebhookDeliveries,
  useWebhookSubscriptions,
  useRedeliverWebhook,
  type WebhookDeliveryStatus,
} from '@/hooks/use-webhooks';
import { DeliveryStatusBadge } from '@/components/features/webhooks/DeliveryStatusBadge';

const STATUS_OPTIONS: WebhookDeliveryStatus[] = [
  'pending',
  'delivering',
  'success',
  'failed',
  'retrying',
];

const ANY_VALUE = '__any__';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('nb-NO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export default function WebhookDeliveries() {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const subscriptionFilter = searchParams.get('subscription') ?? ANY_VALUE;
  const statusFilter = (searchParams.get('status') ?? ANY_VALUE) as
    | WebhookDeliveryStatus
    | typeof ANY_VALUE;

  const filters = useMemo(
    () => ({
      subscription:
        subscriptionFilter === ANY_VALUE ? undefined : subscriptionFilter,
      status:
        statusFilter === ANY_VALUE
          ? undefined
          : (statusFilter as WebhookDeliveryStatus),
    }),
    [subscriptionFilter, statusFilter],
  );

  const {
    data: deliveries,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useWebhookDeliveries(filters);
  const { data: subscriptions } = useWebhookSubscriptions();
  const redeliverMutation = useRedeliverWebhook();

  const subscriptionLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const sub of subscriptions ?? []) {
      lookup.set(sub.id, sub.target_url);
    }
    return lookup;
  }, [subscriptions]);

  const setFilter = (key: 'subscription' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === ANY_VALUE) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleRedeliver = async (deliveryId: string) => {
    try {
      await redeliverMutation.mutateAsync(deliveryId);
      toast.success(t('webhooks.toast.redelivered'));
    } catch (err) {
      toast.error(
        t('webhooks.toast.redeliverFailed'),
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const rows = deliveries?.results ?? [];

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12 gap-[clamp(0.75rem,2vw,1.25rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Send className="h-[clamp(1.25rem,2.5vw,1.75rem)] w-[clamp(1.25rem,2.5vw,1.75rem)] text-primary" />
            <div>
              <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold text-text-primary">
                {t('webhooks.deliveries.title')}
              </h1>
              <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
                {t('webhooks.deliveries.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/webhooks">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                {t('webhooks.deliveries.backToSubscriptions')}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title={t('webhooks.deliveries.refresh')}
            >
              <RefreshCw
                className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
              {t('webhooks.deliveries.filterSubscription')}
            </span>
            <Select
              value={subscriptionFilter}
              onValueChange={(v) => setFilter('subscription', v)}
            >
              <SelectTrigger className="w-[280px] h-8 text-[clamp(0.625rem,1.2vw,0.75rem)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>
                  {t('webhooks.deliveries.allSubscriptions')}
                </SelectItem>
                {(subscriptions ?? []).map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.event_type} → {sub.target_url}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
              {t('webhooks.deliveries.filterStatus')}
            </span>
            <Select
              value={statusFilter}
              onValueChange={(v) => setFilter('status', v)}
            >
              <SelectTrigger className="w-[160px] h-8 text-[clamp(0.625rem,1.2vw,0.75rem)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>
                  {t('webhooks.deliveries.allStatuses')}
                </SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`webhooks.deliveryStatus.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="text-text-secondary text-[clamp(0.75rem,1.5vw,0.875rem)]">
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 text-[clamp(0.75rem,1.5vw,0.875rem)]">
            <AlertTriangle className="h-5 w-5" />
            {t('webhooks.deliveries.loadFailed')}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-[clamp(1rem,3vw,2rem)] text-center">
              <Send className="mx-auto h-[clamp(2rem,4vw,2.5rem)] w-[clamp(2rem,4vw,2.5rem)] text-text-tertiary" />
              <p className="mt-2 text-[clamp(0.75rem,1.5vw,0.875rem)] font-medium text-text-primary">
                {t('webhooks.deliveries.empty.title')}
              </p>
              <p className="mt-1 text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
                {t('webhooks.deliveries.empty.description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-[clamp(0.625rem,1.2vw,0.75rem)]">
                <thead className="border-b border-border bg-surface text-text-secondary">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.event')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.target')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.status')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.httpStatus')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.attempts')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.created')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.response')}
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      {t('webhooks.columns.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((delivery) => {
                    const target =
                      delivery.target_url ||
                      (delivery.subscription
                        ? subscriptionLookup.get(delivery.subscription) ?? ''
                        : '');
                    const excerpt =
                      delivery.error?.trim() ||
                      truncate(delivery.response_body ?? '', 120);
                    const canRedeliver = delivery.subscription !== null;
                    return (
                      <tr
                        key={delivery.id}
                        className="border-b border-border last:border-b-0 hover:bg-surface/50 align-top"
                      >
                        <td className="px-3 py-2 font-mono">
                          {delivery.event_type}
                        </td>
                        <td className="px-3 py-2">
                          <span className="break-all">{target || '—'}</span>
                        </td>
                        <td className="px-3 py-2">
                          <DeliveryStatusBadge status={delivery.status} />
                        </td>
                        <td className="px-3 py-2">
                          {delivery.response_status_code ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {delivery.attempt_count}
                        </td>
                        <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                          {formatDateTime(delivery.created_at)}
                        </td>
                        <td className="px-3 py-2 max-w-[320px]">
                          <span
                            className="block truncate text-text-secondary"
                            title={excerpt}
                          >
                            {excerpt || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRedeliver(delivery.id)}
                              disabled={
                                !canRedeliver || redeliverMutation.isPending
                              }
                              title={t('webhooks.actions.redeliver')}
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {deliveries && (deliveries.next || deliveries.previous) && (
          <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-tertiary">
            {t('webhooks.deliveries.paginationHint', {
              count: deliveries.results.length,
              total: deliveries.count,
            })}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
