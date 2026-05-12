import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LiveFreshnessProps {
  /** When was the data last fetched (epoch ms). 0 / undefined => not yet. */
  dataUpdatedAt: number | undefined;
  /** Override the tick interval (ms). Default 10s. */
  tickMs?: number;
  className?: string;
}

/**
 * Small "Updated Xs ago" badge with a pulsing green dot. Re-renders on
 * an interval so the relative time stays current without a hard refetch.
 * Honors prefers-reduced-motion (drops the pulse animation).
 */
export function LiveFreshness({
  dataUpdatedAt,
  tickMs = 10_000,
  className,
}: LiveFreshnessProps) {
  const { t } = useTranslation();
  const [, force] = useState(0);

  useEffect(() => {
    if (!dataUpdatedAt) return;
    const id = window.setInterval(() => force((n) => n + 1), tickMs);
    return () => window.clearInterval(id);
  }, [dataUpdatedAt, tickMs]);

  if (!dataUpdatedAt) {
    return null;
  }

  const ago = relativeAgo(Date.now() - dataUpdatedAt, t);

  return (
    <span
      className={['inline-flex items-center gap-[clamp(0.25rem,0.4vw,0.5rem)] text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums', className]
        .filter(Boolean)
        .join(' ')}
      title={new Date(dataUpdatedAt).toLocaleString()}
    >
      <span className="relative inline-flex h-[clamp(0.375rem,0.55vw,0.55rem)] w-[clamp(0.375rem,0.55vw,0.55rem)]">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(158_70%_28%)] opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-full w-full rounded-full bg-[hsl(158_70%_28%)]" />
      </span>
      <span>{t('typesV2.live.updatedAgo', { ago })}</span>
    </span>
  );
}

function relativeAgo(
  diffMs: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 5) return t('typesV2.live.justNow');
  if (diffSec < 60) return t('typesV2.live.seconds', { count: diffSec });
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('typesV2.live.minutes', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('typesV2.live.hours', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  return t('typesV2.live.days', { count: diffDay });
}
