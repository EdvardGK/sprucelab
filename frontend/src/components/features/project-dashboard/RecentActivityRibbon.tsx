import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { useModels } from '@/hooks/use-models';
import { cn } from '@/lib/utils';
import type { Model } from '@/lib/api-types';

interface RecentActivityRibbonProps {
  id: string;
  projectId: string;
}

const STATUS_BADGE: Record<
  Model['status'],
  { labelKey: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ready: {
    labelKey: 'projectDash.recent.statusReady',
    className: 'bg-[hsl(158_70%_28%/0.12)] text-[hsl(158_70%_28%)] ring-1 ring-[hsl(158_70%_28%/0.25)]',
    icon: CheckCircle2,
  },
  processing: {
    labelKey: 'projectDash.recent.statusProcessing',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/25',
    icon: Loader2,
  },
  uploading: {
    labelKey: 'projectDash.recent.statusUploading',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/25',
    icon: Loader2,
  },
  error: {
    labelKey: 'projectDash.recent.statusError',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/25',
    icon: AlertTriangle,
  },
};

function relativeTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return t('projectDash.recent.justNow');
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('projectDash.recent.minutesAgo', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('projectDash.recent.hoursAgo', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t('projectDash.recent.daysAgo', { count: diffDay });
  const diffMo = Math.round(diffDay / 30);
  return t('projectDash.recent.monthsAgo', { count: diffMo });
}

export function RecentActivityRibbon({ id, projectId }: RecentActivityRibbonProps) {
  const { t } = useTranslation();
  const { data: models, isLoading } = useModels(projectId);

  const sorted = useMemo(() => {
    const arr = [...(models ?? [])];
    arr.sort((a, b) => {
      const aT = new Date(a.created_at).getTime();
      const bT = new Date(b.created_at).getTime();
      return bT - aT;
    });
    return arr.slice(0, 10);
  }, [models]);

  return (
    <DashboardTile
      id={id}
      className="p-[clamp(0.5rem,1vw,1rem)] flex flex-col gap-[clamp(0.375rem,0.7vh,0.5rem)] h-full"
    >
      <div className="flex items-center justify-between text-muted-foreground shrink-0">
        <div className="flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)]">
          <Activity className="h-[clamp(0.75rem,1.2vw,1rem)] w-[clamp(0.75rem,1.2vw,1rem)]" />
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium">
            {t('projectDash.recent.title')}
          </span>
        </div>
        {sorted.length > 0 && (
          <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] tabular-nums">
            {sorted.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-[clamp(0.375rem,0.7vw,0.625rem)] overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[clamp(3.5rem,6vh,4.5rem)] w-[clamp(9rem,16vw,12rem)] shrink-0 rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[clamp(0.6rem,0.8vw,0.75rem)] text-muted-foreground">
          {t('projectDash.recent.empty')}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-[clamp(0.375rem,0.7vw,0.625rem)] overflow-x-auto overflow-y-hidden pb-[clamp(0.125rem,0.3vh,0.25rem)]">
          {sorted.map((model) => {
            const badge = STATUS_BADGE[model.status] ?? STATUS_BADGE.processing;
            const Icon = badge.icon;
            const spin = model.status === 'processing' || model.status === 'uploading';
            return (
              <Link
                key={model.id}
                to={`/projects/${projectId}/models/${model.id}`}
                className={cn(
                  'shrink-0 w-[clamp(9rem,16vw,12rem)] rounded-md border border-border bg-background px-[clamp(0.5rem,0.9vw,0.75rem)] py-[clamp(0.375rem,0.7vh,0.5rem)]',
                  'flex flex-col justify-between gap-[clamp(0.25rem,0.5vh,0.375rem)]',
                  'hover:ring-1 hover:ring-primary/30 hover:-translate-y-0.5 transition-all'
                )}
              >
                <div className="text-[clamp(0.6rem,0.85vw,0.8rem)] font-medium text-text-primary truncate">
                  {model.name}
                </div>
                <div className="flex items-center justify-between gap-[clamp(0.25rem,0.4vw,0.4rem)]">
                  <span className="inline-flex items-center gap-[clamp(0.125rem,0.25vw,0.2rem)] text-[clamp(0.5rem,0.7vw,0.65rem)] text-muted-foreground tabular-nums min-w-0 truncate">
                    <Clock className="h-[clamp(0.5rem,0.7vw,0.65rem)] w-[clamp(0.5rem,0.7vw,0.65rem)] shrink-0" />
                    <span className="truncate">{relativeTime(model.created_at, t)}</span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-[clamp(0.125rem,0.25vw,0.2rem)] text-[clamp(0.5rem,0.65vw,0.625rem)] uppercase tracking-wide font-semibold px-[clamp(0.25rem,0.45vw,0.375rem)] py-[clamp(0.05rem,0.1vh,0.1rem)] rounded shrink-0',
                      badge.className
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[clamp(0.5rem,0.7vw,0.65rem)] w-[clamp(0.5rem,0.7vw,0.65rem)]',
                        spin && 'animate-spin'
                      )}
                    />
                    {t(badge.labelKey)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardTile>
  );
}
