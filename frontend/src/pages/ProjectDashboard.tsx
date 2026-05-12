import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Layers,
  Box,
  Package,
  AlertCircle,
  Eye,
  Table2,
} from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useProjectStatistics } from '@/hooks/use-project-stats';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/Layout/AppLayout';
import { DashboardGrid, type DashboardLayoutDefinition } from '@/components/Layout';
import { TypeDashboard } from '@/components/features/warehouse/TypeDashboard';
import { DrillModal, type DrillTab } from '@/components/features/drill/DrillModal';
import { ProjectFloorsTab } from '@/components/features/projects/ProjectFloorsTab';
import { useProjectFilterActions } from '@/contexts/ProjectFilterProvider';
import {
  useDashboardMetrics,
  type ModelHealthMetrics,
} from '@/hooks/use-warehouse';
import {
  ProjectKpiTile,
  AttentionFeedTile,
  RecentActivityRibbon,
  DisciplineBarsTile,
  HealthSignalsTile,
} from '@/components/features/project-dashboard';

// ── Discipline colors (from design system) ──

const DISCIPLINE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ARK: { bg: 'bg-[#f3f5fa]', text: 'text-[#4a5280]', border: 'border-t-[#4a5280]' },
  RIB: { bg: 'bg-[#f7f8e4]', text: 'text-[#5a5c15]', border: 'border-t-[#5a5c15]' },
  RIV: { bg: 'bg-[#e8f2ee]', text: 'text-[#157954]', border: 'border-t-[#157954]' },
  RIE: { bg: 'bg-[#e9e9eb]', text: 'text-[#21263A]', border: 'border-t-[#21263A]' },
};

const DEFAULT_DISC = { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-t-muted-foreground' };

function discColor(disc: string | null) {
  if (!disc) return DEFAULT_DISC;
  const key = disc.toUpperCase();
  return DISCIPLINE_COLORS[key] ?? DEFAULT_DISC;
}

// ── Health bar color ──

function healthColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function healthTextColor(score: number): string {
  if (score >= 80) return 'text-green-700';
  if (score >= 50) return 'text-yellow-700';
  return 'text-red-700';
}

// ── Tone helper for KPI tiles ──

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

function toneFromPercent(pct: number | null | undefined, thresholds: { warn: number; good: number }): Tone {
  if (pct === null || pct === undefined) return 'neutral';
  if (pct >= thresholds.good) return 'good';
  if (pct >= thresholds.warn) return 'warning';
  return 'danger';
}

// ── Main Component ──

export default function ProjectDashboard() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(id!);
  const { data: stats, isLoading: statsLoading, error: statsError } = useProjectStatistics(id!);
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics({ projectId: id! });

  if (projectLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="text-text-secondary">{t('common.loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (projectError || !project) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] p-6">
          <div className="w-full">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('common.back')}
            </Button>
            <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-semibold">{t('dashboard.projectNotFound')}</h3>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-4rem)] p-6">
        <div className="w-full flex flex-col gap-4">
          {/* Header */}
          <header className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="hidden sm:flex">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Button>
              <div>
                <h1 className="text-xl font-bold text-text-primary">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-text-secondary">{project.description}</p>
                )}
              </div>
            </div>
          </header>

          {/* Tabbed Dashboard */}
          <Tabs defaultValue="overview" className="flex flex-col">
            <TabsList className="flex-shrink-0 w-fit">
              <TabsTrigger value="overview">{t('dashboard.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="models">{t('nav.models')}</TabsTrigger>
              <TabsTrigger value="bim">{t('dashboard.tabs.bim')}</TabsTrigger>
              <TabsTrigger value="floors">{t('floors.tab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab
                projectId={id!}
                stats={stats}
                statsLoading={statsLoading}
                statsError={statsError}
                metrics={metrics}
                metricsLoading={metricsLoading}
              />
            </TabsContent>

            <TabsContent value="models">
              <ModelsTab projectId={id!} metrics={metrics} metricsLoading={metricsLoading} />
            </TabsContent>

            <TabsContent value="bim" className="min-h-[calc(100vh-12rem)]">
              <TypeDashboard projectId={id!} />
            </TabsContent>

            <TabsContent value="floors">
              <ProjectFloorsTab projectId={id!} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}

// ── Overview Tab ──

type DrillSource =
  | { type: 'models' }
  | { type: 'types' }
  | { type: 'materials' }
  | null;

// Above-the-fold dashboard layout: a single 4x3 grid that places the four KPI
// tiles + health-signals tile on the top two rows and the three context tiles
// (discipline bars, attention feed, recent activity) on row 3. The grid is
// purely above-the-fold; the model grid renders below it.
const OVERVIEW_LAYOUT: DashboardLayoutDefinition = {
  rows: 3,
  cols: 4,
  layout: [
    ['kpi-models', 'kpi-elements', 'kpi-types', 'kpi-materials'],
    ['health-signals', 'health-signals', 'attention', 'attention'],
    ['disciplines', 'disciplines', 'recent', 'recent'],
  ],
};

function OverviewTab({
  projectId,
  stats,
  statsLoading,
  statsError,
  metrics,
  metricsLoading,
}: {
  projectId: string;
  stats: ReturnType<typeof useProjectStatistics>['data'];
  statsLoading: boolean;
  statsError: Error | null;
  metrics: ReturnType<typeof useDashboardMetrics>['data'];
  metricsLoading: boolean;
}) {
  const { t } = useTranslation();
  const [drillSource, setDrillSource] = useState<DrillSource>(null);
  const { setDiscipline } = useProjectFilterActions();

  const drillConfig = useMemo(() => {
    if (!drillSource) return null;

    switch (drillSource.type) {
      case 'models': {
        const rows = (metrics?.models ?? []).map((m) => ({
          name: m.name,
          discipline: m.discipline ?? '—',
          total_types: m.total_types,
          mapped: m.mapped,
          health_score: m.health_score,
          status: m.status,
        }));
        return {
          title: t('dashboard.models'),
          subtitle: `${rows.length} ${t('nav.models').toLowerCase()}`,
          tabs: [
            {
              id: 'models',
              label: t('nav.models'),
              count: rows.length,
              columns: [
                { key: 'name', label: t('dashboard.modelName'), sortable: true },
                { key: 'discipline', label: t('dashboard.discipline'), sortable: true },
                { key: 'total_types', label: t('drill.types'), align: 'right' as const, sortable: true },
                { key: 'mapped', label: t('common.mapped'), align: 'right' as const, sortable: true },
                { key: 'health_score', label: 'Score', align: 'right' as const, sortable: true },
              ],
              data: rows,
            },
          ] as DrillTab[],
        };
      }
      case 'types': {
        const rows = (stats?.top_types ?? []).map((tt) => ({
          name: tt.name,
          ifc_type: tt.ifc_type,
          count: tt.count,
          quantity: tt.quantity,
          unit: tt.unit,
        }));
        return {
          title: t('drill.types'),
          subtitle: `${stats?.type_count ?? 0} ${t('drill.types').toLowerCase()}, ${stats?.type_mapped_count ?? 0} ${t('common.mapped').toLowerCase()}`,
          tabs: [
            {
              id: 'types',
              label: t('drill.types'),
              count: rows.length,
              columns: [
                { key: 'name', label: 'Type', sortable: true },
                { key: 'ifc_type', label: 'IFC Class', sortable: true },
                { key: 'count', label: t('drill.instances'), align: 'right' as const, sortable: true },
                { key: 'quantity', label: 'Qty', align: 'right' as const, sortable: true },
                { key: 'unit', label: 'Unit', sortable: true },
              ],
              data: rows,
            },
          ] as DrillTab[],
        };
      }
      case 'materials': {
        const rows = (stats?.top_materials ?? []).map((m) => ({
          name: m.name,
          category: m.category ?? '—',
          count: m.count,
        }));
        return {
          title: t('dashboard.materials'),
          subtitle: `${stats?.material_count ?? 0} total`,
          tabs: [
            {
              id: 'materials',
              label: t('dashboard.materials'),
              count: rows.length,
              columns: [
                { key: 'name', label: 'Material', sortable: true },
                { key: 'category', label: 'Category', sortable: true },
                { key: 'count', label: t('drill.instances'), align: 'right' as const, sortable: true },
              ],
              data: rows,
            },
          ] as DrillTab[],
        };
      }
    }
  }, [drillSource, metrics, stats, t]);

  const loading = statsLoading || metricsLoading;

  // KPI derived values
  const typeCount = stats?.type_count ?? 0;
  const typeMapped = stats?.type_mapped_count ?? 0;
  const typeMappedPct = typeCount > 0 ? Math.round((typeMapped / typeCount) * 100) : 0;
  const matCount = stats?.material_count ?? 0;
  const matMapped = stats?.material_mapped_count ?? 0;
  const matMappedPct = matCount > 0 ? Math.round((matMapped / matCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,1vw,0.75rem)] pt-[clamp(0.375rem,0.75vh,0.625rem)]">
      {/* Stats error banner */}
      {statsError && !statsLoading && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('dashboard.statsError')}</span>
          </div>
        </div>
      )}

      {/* Above-the-fold grid: KPI tiles + health signals + attention + discipline + recent */}
      <div
        className="w-full"
        style={{ minHeight: 'clamp(28rem, 48vh, 36rem)' }}
      >
        <DashboardGrid layout={OVERVIEW_LAYOUT}>
          <ProjectKpiTile
            id="kpi-models"
            icon={<Layers className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
            label={t('projectDash.kpi.models')}
            value={stats?.model_count ?? 0}
            loading={loading}
            onClick={() => setDrillSource({ type: 'models' })}
            caption={
              (stats?.model_count ?? 0) === 0 && !loading
                ? t('projectDash.kpi.modelsEmpty')
                : undefined
            }
          />
          <ProjectKpiTile
            id="kpi-elements"
            icon={<Box className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
            label={t('projectDash.kpi.elements')}
            value={stats?.element_count ?? 0}
            loading={loading}
          />
          <ProjectKpiTile
            id="kpi-types"
            icon={<Package className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
            label={t('projectDash.kpi.types')}
            value={typeMapped}
            totalValue={typeCount}
            loading={loading}
            tone={toneFromPercent(typeMappedPct, { warn: 50, good: 80 })}
            subValue={
              typeCount > 0
                ? t('projectDash.kpi.percentMapped', { percent: typeMappedPct })
                : undefined
            }
            caption={typeCount === 0 && !loading ? '—' : undefined}
            progressValue={typeMappedPct}
            progressColor="hsl(158 70% 28%)"
            onClick={() => setDrillSource({ type: 'types' })}
          />
          <ProjectKpiTile
            id="kpi-materials"
            icon={<Eye className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
            label={t('projectDash.kpi.materials')}
            value={matMapped}
            totalValue={matCount}
            loading={loading}
            tone={toneFromPercent(matMappedPct, { warn: 50, good: 80 })}
            subValue={
              matCount > 0
                ? t('projectDash.kpi.percentMapped', { percent: matMappedPct })
                : undefined
            }
            caption={matCount === 0 && !loading ? '—' : undefined}
            progressValue={matMappedPct}
            progressColor="hsl(158 70% 28%)"
            onClick={() => setDrillSource({ type: 'materials' })}
          />

          {/* Row 2: Health signals (promoted from BIM tab) + Attention feed */}
          <div id="health-signals" className="h-full">
            <HealthSignalsTile
              id="health-signals-inner"
              summary={metrics?.project_summary}
              loading={loading}
            />
          </div>
          <div id="attention" className="h-full">
            <AttentionFeedTile id="attention-inner" projectId={projectId} />
          </div>

          {/* Row 3: Discipline bars + Recent activity ribbon */}
          <div id="disciplines" className="h-full">
            <DisciplineBarsTile
              id="disciplines-inner"
              byDiscipline={metrics?.by_discipline}
              loading={loading}
              onBarClick={(code) => setDiscipline([code])}
              onViewData={() => setDrillSource({ type: 'models' })}
            />
          </div>
          <div id="recent" className="h-full">
            <RecentActivityRibbon id="recent-inner" projectId={projectId} />
          </div>
        </DashboardGrid>
      </div>

      {/* Row 4: Model cards (below the fold) */}
      <DashCard title={`${t('nav.models')} (${metrics?.models?.length ?? 0})`}>
        {loading ? (
          <div className="text-xs text-text-secondary">{t('common.loading')}</div>
        ) : metrics?.models && metrics.models.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-[clamp(0.4rem,0.8vw,0.6rem)]">
            {metrics.models.map((m) => (
              <ModelMiniCard key={m.id} model={m} projectId={projectId} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-text-tertiary">{t('dashboard.noModels', 'No models yet')}</div>
        )}
      </DashCard>

      {/* Drill modal */}
      {drillConfig && (
        <DrillModal
          open={drillSource !== null}
          onOpenChange={(open) => { if (!open) setDrillSource(null); }}
          title={drillConfig.title}
          subtitle={drillConfig.subtitle}
          tabs={drillConfig.tabs}
          exportFilename={`project_${projectId}`}
        />
      )}
    </div>
  );
}

// ── Models Tab ──

function ModelsTab({
  projectId,
  metrics,
  metricsLoading,
}: {
  projectId: string;
  metrics: ReturnType<typeof useDashboardMetrics>['data'];
  metricsLoading: boolean;
}) {
  const { t } = useTranslation();

  if (metricsLoading) {
    return <div className="pt-4 text-text-secondary text-sm">{t('common.loading')}</div>;
  }

  const models = metrics?.models ?? [];

  if (!models.length) {
    return (
      <div className="pt-8 text-center text-text-tertiary text-sm">
        {t('dashboard.noModels', 'No models uploaded yet')}
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-[clamp(0.5rem,1vw,0.75rem)]">
        {models.map((m) => (
          <ModelMiniCard key={m.id} model={m} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}

// ── Shared Sub-components ──

function DashCard({
  title,
  onViewData,
  viewDataLabel,
  children,
}: {
  title: string;
  onViewData?: () => void;
  viewDataLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-[clamp(0.5rem,1vw,0.75rem)]">
      <div className="flex items-center justify-between mb-[clamp(0.3rem,0.6vw,0.5rem)]">
        <div className="text-[clamp(0.55rem,0.9vw,0.65rem)] font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </div>
        {onViewData && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewData(); }}
            aria-label={viewDataLabel ?? 'View data'}
            className="p-1 -m-1 text-text-tertiary hover:text-text-primary rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Table2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ModelMiniCard({ model, projectId }: { model: ModelHealthMetrics; projectId: string }) {
  const dc = discColor(model.discipline);
  const pct = model.total_types > 0 ? Math.round((model.mapped / model.total_types) * 100) : 0;

  return (
    <Link
      to={`/projects/${projectId}/models/${model.id}`}
      className={`block rounded-lg border border-border bg-background p-[clamp(0.4rem,0.8vw,0.6rem)] border-t-[3px] ${dc.border} hover:ring-1 hover:ring-primary/20 transition-all`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="text-[clamp(0.6rem,1vw,0.75rem)] font-semibold text-text-primary truncate">
            {model.name}
          </div>
        </div>
        {model.discipline && (
          <span className={`text-[clamp(0.45rem,0.7vw,0.55rem)] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ml-2 ${dc.bg} ${dc.text}`}>
            {model.discipline}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[clamp(0.5rem,0.8vw,0.6rem)] mb-2">
        <div>
          <span className="text-text-tertiary">Typer</span>
          <br />
          <strong className="text-text-primary tabular-nums">{model.total_types}</strong>
        </div>
        <div>
          <span className="text-text-tertiary">Mapped</span>
          <br />
          <strong className="text-text-primary tabular-nums">{model.mapped}</strong>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[clamp(0.3rem,0.5vw,0.4rem)] bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${healthColor(pct)}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[clamp(0.5rem,0.8vw,0.6rem)] font-semibold tabular-nums ${healthTextColor(pct)}`}>
          {pct}%
        </span>
      </div>
    </Link>
  );
}

