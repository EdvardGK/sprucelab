import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Layers, Package } from 'lucide-react';

import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { cn } from '@/lib/utils';
import type { Model, Project } from '@/lib/api-types';
import { buildProjectDistribution } from '@/hooks/useProjectsKpis';

// Discipline palette aligned with the project-dashboard tile family so
// the sparkbar reads consistently across surfaces.
const DISCIPLINE_PALETTE: Record<string, string> = {
  ARK: '#4a5280',
  RIB: '#5a5c15',
  RIV: '#157954',
  RIE: '#21263A',
  RIVA: '#2dd4a0',
  LARK: '#D0D34D',
  UNSPEC: 'hsl(var(--muted))',
};

const FALLBACK_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
];

function colorFor(key: string, idx: number): string {
  return DISCIPLINE_PALETTE[key] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

function relativeTime(
  iso: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (!iso) return '—';
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return t('projectsGallery.relative.justNow');
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('projectsGallery.relative.minutesAgo', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('projectsGallery.relative.hoursAgo', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t('projectsGallery.relative.daysAgo', { count: diffDay });
  const diffMo = Math.round(diffDay / 30);
  return t('projectsGallery.relative.monthsAgo', { count: diffMo });
}

interface ProjectGalleryCardProps {
  project: Project;
  /** Latest-version models for this project. */
  models: Model[];
}

/**
 * Single project tile rendered in the gallery grid. Content-only for now:
 * name + last-activity + description + KPI strip + IFC discipline
 * sparkbar. The thumbnail/cover-image pattern is parked — narrow side
 * columns marginalize the actual data. Project.thumbnail_url remains in
 * the type contract for when we re-introduce a content-first thumbnail
 * treatment (full-width banner? large square card? TBD).
 */
export function ProjectGalleryCard({ project, models }: ProjectGalleryCardProps) {
  const { t } = useTranslation();

  const distribution = useMemo(() => buildProjectDistribution(models, 8), [models]);
  const segments: SparkSegment[] = useMemo(
    () =>
      distribution.map((d, i) => ({
        key: d.key,
        value: d.value,
        color: colorFor(d.key, i),
        label: d.label,
      })),
    [distribution]
  );

  const totalInstances = models.reduce((s, m) => s + (m.element_count || 0), 0);
  const modelCount = project.model_count ?? models.length;

  // Last activity prefers project.updated_at; fall back to the freshest
  // model upload when the project record hasn't been touched recently
  // (e.g. read-only updates skip updating updated_at server-side).
  const latestModel = models.reduce<string | null>((latest, m) => {
    const ts = new Date(m.created_at).getTime();
    if (Number.isNaN(ts)) return latest;
    if (latest === null) return m.created_at;
    return ts > new Date(latest).getTime() ? m.created_at : latest;
  }, null);
  const lastActivityIso = latestModel ?? project.updated_at;
  const lastActivity = relativeTime(lastActivityIso, t);

  return (
    <Link
      to={`/projects/${project.id}`}
      className={cn(
        'group block h-[180px] rounded-lg border border-border bg-card',
        'p-[clamp(0.625rem,1vw,0.875rem)] flex flex-col gap-[clamp(0.25rem,0.5vh,0.5rem)]',
        'transition-colors duration-150 hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      )}
    >
      <div className="flex flex-col h-full gap-[clamp(0.25rem,0.5vh,0.5rem)] min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-[clamp(0.85rem,1.1vw,1rem)] font-semibold text-text-primary truncate">
              {project.name}
            </h3>
            <p className="text-[clamp(0.55rem,0.75vw,0.7rem)] text-muted-foreground tabular-nums mt-[2px]">
              {t('projectsGallery.card.updatedPrefix')} {lastActivity}
            </p>
          </div>
        </div>

        {project.description && (
          <p className="text-[clamp(0.6rem,0.8vw,0.75rem)] text-text-secondary line-clamp-2 leading-snug">
            {project.description}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-[clamp(0.25rem,0.5vh,0.4rem)]">
          <dl className="flex items-center gap-[clamp(0.5rem,1vw,0.875rem)] text-[clamp(0.6rem,0.8vw,0.75rem)]">
            <div className="flex items-center gap-[3px]">
              <Layers className="h-[clamp(0.65rem,0.9vw,0.85rem)] w-[clamp(0.65rem,0.9vw,0.85rem)] text-muted-foreground" />
              <dt className="sr-only">{t('projectsGallery.card.models')}</dt>
              <dd className="font-semibold tabular-nums">{modelCount}</dd>
            </div>
            <div className="flex items-center gap-[3px]">
              <Package className="h-[clamp(0.65rem,0.9vw,0.85rem)] w-[clamp(0.65rem,0.9vw,0.85rem)] text-muted-foreground" />
              <dt className="sr-only">{t('projectsGallery.card.instances')}</dt>
              <dd className="font-semibold tabular-nums">
                {totalInstances > 0 ? totalInstances.toLocaleString() : (
                  <span className="text-amber-500/80">—</span>
                )}
              </dd>
            </div>
          </dl>
          <Sparkline segments={segments} variant="stacked" />
        </div>
      </div>
    </Link>
  );
}
