import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { WebhookDeliveryStatus } from '@/hooks/use-webhooks';

interface DeliveryStatusBadgeProps {
  status: WebhookDeliveryStatus;
}

const STATUS_STYLES: Record<WebhookDeliveryStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  delivering: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200',
  retrying: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200',
};

export function DeliveryStatusBadge({ status }: DeliveryStatusBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[clamp(0.5rem,1vw,0.625rem)] font-medium uppercase tracking-wide',
        STATUS_STYLES[status] ?? STATUS_STYLES.pending,
      )}
    >
      {t(`webhooks.deliveryStatus.${status}`)}
    </span>
  );
}
