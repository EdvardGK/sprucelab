import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, AlertCircle } from 'lucide-react';

import { useProjects } from '@/hooks/use-projects';
import { useModels } from '@/hooks/use-models';
import { useProjectsKpis, modelsForProject } from '@/hooks/useProjectsKpis';
import { Button } from '@/components/ui/button';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import {
  ProjectsGalleryKpis,
  ProjectGalleryCard,
} from '@/components/features/projects-gallery';
import { cn } from '@/lib/utils';

type SortKey = 'lastActivity' | 'name' | 'mostModels' | 'mostTypes';
type FilterKey = 'active' | 'all' | 'archived';

const SORT_KEYS: SortKey[] = ['lastActivity', 'name', 'mostModels', 'mostTypes'];
const FILTER_KEYS: FilterKey[] = ['active', 'all', 'archived'];

/**
 * Projects Gallery — top-level surface for picking a project to open.
 *
 * Layout: `<PageShell>` chrome (no `container mx-auto`, no max-width
 * cap), project-level KPI row across the top, sort/filter chips, and a
 * fixed-height card grid below. Cards use a discipline sparkbar instead
 * of 3D thumbnails (WebGL context limit) and hover via border tint only.
 */
export default function ProjectsGallery() {
  const { t } = useTranslation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('lastActivity');
  const [filterKey, setFilterKey] = useState<FilterKey>('active');

  const { data: projects, isLoading, error } = useProjects();
  const { data: models } = useModels();
  const kpis = useProjectsKpis();

  // Sort + filter on the client. The backend doesn't expose an
  // `archived` flag on Project yet, so the chip is wired but acts as a
  // pass-through for "all" until `is_archived` lands. Default = active.
  const visibleProjects = useMemo(() => {
    if (!projects) return [];
    // No archive field on Project today; treat `all`/`active` as identical
    // until the backend exposes it. `archived` returns the empty list.
    const filtered =
      filterKey === 'archived' ? [] : projects;

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'mostModels':
          return (b.model_count || 0) - (a.model_count || 0);
        case 'mostTypes':
          // Per-project type count not on payload; fall back to most models.
          return (b.model_count || 0) - (a.model_count || 0);
        case 'lastActivity':
        default: {
          const at = new Date(a.updated_at).getTime();
          const bt = new Date(b.updated_at).getTime();
          return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
        }
      }
    });
    return sorted;
  }, [projects, sortKey, filterKey]);

  if (error) {
    return (
      <AppLayout>
        <PageShell title={t('projectsGallery.title')} subtitle={t('projectsGallery.subtitle')}>
          <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">{t('projectsGallery.errorTitle')}</h3>
            </div>
            <p className="text-sm">{error.message}</p>
          </div>
        </PageShell>
      </AppLayout>
    );
  }

  const newProjectButton = (
    <Button onClick={() => setCreateDialogOpen(true)} size="sm">
      <Plus className="mr-1.5 h-4 w-4" />
      {t('projectsGallery.newProject')}
    </Button>
  );

  return (
    <AppLayout>
      <PageShell
        title={t('projectsGallery.title')}
        subtitle={t('projectsGallery.subtitle')}
        headerRight={newProjectButton}
      >
        {/* KPI row */}
        <ProjectsGalleryKpis kpis={kpis} />

        {/* Sort + filter chips */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] uppercase tracking-wide font-medium text-muted-foreground mr-1">
              {t('projectsGallery.sort.label')}
            </span>
            {SORT_KEYS.map((k) => (
              <Chip
                key={k}
                active={sortKey === k}
                onClick={() => setSortKey(k)}
                label={t(`projectsGallery.sort.${k}`)}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] uppercase tracking-wide font-medium text-muted-foreground mr-1">
              {t('projectsGallery.filter.label')}
            </span>
            {FILTER_KEYS.map((k) => (
              <Chip
                key={k}
                active={filterKey === k}
                onClick={() => setFilterKey(k)}
                label={t(`projectsGallery.filter.${k}`)}
              />
            ))}
          </div>
        </div>

        {/* Card grid */}
        {isLoading ? (
          <div
            className="grid gap-[clamp(0.5rem,1vw,1rem)]"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[180px] rounded-lg border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            archived={filterKey === 'archived'}
            onCreate={() => setCreateDialogOpen(true)}
          />
        ) : (
          <div
            className="grid gap-[clamp(0.5rem,1vw,1rem)]"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {visibleProjects.map((project) => (
              <ProjectGalleryCard
                key={project.id}
                project={project}
                models={modelsForProject(models, project.id)}
              />
            ))}
          </div>
        )}

        <CreateProjectDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </PageShell>
    </AppLayout>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function Chip({ active, onClick, label }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-[clamp(0.6rem,0.8vw,0.75rem)] font-medium transition-colors',
        'border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        active
          ? 'border-primary/60 bg-primary/10 text-primary'
          : 'border-border text-text-secondary hover:border-primary/30 hover:text-text-primary'
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({
  archived,
  onCreate,
}: {
  archived: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  if (archived) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <h3 className="text-[clamp(0.85rem,1.1vw,1rem)] font-semibold text-text-primary mb-2">
          {t('projectsGallery.empty.archivedTitle')}
        </h3>
        <p className="text-[clamp(0.7rem,0.9vw,0.85rem)] text-text-secondary">
          {t('projectsGallery.empty.archivedSubtitle')}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-12 text-center">
      <h3 className="text-[clamp(0.85rem,1.1vw,1rem)] font-semibold text-text-primary mb-2">
        {t('projectsGallery.empty.title')}
      </h3>
      <p className="text-[clamp(0.7rem,0.9vw,0.85rem)] text-text-secondary mb-6">
        {t('projectsGallery.empty.subtitle')}
      </p>
      <Button onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        {t('projectsGallery.newProject')}
      </Button>
    </div>
  );
}
