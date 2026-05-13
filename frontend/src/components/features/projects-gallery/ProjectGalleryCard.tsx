import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box as BoxIcon, Layers, Package } from 'lucide-react';

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
 * Single project tile rendered in the gallery grid. Two-column layout:
 *   - left: static thumbnail (typically a rendering; backend may also
 *     serve a federated-model snapshot or a Kartverket map tile)
 *   - right: name, relative-time, description, tiny KPI strip
 *     (models / instances), IFC discipline sparkbar
 *
 * Static <img> only — never a live WebGL viewer per card. The Speckle
 * pattern: thumbnail at rest, "Open project" affordance on hover, click
 * the whole card to navigate. Replaces the prior "no 3D thumbnails"
 * rule which was about avoiding per-card WebGL contexts, not images.
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
        'group block h-[clamp(180px,22vh,220px)] rounded-lg border border-border bg-card overflow-hidden',
        'grid grid-cols-[clamp(120px,14vw,160px)_1fr]',
        'transition-colors duration-150 hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      )}
    >
      {/* Left — cover thumbnail (or placeholder). Static image only. */}
      <div className="relative h-full w-full overflow-hidden border-r border-border bg-muted/30">
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-1.5 px-2 text-center">
            <BoxIcon className="h-5 w-5" />
            <span className="text-[0.6rem]">{t('projectsGallery.card.noCover')}</span>
          </div>
        )}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'bg-background/60 backdrop-blur-[2px]',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            'pointer-events-none'
          )}
        >
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              'rounded-full border border-border bg-card px-2.5 py-1',
              'text-[0.65rem] font-medium text-foreground shadow-sm'
            )}
          >
            <BoxIcon className="h-3 w-3" />
            {t('projectsGallery.card.openProject')}
          </span>
        </div>
      </div>

      {/* Right — existing metadata column. */}
      <div className="p-[clamp(0.625rem,1vw,0.875rem)] flex flex-col gap-[clamp(0.25rem,0.5vh,0.5rem)] min-w-0">
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
