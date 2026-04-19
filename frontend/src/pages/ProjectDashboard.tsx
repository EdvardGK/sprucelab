import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Layers,
  Box,
  Package,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
} from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useProjectStatistics } from '@/hooks/use-project-stats';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TypeDashboard } from '@/components/features/warehouse/TypeDashboard';
import { DrillModal, type DrillTab } from '@/components/features/drill/DrillModal';
import {
  useDashboardMetrics,
  type ModelHealthMetrics,
  type DisciplineMetrics,
} from '@/hooks/use-warehouse';

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
      <div className="h-[calc(100vh-4rem)] overflow-hidden p-6">
        <div className="w-full h-full flex flex-col gap-4">
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
          <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
            <TabsList className="flex-shrink-0 w-fit">
              <TabsTrigger value="overview">{t('dashboard.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="models">{t('nav.models')}</TabsTrigger>
              <TabsTrigger value="bim">{t('dashboard.tabs.bim')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto">
              <OverviewTab
                projectId={id!}
                stats={stats}
                statsLoading={statsLoading}
                statsError={statsError}
                metrics={metrics}
                metricsLoading={metricsLoading}
              />
            </TabsContent>

            <TabsContent value="models" className="flex-1 min-h-0 overflow-y-auto">
              <ModelsTab projectId={id!} metrics={metrics} metricsLoading={metricsLoading} />
            </TabsContent>

            <TabsContent value="bim" className="flex-1 min-h-0 overflow-hidden">
              <TypeDashboard projectId={id!} />
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
  | { type: 'discipline'; code: string }
  | null;

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
          tabs: [{
            id: 'models', label: t('nav.models'), count: rows.length,
            columns: [
              { key: 'name', label: t('dashboard.modelName'), sortable: true },
              { key: 'discipline', label: t('dashboard.discipline'), sortable: true },
              { key: 'total_types', label: t('drill.types'), align: 'right' as const, sortable: true },
              { key: 'mapped', label: t('common.mapped'), align: 'right' as const, sortable: true },
              { key: 'health_score', label: 'Score', align: 'right' as const, sortable: true },
            ],
            data: rows,
          }] as DrillTab[],
        };
      }
      case 'types': {
        const rows = (stats?.top_types ?? []).map((t) => ({
          name: t.name,
          ifc_type: t.ifc_type,
          count: t.count,
          quantity: t.quantity,
          unit: t.unit,
        }));
        return {
          title: t('drill.types'),
          subtitle: `${stats?.type_count ?? 0} ${t('drill.types').toLowerCase()}, ${stats?.type_mapped_count ?? 0} ${t('common.mapped').toLowerCase()}`,
          tabs: [{
            id: 'types', label: t('drill.types'), count: rows.length,
            columns: [
              { key: 'name', label: 'Type', sortable: true },
              { key: 'ifc_type', label: 'IFC Class', sortable: true },
              { key: 'count', label: t('drill.instances'), align: 'right' as const, sortable: true },
              { key: 'quantity', label: 'Qty', align: 'right' as const, sortable: true },
              { key: 'unit', label: 'Unit', sortable: true },
            ],
            data: rows,
          }] as DrillTab[],
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
          tabs: [{
            id: 'materials', label: t('dashboard.materials'), count: rows.length,
            columns: [
              { key: 'name', label: 'Material', sortable: true },
              { key: 'category', label: 'Category', sortable: true },
              { key: 'count', label: t('drill.instances'), align: 'right' as const, sortable: true },
            ],
            data: rows,
          }] as DrillTab[],
        };
      }
      case 'discipline': {
        const disc = drillSource.code;
        const models = (metrics?.models ?? []).filter(
          (m) => m.discipline?.toUpperCase() === disc.toUpperCase()
        );
        const rows = models.map((m) => ({
          name: m.name,
          total_types: m.total_types,
          mapped: m.mapped,
          health_score: m.health_score,
        }));
        return {
          title: disc,
          subtitle: `${rows.length} ${t('nav.models').toLowerCase()}`,
          tabs: [{
            id: 'models', label: t('nav.models'), count: rows.length,
            columns: [
              { key: 'name', label: t('dashboard.modelName'), sortable: true },
              { key: 'total_types', label: t('drill.types'), align: 'right' as const, sortable: true },
              { key: 'mapped', label: t('common.mapped'), align: 'right' as const, sortable: true },
              { key: 'health_score', label: 'Score', align: 'right' as const, sortable: true },
            ],
            data: rows,
          }] as DrillTab[],
        };
      }
    }
  }, [drillSource, metrics, stats, t]);

  const loading = statsLoading || metricsLoading;

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,1vw,0.75rem)] pt-2">
      {/* Stats error banner */}
      {statsError && !statsLoading && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('dashboard.statsError')}</span>
          </div>
        </div>
      )}

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-4 gap-[clamp(0.4rem,0.8vw,0.6rem)] flex-shrink-0">
        <KpiCard
          label={t('dashboard.models')}
          value={loading ? '...' : String(stats?.model_count ?? 0)}
          icon={<Layers className="h-4 w-4" />}
          onClick={() => setDrillSource({ type: 'models' })}
        />
        <KpiCard
          label={t('dashboard.elements')}
          value={loading ? '...' : (stats?.element_count ?? 0).toLocaleString()}
          icon={<Box className="h-4 w-4" />}
        />
        <KpiCard
          label={t('drill.types')}
          value={loading ? '...' : `${stats?.type_mapped_count ?? 0}/${stats?.type_count ?? 0}`}
          sub={stats?.type_count ? `${Math.round(((stats.type_mapped_count ?? 0) / stats.type_count) * 100)}%` : undefined}
          icon={<Package className="h-4 w-4" />}
          onClick={() => setDrillSource({ type: 'types' })}
        />
        <KpiCard
          label={t('dashboard.materials')}
          value={loading ? '...' : `${stats?.material_mapped_count ?? 0}/${stats?.material_count ?? 0}`}
          icon={<Eye className="h-4 w-4" />}
          onClick={() => setDrillSource({ type: 'materials' })}
        />
      </div>

      {/* Row 2: Discipline Breakdown + NS3451 Coverage + Classification Progress */}
      <div className="grid grid-cols-3 gap-[clamp(0.4rem,0.8vw,0.6rem)]">
        {/* Discipline Breakdown */}
        <DashCard title={t('dashboard.disciplines')}>
          {loading ? (
            <div className="text-xs text-text-secondary">{t('common.loading')}</div>
          ) : metrics?.by_discipline ? (
            <DisciplineBreakdown
              byDiscipline={metrics.by_discipline}
              onBarClick={(code) => setDrillSource({ type: 'discipline', code })}
            />
          ) : (
            <div className="text-xs text-text-tertiary">{t('drill.noData')}</div>
          )}
        </DashCard>

        {/* NS3451 Coverage */}
        <DashCard title={t('dashboard.ns3451Mapping')}>
          {loading ? (
            <div className="text-xs text-text-secondary">{t('common.loading')}</div>
          ) : stats?.ns3451_coverage ? (
            <NS3451Card coverage={stats.ns3451_coverage} />
          ) : null}
        </DashCard>

        {/* Classification Progress */}
        <DashCard title={t('dashboard.classificationProgress', 'Classification Progress')}>
          {loading ? (
            <div className="text-xs text-text-secondary">{t('common.loading')}</div>
          ) : metrics?.project_summary ? (
            <div className="space-y-3">
              <ProgressRow label={t('dashboard.typeClassification', 'Type classification')} pct={metrics.project_summary.classification_percent} />
              <ProgressRow label={t('dashboard.unitAssignment', 'Unit assignment')} pct={metrics.project_summary.unit_percent} />
              <ProgressRow label={t('dashboard.materialMapping', 'Material mapping')} pct={metrics.project_summary.material_percent} />
            </div>
          ) : null}
        </DashCard>
      </div>

      {/* Row 3: Model cards */}
      <DashCard title={`${t('nav.models')} (${metrics?.models?.length ?? 0})`}>
        {loading ? (
          <div className="text-xs text-text-secondary">{t('common.loading')}</div>
        ) : metrics?.models && metrics.models.length > 0 ? (
          <div className="grid grid-cols-4 gap-[clamp(0.4rem,0.8vw,0.6rem)]">
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
      <div className="grid grid-cols-4 gap-[clamp(0.5rem,1vw,0.75rem)]">
        {models.map((m) => (
          <ModelMiniCard key={m.id} model={m} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}

// ── Shared Sub-components ──

function KpiCard({
  label,
  value,
  sub,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-background p-[clamp(0.5rem,1vw,0.75rem)] ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-tertiary">{icon}</span>
        <span className="text-[clamp(0.55rem,0.9vw,0.65rem)] text-text-secondary font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-[clamp(1.2rem,3vw,1.75rem)] font-bold text-text-primary tabular-nums leading-none">
        {value}
      </div>
      {sub && (
        <div className="text-[clamp(0.5rem,0.8vw,0.6rem)] text-text-tertiary mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function DashCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-[clamp(0.5rem,1vw,0.75rem)]">
      <div className="text-[clamp(0.55rem,0.9vw,0.65rem)] font-semibold text-text-secondary uppercase tracking-wider mb-[clamp(0.3rem,0.6vw,0.5rem)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function DisciplineBreakdown({
  byDiscipline,
  onBarClick,
}: {
  byDiscipline: Record<string, DisciplineMetrics>;
  onBarClick: (code: string) => void;
}) {
  const entries = Object.entries(byDiscipline).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-[clamp(0.3rem,0.5vw,0.4rem)]">
      {entries.map(([code, m]) => {
        const pct = m.total > 0 ? Math.round((m.mapped / m.total) * 100) : 0;
        const dc = discColor(code);
        return (
          <div
            key={code}
            className="flex items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 transition-colors"
            onClick={() => onBarClick(code)}
          >
            <span className={`text-[clamp(0.5rem,0.8vw,0.6rem)] font-semibold px-1.5 py-0.5 rounded ${dc.bg} ${dc.text} w-10 text-center flex-shrink-0`}>
              {code}
            </span>
            <div className="flex-1 h-[clamp(0.4rem,0.7vw,0.5rem)] bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${healthColor(pct)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[clamp(0.5rem,0.8vw,0.6rem)] font-semibold tabular-nums text-text-primary w-16 text-right flex-shrink-0">
              {m.mapped}/{m.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NS3451Card({ coverage }: { coverage: { total: number; mapped: number; pending: number; review: number; percentage: number } }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[clamp(1rem,2.5vw,1.5rem)] font-bold text-text-primary tabular-nums">{coverage.percentage}%</span>
        <span className="text-[clamp(0.5rem,0.8vw,0.6rem)] text-text-tertiary">{coverage.mapped}/{coverage.total}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${healthColor(coverage.percentage)}`} style={{ width: `${coverage.percentage}%` }} />
      </div>
      <div className="space-y-1 pt-1 border-t border-border text-[clamp(0.5rem,0.8vw,0.6rem)]">
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-text-secondary">
            <CheckCircle2 className="h-3 w-3 text-green-500" /> {t('common.mapped')}
          </span>
          <span className="text-text-primary tabular-nums">{coverage.mapped}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-text-secondary">
            <Clock className="h-3 w-3 text-yellow-500" /> {t('common.pending')}
          </span>
          <span className="text-text-primary tabular-nums">{coverage.pending}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-text-secondary">
            <Eye className="h-3 w-3 text-orange-500" /> {t('dashboard.review')}
          </span>
          <span className="text-text-primary tabular-nums">{coverage.review}</span>
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ label, pct }: { label: string; pct: number }) {
  const rounded = Math.round(pct);
  return (
    <div>
      <div className="flex justify-between text-[clamp(0.5rem,0.8vw,0.6rem)] mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className={`font-semibold tabular-nums ${healthTextColor(rounded)}`}>{rounded}%</span>
      </div>
      <div className="h-[clamp(0.3rem,0.5vw,0.4rem)] bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${healthColor(rounded)}`} style={{ width: `${rounded}%` }} />
      </div>
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
