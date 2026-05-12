import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { HealthScoreRing } from '@/components/features/warehouse/HealthScoreRing';
import { cn } from '@/lib/utils';

interface ProjectSummary {
  classification_percent: number;
  unit_percent: number;
  material_percent: number;
  verification_percent: number;
  health_score: number;
}

interface HealthSignalsTileProps {
  id: string;
  summary: ProjectSummary | undefined;
  loading?: boolean;
}

function toneColor(pct: number): string {
  if (pct >= 80) return 'bg-[hsl(158_70%_28%)]';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function toneText(pct: number): string {
  if (pct >= 80) return 'text-[hsl(158_70%_28%)]';
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function HealthSignalsTile({ id, summary, loading }: HealthSignalsTileProps) {
  const { t } = useTranslation();

  const rows: Array<{ label: string; value: number | undefined }> = [
    { label: t('projectDash.health.classification'), value: summary?.classification_percent },
    { label: t('projectDash.health.units'), value: summary?.unit_percent },
    { label: t('projectDash.health.materials'), value: summary?.material_percent },
    { label: t('projectDash.health.verification'), value: summary?.verification_percent },
  ];

  return (
    <DashboardTile
      id={id}
      className="p-[clamp(0.5rem,1vw,1rem)] flex flex-col h-full"
    >
      <div className="flex items-center justify-between text-muted-foreground mb-[clamp(0.375rem,0.7vh,0.5rem)] shrink-0">
        <div className="flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)]">
          <ShieldCheck className="h-[clamp(0.75rem,1.2vw,1rem)] w-[clamp(0.75rem,1.2vw,1rem)]" />
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium">
            {t('projectDash.health.title')}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center gap-[clamp(0.5rem,1.2vw,1rem)]">
        {loading || !summary ? (
          <div className="text-[clamp(0.6rem,0.8vw,0.75rem)] text-text-secondary">
            {t('common.loading')}
          </div>
        ) : (
          <>
            <div className="shrink-0 flex items-center justify-center">
              <HealthScoreRing
                score={summary.health_score}
                size="md"
                showLabel={false}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[clamp(0.25rem,0.5vh,0.45rem)]">
              {rows.map((row) => {
                const hasValue = row.value !== undefined && row.value !== null;
                const pct = Math.round(row.value ?? 0);
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-[clamp(0.55rem,0.75vw,0.7rem)] mb-[clamp(0.05rem,0.15vh,0.15rem)]">
                      <span className="text-text-secondary truncate">{row.label}</span>
                      {hasValue ? (
                        <span className={cn('font-semibold tabular-nums', toneText(pct))}>
                          {pct}%
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 tabular-nums">—</span>
                      )}
                    </div>
                    <div className="h-[clamp(0.25rem,0.4vh,0.35rem)] bg-muted rounded-full overflow-hidden">
                      {hasValue && (
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-500 ease-out',
                            toneColor(pct)
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardTile>
  );
}
