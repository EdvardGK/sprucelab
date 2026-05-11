import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  KeyRound,
  Send,
  Trash2,
  Webhook as WebhookIcon,
  XCircle,
  ListChecks,
} from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  useWebhookSubscriptions,
  useDeleteWebhookSubscription,
  useUpdateWebhookSubscription,
  useTestWebhookSubscription,
  useRotateWebhookSecret,
  type WebhookSubscription,
} from '@/hooks/use-webhooks';
import { SecretRevealBanner } from '@/components/features/webhooks/SecretRevealBanner';
import { CreateWebhookDialog } from '@/components/features/webhooks/CreateWebhookDialog';

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
  });
}

export default function WebhookSubscriptions() {
  const { t } = useTranslation();
  const toast = useToast();

  const { data: subscriptions, isLoading, error } = useWebhookSubscriptions();
  const deleteMutation = useDeleteWebhookSubscription();
  const updateMutation = useUpdateWebhookSubscription();
  const testMutation = useTestWebhookSubscription();
  const rotateMutation = useRotateWebhookSecret();

  const [createOpen, setCreateOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!subscriptions) return [];
    return [...subscriptions].sort((a, b) => {
      if (a.event_type !== b.event_type) {
        return a.event_type.localeCompare(b.event_type);
      }
      return a.target_url.localeCompare(b.target_url);
    });
  }, [subscriptions]);

  const handleToggleActive = async (sub: WebhookSubscription) => {
    try {
      await updateMutation.mutateAsync({
        id: sub.id,
        is_active: !sub.is_active,
      });
      toast.success(
        sub.is_active
          ? t('webhooks.toast.disabled')
          : t('webhooks.toast.enabled'),
      );
    } catch (err) {
      toast.error(
        t('webhooks.toast.updateFailed'),
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const handleTest = async (sub: WebhookSubscription) => {
    try {
      await testMutation.mutateAsync(sub.id);
      toast.success(t('webhooks.toast.testQueued'));
    } catch (err) {
      toast.error(
        t('webhooks.toast.testFailed'),
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const handleRotate = async (sub: WebhookSubscription) => {
    if (!window.confirm(t('webhooks.confirm.rotate'))) return;
    try {
      const response = await rotateMutation.mutateAsync(sub.id);
      setRevealedSecret(response.secret);
      toast.success(t('webhooks.toast.secretRotated'));
    } catch (err) {
      toast.error(
        t('webhooks.toast.rotateFailed'),
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const handleDelete = async (sub: WebhookSubscription) => {
    if (!window.confirm(t('webhooks.confirm.delete', { url: sub.target_url }))) {
      return;
    }
    setPendingDeleteId(sub.id);
    try {
      await deleteMutation.mutateAsync(sub.id);
      toast.success(t('webhooks.toast.deleted'));
    } catch (err) {
      toast.error(
        t('webhooks.toast.deleteFailed'),
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12 gap-[clamp(0.75rem,2vw,1.25rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <WebhookIcon className="h-[clamp(1.25rem,2.5vw,1.75rem)] w-[clamp(1.25rem,2.5vw,1.75rem)] text-primary" />
            <div>
              <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold text-text-primary">
                {t('webhooks.subscriptions.title')}
              </h1>
              <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
                {t('webhooks.subscriptions.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/webhooks/deliveries">
                <ListChecks className="h-4 w-4 mr-1.5" />
                {t('webhooks.subscriptions.viewDeliveries')}
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              {t('webhooks.subscriptions.create')}
            </Button>
          </div>
        </div>

        {/* One-shot secret banner */}
        {revealedSecret && (
          <SecretRevealBanner
            secret={revealedSecret}
            onDismiss={() => setRevealedSecret(null)}
          />
        )}

        {/* Loading / error / empty / table */}
        {isLoading ? (
          <div className="text-text-secondary text-[clamp(0.75rem,1.5vw,0.875rem)]">
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 text-[clamp(0.75rem,1.5vw,0.875rem)]">
            <AlertTriangle className="h-5 w-5" />
            {t('webhooks.subscriptions.loadFailed')}
          </div>
        ) : sorted.length === 0 ? (
          <Card>
            <CardContent className="py-[clamp(1rem,3vw,2rem)] text-center">
              <WebhookIcon className="mx-auto h-[clamp(2rem,4vw,2.5rem)] w-[clamp(2rem,4vw,2.5rem)] text-text-tertiary" />
              <p className="mt-2 text-[clamp(0.75rem,1.5vw,0.875rem)] font-medium text-text-primary">
                {t('webhooks.subscriptions.empty.title')}
              </p>
              <p className="mt-1 text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
                {t('webhooks.subscriptions.empty.description')}
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
                      {t('webhooks.columns.url')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.project')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.state')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.failures')}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t('webhooks.columns.lastFired')}
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      {t('webhooks.columns.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((sub) => {
                    const isDeleting =
                      pendingDeleteId === sub.id && deleteMutation.isPending;
                    return (
                      <tr
                        key={sub.id}
                        className="border-b border-border last:border-b-0 hover:bg-surface/50"
                      >
                        <td className="px-3 py-2 font-mono">
                          {sub.event_type}
                        </td>
                        <td className="px-3 py-2">
                          <span className="break-all">{sub.target_url}</span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {sub.project_name ?? t('webhooks.allProjects')}
                        </td>
                        <td className="px-3 py-2">
                          {sub.is_active ? (
                            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t('webhooks.state.active')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-text-tertiary">
                              <XCircle className="h-3.5 w-3.5" />
                              {t('webhooks.state.disabled')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {sub.consecutive_failures > 0 ? (
                            <span className="text-red-600 font-medium">
                              {sub.consecutive_failures}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {formatDateTime(sub.last_fired_at)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTest(sub)}
                              disabled={!sub.is_active || testMutation.isPending}
                              title={t('webhooks.actions.test')}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRotate(sub)}
                              disabled={rotateMutation.isPending}
                              title={t('webhooks.actions.rotateSecret')}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleActive(sub)}
                              disabled={updateMutation.isPending}
                            >
                              {sub.is_active
                                ? t('webhooks.actions.disable')
                                : t('webhooks.actions.enable')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(sub)}
                              disabled={isDeleting}
                              title={t('webhooks.actions.delete')}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
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
      </div>

      <CreateWebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => setRevealedSecret(created.secret)}
      />
    </AppLayout>
  );
}
