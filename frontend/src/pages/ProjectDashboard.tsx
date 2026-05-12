import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Box,
  Package,
  AlertCircle,
  Eye,
} from 'lucide-react';

import { useProject } from '@/hooks/use-projects';
import { useProjectStatistics } from '@/hooks/use-project-stats';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { DashboardGrid, type DashboardLayoutDefinition } from '@/components/Layout';
import { DrillModal, type DrillTab } from '@/components/features/drill/DrillModal';
import { useProjectFilterActions } from '@/contexts/ProjectFilterProvider';
import { useDashboardMetrics } from '@/hooks/use-warehouse';
import {
  ProjectKpiTile,
  AttentionFeedTile,
  RecentActivityRibbon,
  DisciplineBarsTile,
  HealthSignalsTile,
} from '@/components/features/project-dashboard';

// ── Tone helper ──

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

function toneFromPercent(
  pct: number | null | undefined,
  thresholds: { warn: number; good: number }
): Tone {
  if (pct === null || pct === undefined) return 'neutral';
  if (pct >= thresholds.good) return 'good';
  if (pct >= thresholds.warn) return 'warning';
  return 'danger';
}

// ── Drill targets ──

type DrillSource =
  | { type: 'models' }
  | { type: 'types' }
  | { type: 'materials' }
  | null;

// Above-the-fold layout: KPI cluster on row 1, Health + Attention on row
// 2, Disciplines + Recent on row 3. No inner tabs — the page scrolls.
const OVERVIEW_LAYOUT: DashboardLayoutDefinition = {
  rows: 3,
  cols: 4,
  layout: [
    ['kpi-models', 'kpi-elements', 'kpi-types', 'kpi-materials'],
    ['health-signals', 'health-signals', 'attention', 'attention'],
    ['disciplines', 'disciplines', 'recent', 'recent'],
  ],
};

/**
 * Project Dashboard — landing surface for a single project.
 *
 * Layout (after Session 7 cleanup):
 *   PageShell chrome
 *   Row 1: 4 KPI tiles (Models / Elements / Types / Materials)
 *   Row 2: HealthSignals (with BIM tab signals folded in) | Attention
 *   Row 3: DisciplineBars | RecentActivity
 *
 * The inner `<Tabs>` (Overview / Models / BIM / Floors) is gone — sidebar
 * owns the navigation between these surfaces. Floors moved to a new
 * top-level route (`/projects/:id/floors`). The "Back to projects"
 * button is gone — sidebar owns nav. The `min-h-[calc(100vh-X)]`
 * viewport-lock is gone — `<PageShell>` handles padding and the page
 * scrolls naturally.
 */
export default function ProjectDashboard() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(id!);
  const { data: stats, isLoading: statsLoading, error: statsError } = useProjectStatistics(id!);
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics({ projectId: id! });
  const { setDiscipline } = useProjectFilterActions();
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

  if (projectLoading) {
    return (
      <AppLayout>
        <PageShell title={t('common.loading')}>
          <div className="text-text-secondary">{t('common.loading')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  if (projectError || !project) {
    return (
      <AppLayout>
        <PageShell title={t('dashboard.projectNotFound')}>
          <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">{t('dashboard.projectNotFound')}</h3>
            </div>
          </div>
        </PageShell>
      </AppLayout>
    );
  }

  const loading = statsLoading || metricsLoading;

  // KPI derived values
  const typeCount = stats?.type_count ?? 0;
  const typeMapped = stats?.type_mapped_count ?? 0;
  const typeMappedPct = typeCount > 0 ? Math.round((typeMapped / typeCount) * 100) : 0;
  const matCount = stats?.material_count ?? 0;
  const matMapped = stats?.material_mapped_count ?? 0;
  const matMappedPct = matCount > 0 ? Math.round((matMapped / matCount) * 100) : 0;

  return (
    <AppLayout>
      <PageShell title={project.name} subtitle={project.description || undefined}>
        {statsError && !statsLoading && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{t('dashboard.statsError')}</span>
            </div>
          </div>
        )}

        {/* Above-the-fold grid: KPIs + Health + Attention + Disciplines + Recent */}
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

            {/* Row 2: HealthSignals (folds in former BIM tab signals) + Attention */}
            <div id="health-signals" className="h-full">
              <HealthSignalsTile
                id="health-signals-inner"
                summary={metrics?.project_summary}
                loading={loading}
              />
            </div>
            <div id="attention" className="h-full">
              <AttentionFeedTile id="attention-inner" projectId={id!} />
            </div>

            {/* Row 3: Discipline bars + Recent activity */}
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
              <RecentActivityRibbon id="recent-inner" projectId={id!} />
            </div>
          </DashboardGrid>
        </div>

        {/* Drill modal */}
        {drillConfig && (
          <DrillModal
            open={drillSource !== null}
            onOpenChange={(open) => { if (!open) setDrillSource(null); }}
            title={drillConfig.title}
            subtitle={drillConfig.subtitle}
            tabs={drillConfig.tabs}
            exportFilename={`project_${id}`}
          />
        )}
      </PageShell>
    </AppLayout>
  );
}
