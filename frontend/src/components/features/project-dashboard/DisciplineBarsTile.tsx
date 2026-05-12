import { useTranslation } from 'react-i18next';
import { Table2, Layers3 } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { DrillTarget } from '@/components/filters/DrillTarget';
import { cn } from '@/lib/utils';
import type { DisciplineMetrics } from '@/hooks/use-warehouse';

const DISCIPLINE_COLORS: Record<string, { bg: string; text: string }> = {
  ARK: { bg: 'bg-[#f3f5fa]', text: 'text-[#4a5280]' },
  RIB: { bg: 'bg-[#f7f8e4]', text: 'text-[#5a5c15]' },
  RIV: { bg: 'bg-[#e8f2ee]', text: 'text-[#157954]' },
  RIE: { bg: 'bg-[#e9e9eb]', text: 'text-[#21263A]' },
};

const DEFAULT_DISC = { bg: 'bg-muted', text: 'text-muted-foreground' };

function discColor(disc: string | null) {
  if (!disc) return DEFAULT_DISC;
  return DISCIPLINE_COLORS[disc.toUpperCase()] ?? DEFAULT_DISC;
}

function healthColor(score: number): string {
  if (score >= 80) return 'bg-[hsl(158_70%_28%)]';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

interface DisciplineBarsTileProps {
  id: string;
  byDiscipline: Record<string, DisciplineMetrics> | undefined;
  loading?: boolean;
  onBarClick: (code: string) => void;
  onViewData?: () => void;
}

export function DisciplineBarsTile({
  id,
  byDiscipline,
  loading,
  onBarClick,
  onViewData,
}: DisciplineBarsTileProps) {
  const { t } = useTranslation();
  const entries = byDiscipline
    ? Object.entries(byDiscipline).sort((a, b) => b[1].total - a[1].total)
    : [];

  return (
    <DashboardTile
      id={id}
      className="p-[clamp(0.5rem,1vw,1rem)] flex flex-col h-full"
    >
      <div className="flex items-center justify-between text-muted-foreground mb-[clamp(0.375rem,0.7vh,0.5rem)] shrink-0">
        <div className="flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)]">
          <Layers3 className="h-[clamp(0.75rem,1.2vw,1rem)] w-[clamp(0.75rem,1.2vw,1rem)]" />
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium">
            {t('projectDash.disciplines.title')}
          </span>
        </div>
        {onViewData && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewData();
            }}
            aria-label={t('projectDash.disciplines.viewData')}
            className="p-1 -m-1 text-text-tertiary hover:text-text-primary rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Table2 className="h-[clamp(0.7rem,1vw,0.85rem)] w-[clamp(0.7rem,1vw,0.85rem)]" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center gap-[clamp(0.25rem,0.5vh,0.5rem)]">
        {loading ? (
          <div className="text-[clamp(0.6rem,0.8vw,0.75rem)] text-text-secondary">
            {t('common.loading')}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-[clamp(0.6rem,0.8vw,0.75rem)] text-text-tertiary">
            {t('projectDash.disciplines.empty')}
          </div>
        ) : (
          entries.map(([code, m]) => {
            const pct = m.total > 0 ? Math.round((m.mapped / m.total) * 100) : 0;
            const dc = discColor(code);
            return (
              <DrillTarget
                key={code}
                ariaLabel={t('projectDash.disciplines.filterAria', { code })}
                onActivate={() => onBarClick(code)}
                className={cn(
                  'flex items-center gap-[clamp(0.3rem,0.6vw,0.5rem)]',
                  'rounded px-[clamp(0.25rem,0.4vw,0.4rem)] py-[clamp(0.125rem,0.25vh,0.2rem)]',
                  '-mx-[clamp(0.25rem,0.4vw,0.4rem)] cursor-pointer',
                  'hover:bg-muted/60 hover:ring-1 hover:ring-primary/20 transition-colors'
                )}
              >
                <span
                  className={cn(
                    'text-[clamp(0.55rem,0.75vw,0.65rem)] font-semibold px-[clamp(0.25rem,0.4vw,0.4rem)] py-[clamp(0.05rem,0.1vh,0.1rem)] rounded w-[clamp(2rem,3.5vw,2.75rem)] text-center shrink-0 tabular-nums',
                    dc.bg,
                    dc.text
                  )}
                >
                  {code}
                </span>
                <div className="flex-1 h-[clamp(0.4rem,0.7vh,0.55rem)] bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500 ease-out', healthColor(pct))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[clamp(0.55rem,0.75vw,0.65rem)] font-semibold tabular-nums text-text-primary w-[clamp(3rem,4vw,4rem)] text-right shrink-0">
                  {m.mapped}/{m.total}
                </span>
              </DrillTarget>
            );
          })
        )}
      </div>
    </DashboardTile>
  );
}
