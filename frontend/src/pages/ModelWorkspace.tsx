import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, Loader2, Maximize2, X, Box, Grid3x3, Table2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useModel, useModels } from '@/hooks/use-models';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModelTypes, type IFCType } from '@/hooks/use-warehouse';
import {
  useCreateTypeMapping,
  useUpdateTypeMapping,
} from '@/hooks/use-type-mapping';
import { useToast } from '@/hooks/use-toast';
import {
  useModelAnalysis,
  useModelStoreyVerification,
  useRunAnalysis,
} from '@/hooks/use-model-analysis';
import { Button } from '@/components/ui/button';
import { ModelStatusBadge } from '@/components/ModelStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QTODashboard } from '@/components/features/qto/QTODashboard';
import { UnifiedBIMViewer } from '@/components/features/viewer/UnifiedBIMViewer';
import { ViewerPane } from '@/components/features/viewer/ViewerPane';
import { ElementProperties } from '@/components/features/viewer/ElementPropertiesPanel';
import { IFCPropertiesPanel } from '@/components/features/viewer/IFCPropertiesPanel';
import { AppLayout } from '@/components/Layout/AppLayout';
import type { Model, ModelAnalysis, AnalysisTypeRecord } from '@/lib/api-types';
import { treemapLayout } from '@/lib/treemap';
import { tokens } from '@/lib/design-tokens';
import { DrillModal, type DrillTab } from '@/components/features/drill/DrillModal';
import { DrillTarget } from '@/components/filters/DrillTarget';
import {
  useActiveFilterCount,
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';
import { FilterChips } from '@/components/filters/FilterChips';
import { FilteredEmptyBanner } from '@/components/filters/FilteredEmptyBanner';
import { useProjectFilterValidate } from '@/hooks/useProjectFilterValidate';
import { useResetFiltersOnModelChange } from '@/hooks/useResetFiltersOnModelChange';
import type { FilterContext } from '@/lib/embed/types';
import { deriveTypeVisibility } from '@/lib/filters/deriveTypeVisibility';
import { AnalysisDetailsRail } from '@/components/features/model-workspace/AnalysisDetailsRail';
import { AnalysisKpiCluster } from '@/components/features/model-workspace/AnalysisKpiCluster';
import { VerifiedStoreyChart } from '@/components/features/model-workspace/VerifiedStoreyChart';
import { ComingSoonTile } from '@/components/features/model-workspace/ComingSoonTile';
import { StatisticsTab } from '@/components/features/model-workspace/StatisticsTab';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';

// Tab definitions — see CLAUDE.md "modelers own data" + Track C lift brief.
// Flattened: AnalysisDashboard is now the default Overview content (no
// inner sub-bar). QTO and Statistics are peers at the top level. MMI /
// Properties have been removed — they were never built.
const TAB_IDS = ['overview', 'qto', 'statistics', 'validation', 'metadata', 'scripts', 'history'] as const;
type TabId = (typeof TAB_IDS)[number];

export default function ModelWorkspace() {
  const { t } = useTranslation();
  const { id: projectId, modelId } = useParams<{ id: string; modelId: string }>();
  const navigate = useNavigate();
  // const location = useLocation();
  const { data: model, isLoading } = useModel(modelId!);
  const { data: projectModels = [] } = useModels(projectId);

  // Models in this project, ordered by upload time desc (matches ProjectModels).
  // Used by the header model selector + Prev/Next buttons so a coordinator
  // can step through every model without bouncing back to the listing.
  const orderedModels = useMemo(
    () =>
      projectModels
        .filter((m) => m.id && m.name)
        .sort((a, b) =>
          (b.created_at ?? '').localeCompare(a.created_at ?? '')
        ),
    [projectModels]
  );
  const currentIndex = useMemo(
    () => orderedModels.findIndex((m) => m.id === modelId),
    [orderedModels, modelId]
  );
  const prevModel = currentIndex > 0 ? orderedModels[currentIndex - 1] : null;
  const nextModel =
    currentIndex >= 0 && currentIndex < orderedModels.length - 1
      ? orderedModels[currentIndex + 1]
      : null;
  const goToModel = (targetId: string | null) => {
    if (!targetId || !projectId || targetId === modelId) return;
    navigate(`/projects/${projectId}/models/${targetId}`);
  };
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Reset cross-filter dimensions when the modelId transitions. A filter
  // authored against model A is stale on model B (different IFC schema,
  // different storey GUIDs, type_guids only valid in their own model).
  // The hook also clears on first mount when entering from a different
  // page that left filters in the provider — its one carve-out is a
  // `?d=...` URL deeplink, which the URL hydration hook owns.
  useResetFiltersOnModelChange(modelId);

  // Still used by the "Clear" chip in the active-filter strip below.
  const { clearDimensions } = useProjectFilterActions();

  // Active filter dimensions. Lives at the page level so the chip + Clear
  // bar can sit in the tabs subheader instead of popping above the KPI
  // cluster and pushing content down on every state change.
  const activeFilterCount = useActiveFilterCount();

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('modelDash.tabs.overview') },
    { id: 'qto', label: t('modelDash.tabs.qto') },
    { id: 'statistics', label: t('modelDash.tabs.statistics') },
    { id: 'validation', label: t('modelDash.tabs.validation') },
    { id: 'metadata', label: t('modelDash.tabs.metadata') },
    { id: 'scripts', label: t('modelDash.tabs.scripts') },
    { id: 'history', label: t('modelDash.tabs.history') },
  ];

  // Get preparsed scene from navigation state (if uploaded)
  // const preparsedScene = (location.state as any)?.preparsedScene as THREE.Group | undefined;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-text-secondary">Loading model...</div>
        </div>
      </AppLayout>
    );
  }

  if (!model) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-error">Model not found</div>
        </div>
      </AppLayout>
    );
  }

  const isReady = model.status === 'ready';

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Header — Quick Stats row removed; AnalysisKpiCluster owns
            those numbers inside OverviewTab. */}
        <header className="border-gradient-header bg-background-elevated px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-text-primary">{model.name}</h1>
                  <p className="text-sm text-text-tertiary">Version {model.version_number}</p>
                </div>
                {model.discipline && (
                  <span
                    className="text-[0.65rem] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-text-primary/5 text-text-primary border border-border"
                    title="Model discipline"
                  >
                    {model.discipline}
                  </span>
                )}
                {model.is_primary_for_discipline && (
                  <span
                    className="text-[0.65rem] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-[hsl(158_70%_28%/0.12)] text-[hsl(158_70%_28%)] border border-[hsl(158_70%_28%/0.3)]"
                    title="Primary model for this discipline"
                  >
                    main
                  </span>
                )}
                <ModelStatusBadge status={model.status} />
              </div>
            </div>

            {/* Model navigator — Prev / select / Next. Lets a coordinator
                step through every model in the project without bouncing
                back to the listing. Hidden when there's only one model. */}
            {orderedModels.length > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goToModel(prevModel?.id ?? null)}
                  disabled={!prevModel}
                  title={prevModel ? `${t('modelDash.nav.prev')} · ${prevModel.name}` : t('modelDash.nav.atStart')}
                  aria-label={t('modelDash.nav.prev')}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select
                  value={modelId ?? ''}
                  onValueChange={(value) => goToModel(value)}
                >
                  <SelectTrigger className="h-8 w-[clamp(180px,16vw,260px)] text-sm">
                    <SelectValue placeholder={t('modelDash.nav.selectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2 max-w-full">
                          <span className="truncate">{m.name}</span>
                          {m.discipline && (
                            <span className="text-[0.625rem] text-text-tertiary uppercase tracking-wide shrink-0">
                              {m.discipline}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-text-tertiary tabular-nums whitespace-nowrap">
                  {currentIndex + 1} / {orderedModels.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goToModel(nextModel?.id ?? null)}
                  disabled={!nextModel}
                  title={nextModel ? `${t('modelDash.nav.next')} · ${nextModel.name}` : t('modelDash.nav.atEnd')}
                  aria-label={t('modelDash.nav.next')}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Tabs Navigation. Active-filter chip row lives in the same flex
            row, right-aligned, so it never pushes content down when a
            filter becomes active. */}
        <div className="border-b border-border bg-background-elevated flex-shrink-0">
          <div className="flex items-stretch justify-between px-6 gap-4">
            <nav className="flex space-x-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap
                    border-b-2 -mb-px
                    ${activeTab === tab.id
                      ? 'text-text-primary border-primary'
                      : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 py-1.5 min-w-0">
                <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-signal-text whitespace-nowrap">
                  {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                </span>
                <FilterChips className="flex items-center gap-[3px] flex-nowrap overflow-x-auto" />
                <button
                  type="button"
                  onClick={() => clearDimensions()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-signal px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm transition hover:brightness-110 active:brightness-95 whitespace-nowrap"
                  aria-label="Clear all active filters"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Content — page scrolls naturally; no inner overflow shell. */}
        <div>
          {activeTab === 'overview' && (isReady ? <OverviewTab model={model} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'qto' && (isReady ? <QTODashboard modelId={model.id} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'statistics' && (isReady ? <StatisticsTab modelId={model.id} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'validation' && (isReady ? (
            <ComingSoonTile
              title={t('modelDash.tabs.validation')}
              roadmap={t('modelDash.roadmap.validation')}
            />
          ) : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'metadata' && <MetadataTab model={model} />}
          {activeTab === 'scripts' && (isReady ? (
            <ComingSoonTile
              title={t('modelDash.tabs.scripts')}
              roadmap={t('modelDash.roadmap.scripts')}
            />
          ) : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'history' && (isReady ? (
            <ComingSoonTile
              title={t('modelDash.tabs.history')}
              roadmap={t('modelDash.roadmap.history')}
            />
          ) : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Overview Tab ─── Analysis dashboard ───────────────────────────────────
//
// Flattened (Track C lift). AnalysisDashboard is now the default content
// of Overview — no inner sub-tab navigation. QTO + Statistics moved up to
// be peer top-level tabs. MMI / Properties were never built and have
// been removed.

function OverviewTab({ model }: { model: Model }) {
  const { data: analysis, isLoading } = useModelAnalysis(model.id);
  const runAnalysis = useRunAnalysis();

  if (isLoading) {
    return (
      <div className="p-[clamp(1rem,2vw,1.5rem)] grid grid-cols-5 grid-rows-[auto_1fr_1fr_auto] gap-[clamp(0.5rem,1vw,0.75rem)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h3 className="text-lg font-semibold text-text-primary mb-2">No Analysis Data</h3>
            <p className="text-sm text-text-secondary mb-4">
              Run type analysis to see a comprehensive breakdown of this model.
            </p>
            <Button
              onClick={() => runAnalysis.mutate(model.id)}
              disabled={runAnalysis.isPending}
            >
              {runAnalysis.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" /> Run Analysis</>
              )}
            </Button>
            {runAnalysis.isError && (
              <p className="text-xs text-red-400 mt-2">
                {(runAnalysis.error as Error).message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AnalysisDashboard analysis={analysis} model={model} />;
}

// ─── Analysis Dashboard Layout ──────────────────────────────────────────────

type OverlayType = 'quality' | 'storeys' | 'elements' | 'geometry' | 'viewer' | null;

type DrillSource =
  | { type: 'quality' }
  | { type: 'types' }
  | { type: 'instances' }
  | { type: 'storeys'; storeyName?: string }
  | { type: 'treemap'; ifcClass: string }
  | { type: 'geometry'; representation: string }
  | null;

function buildDrillTabs(source: DrillSource, analysis: ModelAnalysis, stats: AnalysisStats): { title: string; subtitle?: string; tabs: DrillTab[] } | null {
  if (!source) return null;

  const typeCol = { key: 'type_name', label: 'Type', sortable: true };
  const classCol = { key: 'ifc_class', label: 'IFC Class', sortable: true };
  const countCol = { key: 'instance_count', label: 'Instances', align: 'right' as const, sortable: true };

  switch (source.type) {
    case 'quality': {
      const rows = analysis.types
        .filter(t => t.is_proxy || t.is_external_unset > 0 || t.loadbearing_unset > 0 || t.fire_rating_unset > 0)
        .map(t => ({
          type_name: t.type_class.replace('Type', ''),
          ifc_class: t.element_class || t.type_class,
          instance_count: t.instance_count,
          proxy: t.is_proxy ? 'Yes' : '',
          ext_unset: t.is_external_unset,
          lb_unset: t.loadbearing_unset,
          fr_unset: t.fire_rating_unset,
        }));
      return {
        title: 'Quality Issues',
        subtitle: `${rows.length} types with issues`,
        tabs: [{
          id: 'issues', label: 'Types with issues', count: rows.length,
          columns: [
            typeCol, classCol, countCol,
            { key: 'proxy', label: 'Proxy', align: 'center' },
            { key: 'ext_unset', label: 'ExtUnset', align: 'right' },
            { key: 'lb_unset', label: 'LBUnset', align: 'right' },
            { key: 'fr_unset', label: 'FRUnset', align: 'right' },
          ],
          data: rows,
        }],
      };
    }
    case 'types': {
      const rows = analysis.types.map(t => ({
        type_name: t.type_class.replace('Type', ''),
        ifc_class: t.element_class || t.type_class,
        instance_count: t.instance_count,
        empty: t.is_empty ? 'Yes' : '',
        proxy: t.is_proxy ? 'Yes' : '',
        untyped: t.is_untyped ? 'Yes' : '',
      }));
      return {
        title: 'Types',
        subtitle: `${analysis.total_types} types, ${stats.totalInstances.toLocaleString()} instances`,
        tabs: [{
          id: 'all', label: 'All types', count: rows.length,
          columns: [
            typeCol, classCol, countCol,
            { key: 'empty', label: 'Empty', align: 'center' },
            { key: 'proxy', label: 'Proxy', align: 'center' },
            { key: 'untyped', label: 'Untyped', align: 'center' },
          ],
          data: rows,
        }],
      };
    }
    case 'instances': {
      const byClass: Record<string, number> = {};
      for (const t of analysis.types) {
        const cls = t.element_class || t.type_class;
        byClass[cls] = (byClass[cls] || 0) + t.instance_count;
      }
      const rows = Object.entries(byClass)
        .map(([ifc_class, instance_count]) => ({ ifc_class, instance_count }))
        .sort((a, b) => b.instance_count - a.instance_count);
      return {
        title: 'Instances by IFC Class',
        subtitle: `${stats.totalInstances.toLocaleString()} total instances`,
        tabs: [{
          id: 'byclass', label: 'By class', count: rows.length,
          columns: [
            { key: 'ifc_class', label: 'IFC Class', sortable: true },
            { key: 'instance_count', label: 'Instances', align: 'right', sortable: true },
          ],
          data: rows,
        }],
      };
    }
    case 'storeys': {
      if (source.storeyName) {
        // Drill into a specific storey — show types on that storey
        const rows = analysis.types
          .filter(t => t.storey_distribution?.some(sd => sd.storey === source.storeyName))
          .map(t => {
            const sd = t.storey_distribution?.find(sd => sd.storey === source.storeyName);
            return {
              type_name: t.type_class.replace('Type', ''),
              ifc_class: t.element_class || t.type_class,
              instance_count: sd?.instance_count ?? 0,
            };
          })
          .sort((a, b) => b.instance_count - a.instance_count);
        return {
          title: source.storeyName,
          subtitle: `${rows.length} types on this storey`,
          tabs: [{ id: 'types', label: 'Types', count: rows.length, columns: [typeCol, classCol, countCol], data: rows }],
        };
      }
      // All storeys overview
      const rows = analysis.storeys.map(s => ({
        name: s.name,
        elevation: s.elevation != null ? `${s.elevation.toFixed(1)} m` : '—',
        element_count: s.element_count,
      }));
      return {
        title: 'Storeys',
        subtitle: `${analysis.total_storeys} storeys`,
        tabs: [{
          id: 'storeys', label: 'All storeys', count: rows.length,
          columns: [
            { key: 'name', label: 'Storey', sortable: true },
            { key: 'elevation', label: 'Elevation', align: 'right', sortable: true },
            { key: 'element_count', label: 'Elements', align: 'right', sortable: true },
          ],
          data: rows,
        }],
      };
    }
    case 'treemap': {
      const cls = source.ifcClass;
      const matchingTypes = analysis.types.filter(t => {
        const typeLabel = (t.element_class || t.type_class.replace('Type', '')).replace('Ifc', '');
        return typeLabel === cls;
      });
      const rows = matchingTypes.map(t => ({
        type_name: t.type_class.replace('Type', ''),
        ifc_class: t.element_class || t.type_class,
        instance_count: t.instance_count,
      }));
      const total = rows.reduce((s, r) => s + (r.instance_count as number), 0);
      return {
        title: cls,
        subtitle: `${rows.length} types, ${total.toLocaleString()} instances`,
        tabs: [{ id: 'types', label: 'Types', count: rows.length, columns: [typeCol, classCol, countCol], data: rows }],
      };
    }
    case 'geometry': {
      const rep = source.representation;
      const matchingTypes = analysis.types.filter(t => t.primary_representation === rep && t.instance_count > 0);
      const rows = matchingTypes.map(t => ({
        type_name: t.type_class.replace('Type', ''),
        ifc_class: t.element_class || t.type_class,
        instance_count: t.instance_count,
      }));
      const total = rows.reduce((s, r) => s + (r.instance_count as number), 0);
      return {
        title: rep,
        subtitle: `${rows.length} types, ${total.toLocaleString()} instances`,
        tabs: [{ id: 'types', label: 'Types', count: rows.length, columns: [typeCol, classCol, countCol], data: rows }],
      };
    }
  }
}

function AnalysisDashboard({ analysis, model }: { analysis: ModelAnalysis; model: Model }) {
  const { t } = useTranslation();
  const { data: storeyVerification } = useModelStoreyVerification(model.id);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | 'footprint'>('3d');
  const [drillSource, setDrillSource] = useState<DrillSource>(null);
  // Track C lift: locally-scoped "details rail" target. When set, the
  // right-hand rail next to the viewer shows the type's metadata. This
  // is intentionally separate from the shared ProjectFilter store —
  // hovering/picking a type to inspect should NOT mutate the page-level
  // class filter on its own (the user can still click a treemap tile to
  // both filter AND inspect, but the rail can also be cleared independently).
  const [selectedTypeIfcClass, setSelectedTypeIfcClass] = useState<string | null>(null);
  const hasFile = !!model.file_url;

  // Cross-filter state lives in the shared project-scoped store
  // (`ProjectFilterProvider`). The embedded `<UnifiedBIMViewer>` is
  // fed derived `floorCodeFilter`/`typeVisibility` props matching the
  // FederatedViewer wiring (PR 1.2). Click handlers on charts/tiles
  // dispatch through `useProjectFilterActions` so the viewer reacts
  // identically to actions taken anywhere else in the app. The "N
  // filters / Clear" chip row is rendered by the outer ModelWorkspace
  // in the tabs subheader so it doesn't push content down.
  const filter = useProjectFilter();
  const { setFloorCode, setIfcClass } = useProjectFilterActions();

  // One-shot post-hydrate URL filter validation. A `?d=...` payload that
  // outlived the data it referenced (storey renamed, model re-extracted,
  // class disappeared) would otherwise hide every row and surface as an
  // unexplained empty page or an amber `<FilteredEmptyBanner>` over the
  // dashboard. Build the universe directly from the analysis payload
  // using the same value derivation `filterAnalysisTypes` consumes, then
  // drop any dimension whose entire selection misses.
  const filterUniverse = useMemo(() => {
    const ifcClasses = new Set<string>();
    const floorCodes = new Set<string>();
    for (const t of analysis.types) {
      ifcClasses.add(t.element_class || t.type_class);
      for (const sd of t.storey_distribution ?? []) {
        if (sd.storey) floorCodes.add(sd.storey);
      }
    }
    for (const s of analysis.storeys ?? []) {
      if (s.name) floorCodes.add(s.name);
    }
    return {
      ifc_class: ifcClasses,
      excluded_ifc_class: ifcClasses,
      floor_code: floorCodes,
    };
  }, [analysis.types, analysis.storeys]);
  useProjectFilterValidate(filterUniverse);

  // Cross-filter recompute (PowerBI signature). The dashboard tiles must
  // animate when the user clicks a treemap tile / storey bar / quality
  // chip — anywhere that mutates the shared filter store. We compute two
  // stats objects: `totalStats` is the unfiltered project totals (drives
  // sparkline distributions so the macro vocabulary stays consistent);
  // `filteredStats` is the cross-filtered subset (drives the foreground
  // scalars + KPI cluster + Quality + Geometry). Mirrors the Types-page
  // pattern at warehouse-v2/TypeBrowserV2.tsx:152-175.
  const filteredTypes = useMemo(
    () => filterAnalysisTypes(analysis.types, filter),
    [analysis.types, filter.ifc_class, filter.excluded_ifc_class, filter.floor_code, filter.type_guid]
  );
  // Source-of-filter rule (PowerBI pattern): a surface that PRODUCES a
  // filter dimension must stay whole on its own dimension — only the
  // OTHER surfaces narrow. Build per-producer slices that omit the
  // producer's own dimension, so the Elements treemap (produces
  // `ifc_class`) doesn't collapse to one tile on its own click, and the
  // Storeys chart (produces `floor_code`) doesn't shrink to the active
  // storey's bar.
  const classUnfilteredTypes = useMemo(
    () =>
      filterAnalysisTypes(analysis.types, {
        ifc_class: undefined,
        excluded_ifc_class: filter.excluded_ifc_class,
        floor_code: filter.floor_code,
        type_guid: filter.type_guid,
      }),
    [analysis.types, filter.excluded_ifc_class, filter.floor_code, filter.type_guid]
  );
  const storeyUnfilteredTypes = useMemo(
    () =>
      filterAnalysisTypes(analysis.types, {
        ifc_class: filter.ifc_class,
        excluded_ifc_class: filter.excluded_ifc_class,
        floor_code: undefined,
        type_guid: filter.type_guid,
      }),
    [analysis.types, filter.ifc_class, filter.excluded_ifc_class, filter.type_guid]
  );
  const totalStats = useMemo(() => computeAnalysisStats(analysis.types), [analysis.types]);
  const filteredStats = useMemo(() => computeAnalysisStats(filteredTypes), [filteredTypes]);
  // Stats used as the page's "live" object — filtered scalars/classCounts
  // for the foreground, but the unfiltered classCounts feed the
  // `classColorMap` so colors stay stable across filter changes.
  const stats = filteredStats;

  // The viewer's `floorCodeFilter` is matched against discovered IFC
  // storey names directly; ModelWorkspace operates on a single model
  // so canonical-floor aliasing is unnecessary here.
  const viewerStoreyFilter = filter.floor_code?.[0] ?? null;

  // Derive type-visibility from inclusion + exclusion facets. The
  // shared store uses raw `Ifc`-prefixed class names (e.g. `IfcWall`)
  // and so does the backend's `element_class` field — so the
  // classCounts keys are already prefixed. Don't prepend a second
  // `Ifc` (that produced `IfcIfcWall` keys which never matched the
  // viewer's typeInfo, silently dropping the type filter). Pull from
  // `totalStats` so the universe stays the same across filter changes
  // — otherwise an active inclusion would shrink the set and
  // mis-derive exclusion overlap.
  const allIfcClasses = useMemo(
    () => Object.keys(totalStats.classCounts),
    [totalStats.classCounts],
  );
  const viewerTypeVisibility = useMemo(() => {
    const included = filter.ifc_class;
    const excluded = filter.excluded_ifc_class;
    // No filter active → undefined so the viewer shows all.
    if ((!included || included.length === 0) && (!excluded || excluded.length === 0)) {
      return undefined;
    }
    return deriveTypeVisibility(allIfcClasses, included, excluded);
  }, [allIfcClasses, filter.ifc_class, filter.excluded_ifc_class]);

  const drillConfig = useMemo(() => buildDrillTabs(drillSource, analysis, stats), [drillSource, analysis, stats]);

  // Cross-filter handlers — primary click on charts/tiles. PowerBI
  // pattern: page reflects the click; clicking the same tile a second
  // time toggles the dimension off; modal escape lives behind the
  // Table2 icon (`onViewData`).
  const filterByStorey = (storeyName: string | null) => {
    if (!storeyName) {
      setFloorCode(undefined);
      return;
    }
    const active = filter.floor_code;
    const isOnly = active?.length === 1 && active[0] === storeyName;
    setFloorCode(isOnly ? undefined : [storeyName]);
  };
  const filterByIfcClass = (cls: string) => {
    // Tile labels arrive without the `Ifc` prefix; the store uses the
    // prefixed form to match the viewer's `typeVisibility` keys.
    const prefixed = 'Ifc' + cls;
    const active = filter.ifc_class;
    const isOnly = active?.length === 1 && active[0] === prefixed;
    if (isOnly) {
      setIfcClass(undefined);
      setSelectedTypeIfcClass(null);
      return;
    }
    setIfcClass([prefixed]);
    // Track C lift: clicking a treemap tile also targets the details
    // rail at the most-frequent type in that class. Stored without the
    // `Ifc` prefix to match the treemap's label key.
    setSelectedTypeIfcClass(cls);
  };
  const filterByQuality = () => {
    // "Show only problem types" → include the IFC classes that have
    // any quality issue. Resolves to `Ifc`-prefixed names already.
    const problem = new Set<string>();
    for (const t of analysis.types) {
      const hasIssue =
        t.is_proxy ||
        t.is_external_unset > 0 ||
        t.loadbearing_unset > 0 ||
        t.fire_rating_unset > 0;
      if (hasIssue) {
        problem.add(t.element_class || t.type_class);
      }
    }
    setIfcClass(problem.size > 0 ? Array.from(problem) : undefined);
  };
  const filterByGeometry = (representation: string) => {
    // Include all IFC classes whose primary representation matches.
    const classes = new Set<string>();
    for (const t of analysis.types) {
      if (t.primary_representation === representation && t.instance_count > 0) {
        classes.add(t.element_class || t.type_class);
      }
    }
    if (classes.size === 0) {
      setIfcClass(undefined);
      return;
    }
    const next = Array.from(classes).sort();
    const active = (filter.ifc_class ?? []).slice().sort();
    const isSame =
      active.length === next.length && active.every((c, i) => c === next[i]);
    setIfcClass(isSame ? undefined : next);
  };

  const closeDrill = () => {
    setDrillSource(null);
  };

  // Build class → color map matching treemap ordering (sorted by instance count desc).
  // Always derived from the unfiltered universe so colors stay stable across
  // cross-filter changes; otherwise the slot ordering shifts when a class
  // drops out of the filtered subset and the legend stops matching the bar.
  //
  // Index both the prefixed form (matches viewer typeInfo + the filter
  // store) AND the stripped form (matches Treemap tile labels which run
  // `.replace('Ifc', '')`). Backend's `element_class` is already prefixed,
  // so map[cls] is "IfcWall" and the strip variant is "Wall".
  const classColorMap = useMemo(() => {
    const sorted = Object.entries(totalStats.classCounts).sort((a, b) => b[1] - a[1]);
    const map: Record<string, string> = {};
    sorted.forEach(([cls, _], i) => {
      const color = TREEMAP_COLORS[i % TREEMAP_COLORS.length];
      map[cls] = color;                              // "IfcWall" (prefixed)
      map[cls.replace(/^Ifc/, '')] = color;          // "Wall" (treemap label key)
    });
    return map;
  }, [totalStats.classCounts]);

  // Track C lift: pick the most-instance-heavy type in the active class
  // as the details-rail target. Falls back to the first matching record.
  const selectedTypeRecord = useMemo<AnalysisTypeRecord | null>(() => {
    if (!selectedTypeIfcClass) return null;
    const matching = analysis.types.filter((tp) => {
      const cls = (tp.element_class || tp.type_class.replace(/Type$/, '')).replace(
        /^Ifc/,
        ''
      );
      return cls === selectedTypeIfcClass;
    });
    if (matching.length === 0) return null;
    return matching.reduce((best, cur) =>
      cur.instance_count > best.instance_count ? cur : best
    );
  }, [selectedTypeIfcClass, analysis.types]);

  // Cross-reference the analysis-payload type to its IFCType row so we
  // can surface the mapping pill + edit affordances (save / flag / ignore
  // / notes / copy GUID). Match on (ifc_type === type_class) +
  // type_name. When no match is found the rail falls back to the
  // analysis-only read view.
  const { data: modelTypes = [] } = useModelTypes(model.id, { enabled: !!model.id });
  const matchedIfcType = useMemo<IFCType | null>(() => {
    if (!selectedTypeRecord) return null;
    return (
      modelTypes.find(
        (tp) =>
          tp.ifc_type === selectedTypeRecord.type_class &&
          tp.type_name === (selectedTypeRecord.type_name ?? '')
      ) ?? null
    );
  }, [modelTypes, selectedTypeRecord]);

  const toast = useToast();
  const updateMapping = useUpdateTypeMapping();
  const createMapping = useCreateTypeMapping();

  const setMappingStatus = useCallback(
    async (
      type: IFCType,
      status: 'mapped' | 'followup' | 'ignored',
      toastKey: string,
    ) => {
      try {
        if (type.mapping?.id) {
          await updateMapping.mutateAsync({
            mappingId: type.mapping.id,
            mapping_status: status,
          });
        } else {
          await createMapping.mutateAsync({
            ifc_type: type.id,
            mapping_status: status,
          });
        }
        toast.toast({ title: t(toastKey) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.toast({
          title: t('modelDash.rail.shortcuts.saveError'),
          description: message,
          variant: 'destructive',
        });
      }
    },
    [updateMapping, createMapping, toast, t],
  );

  const handleSaveType = useCallback(
    (type: IFCType) => setMappingStatus(type, 'mapped', 'modelDash.rail.shortcuts.saved'),
    [setMappingStatus],
  );
  const handleFlagType = useCallback(
    (type: IFCType) => setMappingStatus(type, 'followup', 'modelDash.rail.shortcuts.flagged'),
    [setMappingStatus],
  );
  const handleIgnoreType = useCallback(
    (type: IFCType) => setMappingStatus(type, 'ignored', 'modelDash.rail.shortcuts.ignored'),
    [setMappingStatus],
  );
  const handleCopyGuid = useCallback(
    (type: IFCType) => {
      if (!type.type_guid || type.type_guid.startsWith('synth_')) return;
      navigator.clipboard.writeText(type.type_guid).then(
        () => toast.toast({ title: t('modelDash.rail.action.copyGuidSuccess') }),
        () => undefined,
      );
    },
    [toast, t],
  );
  const handleSaveNotes = useCallback(
    async (type: IFCType, notes: string) => {
      if (!type.mapping?.id) return;
      try {
        await updateMapping.mutateAsync({ mappingId: type.mapping.id, notes });
        toast.toast({ title: t('modelDash.rail.notes.saved') });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.toast({
          title: t('modelDash.rail.shortcuts.saveError'),
          description: message,
          variant: 'destructive',
        });
      }
    },
    [updateMapping, toast, t],
  );

  // Keyboard handler — A/F/I act on the currently matched IFCType.
  // Input/textarea/contenteditable guard mirrors TypeBrowserV2.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'a' && key !== 'f' && key !== 'i') return;
      if (!matchedIfcType) return;
      e.preventDefault();
      if (key === 'a') handleSaveType(matchedIfcType);
      else if (key === 'f') handleFlagType(matchedIfcType);
      else if (key === 'i') handleIgnoreType(matchedIfcType);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchedIfcType, handleSaveType, handleFlagType, handleIgnoreType]);

  return (
    <>
      <div className="p-[clamp(0.75rem,1.5vw,1rem)] w-full flex flex-col gap-[clamp(0.4rem,0.8vw,0.75rem)]">
        <FilteredEmptyBanner
          filteredCount={filteredTypes.length}
          totalCount={analysis.types.length}
          noun={t('modelDash.filteredEmpty.noun')}
        />
        {/* Row 0 — KPI cluster (Dion-lens rework). 7 type-and-quality tiles:
            Types · Classified · With material · Untyped · Reuse · Proxy+Userdef ·
            Orphan. Element count is volume (lives in Elements card below);
            context (schema/CRS/authoring tool) lives in the Metadata tab. */}
        <AnalysisKpiCluster
          analysis={analysis}
          filteredTypes={filteredTypes}
          storeyVerification={storeyVerification}
          classColorMap={classColorMap}
        />

        <div className="grid grid-cols-6 gap-[clamp(0.3rem,0.6vw,0.5rem)]">
          {/* Row 1: Storeys + Treemap (left) | Viewer + Details Rail (right) */}
          <div className="col-span-3 flex flex-col gap-[clamp(0.3rem,0.6vw,0.5rem)]">
            <Card className="overflow-hidden card-accent-forest min-h-[clamp(180px,22vh,260px)] flex-1">
              <CardContent className="p-3 h-full overflow-y-auto">
                <CardHeader
                  title="Storeys"
                  onExpand={() => setOverlay('storeys')}
                  onViewData={() => setDrillSource({ type: 'storeys' })}
                />
                <VerifiedStoreyChart
                  storeys={analysis.storeys}
                  verification={storeyVerification}
                  filteredTypes={storeyUnfilteredTypes}
                  activeStorey={viewerStoreyFilter}
                  onBarClick={filterByStorey}
                />
              </CardContent>
            </Card>
            <Card className="overflow-hidden card-accent-forest min-h-[clamp(360px,44vh,540px)] flex-1">
              <CardContent className="p-3 h-full flex flex-col">
                <CardHeader
                  title="Elements"
                  onExpand={() => setOverlay('elements')}
                  onViewData={() => setDrillSource({ type: 'instances' })}
                />
                <div className="flex-1 relative">
                  <Treemap
                    types={classUnfilteredTypes}
                    classColorMap={classColorMap}
                    activeIfcClass={
                      filter.ifc_class && filter.ifc_class.length === 1
                        ? filter.ifc_class[0].replace(/^Ifc/, '')
                        : null
                    }
                    onTileClick={filterByIfcClass}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="col-span-3 flex min-h-[clamp(360px,44vh,560px)]">
            {hasFile ? (
              <ViewerPane
                id="model-dash-viewer"
                className="card-accent-forest flex-1 min-w-0"
                title={t('modelDash.viewer.title')}
                icon={
                  <Box className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] text-muted-foreground" />
                }
                headerActions={
                  <>
                    {analysis.spatial_data?.bounding_box && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setViewerMode((v) => (v === '3d' ? 'footprint' : '3d'))
                        }
                        title={
                          viewerMode === '3d'
                            ? t('modelDash.viewer.showFootprint')
                            : t('modelDash.viewer.show3d')
                        }
                        className="h-[clamp(1rem,1.5vw,1.5rem)] gap-1 px-1.5 text-[clamp(0.55rem,0.7vw,0.75rem)]"
                      >
                        {viewerMode === '3d' ? (
                          <Grid3x3 className="h-3 w-3" />
                        ) : (
                          <Box className="h-3 w-3" />
                        )}
                        {viewerMode === '3d' ? '2D' : '3D'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOverlay('viewer')}
                      title={t('modelDash.viewer.fullscreen')}
                      aria-label={t('modelDash.viewer.fullscreen')}
                      className="h-[clamp(1rem,1.5vw,1.5rem)] w-[clamp(1rem,1.5vw,1.5rem)] p-0"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </Button>
                  </>
                }
                rail={
                  <AnalysisDetailsRail
                    selectedType={selectedTypeRecord}
                    classColor={
                      selectedTypeIfcClass
                        ? classColorMap[selectedTypeIfcClass]
                        : undefined
                    }
                    onClose={() => setSelectedTypeIfcClass(null)}
                    ifcType={matchedIfcType}
                    onSave={handleSaveType}
                    onFlag={handleFlagType}
                    onIgnore={handleIgnoreType}
                    onCopyGuid={handleCopyGuid}
                    onSaveNotes={handleSaveNotes}
                  />
                }
              >
                {viewerMode === '3d' ? (
                  <UnifiedBIMViewer
                    modelId={model.id}
                    showPropertiesPanel={false}
                    classColorMap={classColorMap}
                    floorCodeFilter={viewerStoreyFilter}
                    typeVisibility={viewerTypeVisibility}
                    onSelectionChange={(el) => {
                      // Bidirectional cross-filter: viewer click drives the
                      // ifc_class dimension. Same toggle-off semantics as the
                      // dashboard tiles — clicking the same class twice clears.
                      // Null/Unknown selections (e.g. clicking empty space)
                      // intentionally do NOT clear the filter — the user
                      // clears via the dashboard or the Clear-all button.
                      if (!el || !el.type || el.type === 'Unknown') return;
                      const cls = el.type.replace(/^IFC/i, '');
                      if (!cls) return;
                      filterByIfcClass(cls);
                    }}
                  />
                ) : (
                  <FootprintView
                    spatialData={analysis.spatial_data}
                    classColorMap={classColorMap}
                    units={analysis.units}
                  />
                )}
              </ViewerPane>
            ) : (
              <Card className="overflow-hidden flex flex-col card-accent-forest h-full">
                <CardContent className="p-3 flex-1 flex items-center justify-center">
                  <span className="text-text-tertiary text-sm">No IFC file</span>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Row 2: Quality | Reuse | Geometry — three cards, each
              col-span-2 of the parent grid-cols-6. Reuse moved down from
              the top KPI row; Geometry switched from a stacked horizontal
              bar to a standing (vertical) bar chart so it reads as its
              own visual rather than another stripe. */}
          <div className="col-span-2">
            <QualityCard
              analysis={analysis}
              types={filteredTypes}
              stats={stats}
              onExpand={() => setOverlay('quality')}
              onClick={filterByQuality}
              onViewData={() => setDrillSource({ type: 'quality' })}
            />
          </div>
          <div className="col-span-2">
            <ReuseCard types={filteredTypes} />
          </div>
          <div className="col-span-2">
            <Card className="overflow-hidden card-accent-forest h-full">
              <CardContent className="p-3 flex flex-col h-full">
                <CardHeader
                  title="Geometry"
                  onExpand={() => setOverlay('geometry')}
                  onViewData={() => {
                    const reps = new Map<string, number>();
                    for (const t of analysis.types) {
                      if (t.primary_representation && t.instance_count > 0) {
                        reps.set(t.primary_representation, (reps.get(t.primary_representation) ?? 0) + t.instance_count);
                      }
                    }
                    const sorted = [...reps.entries()].sort((a, b) => b[1] - a[1]);
                    if (sorted.length > 0) {
                      setDrillSource({ type: 'geometry', representation: sorted[0][0] });
                    }
                  }}
                />
                <div className="flex-1 min-h-0">
                  <GeometryBarVertical
                    types={filteredTypes}
                    onSegmentClick={filterByGeometry}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Expand overlays */}
      <DashboardOverlay open={overlay === 'quality'} onClose={() => setOverlay(null)} title="Quality Checks">
        <QualityOverlayContent analysis={analysis} stats={stats} />
      </DashboardOverlay>
      <DashboardOverlay open={overlay === 'storeys'} onClose={() => setOverlay(null)} title={`Storeys (${analysis.total_storeys})`}>
        <VerifiedStoreyChart storeys={analysis.storeys} verification={storeyVerification} filteredTypes={filteredTypes} />
      </DashboardOverlay>
      <DashboardOverlay open={overlay === 'elements'} onClose={() => setOverlay(null)} title="Element Distribution">
        <div className="relative h-[400px]">
          <Treemap types={filteredTypes} classColorMap={classColorMap} />
        </div>
      </DashboardOverlay>
      <DashboardOverlay open={overlay === 'geometry'} onClose={() => setOverlay(null)} title="Geometry">
        <GeometryBar types={filteredTypes} />
      </DashboardOverlay>
      {hasFile && (
        <DashboardOverlay open={overlay === 'viewer'} onClose={() => { setOverlay(null); setSelectedElement(null); }} title="3D Viewer" fullscreen>
          <ViewerPane
            id="model-dash-viewer-fullscreen"
            rail={
              <IFCPropertiesPanel
                element={selectedElement}
                onClose={() => setSelectedElement(null)}
                className="h-full"
              />
            }
            railClassName="w-80 shrink-0 border-l border-border bg-background overflow-hidden"
          >
            <UnifiedBIMViewer
              modelId={model.id}
              showPropertiesPanel={false}
              classColorMap={classColorMap}
              onSelectionChange={(element) => setSelectedElement(element)}
            />
          </ViewerPane>
        </DashboardOverlay>
      )}

      {/* Drill modal */}
      {drillConfig && (
        <DrillModal
          open={drillSource !== null}
          onOpenChange={(open) => { if (!open) closeDrill(); }}
          title={drillConfig.title}
          subtitle={drillConfig.subtitle}
          tabs={drillConfig.tabs}
          exportFilename={model.name ?? 'model'}
        />
      )}
    </>
  );
}

// ─── Stats computation ──────────────────────────────────────────────────────

interface AnalysisStats {
  totalInstances: number;
  typeRatio: number;
  emptyTypes: number;
  untypedCount: number;
  proxyCount: number;
  missingIsExternal: number;
  missingLoadBearing: number;
  missingFireRating: number;
  classCounts: Record<string, number>;
  repCounts: Record<string, number>;
}

function computeAnalysisStats(types: AnalysisTypeRecord[]): AnalysisStats {
  let totalInstances = 0, emptyTypes = 0, untypedCount = 0, proxyCount = 0;
  let missingIsExternal = 0, missingLoadBearing = 0, missingFireRating = 0;
  const classCounts: Record<string, number> = {};
  const repCounts: Record<string, number> = {};

  for (const t of types) {
    totalInstances += t.instance_count;
    if (t.is_empty) emptyTypes++;
    if (t.is_untyped) untypedCount += t.instance_count;
    if (t.is_proxy) proxyCount += t.instance_count;
    missingIsExternal += t.is_external_unset;
    missingLoadBearing += t.loadbearing_unset;
    missingFireRating += t.fire_rating_unset;

    const cls = t.element_class || t.type_class.replace('Type', '');
    classCounts[cls] = (classCounts[cls] || 0) + t.instance_count;

    if (t.primary_representation && t.instance_count > 0) {
      repCounts[t.primary_representation] = (repCounts[t.primary_representation] || 0) + t.instance_count;
    }
  }

  const totalTypes = types.length;
  const typeRatio = totalTypes > 0 ? Math.round(totalInstances / totalTypes) : 0;

  return { totalInstances, typeRatio, emptyTypes, untypedCount, proxyCount, missingIsExternal, missingLoadBearing, missingFireRating, classCounts, repCounts };
}

/**
 * Intersect the analysis type rows against the project filter store.
 * Empty/undefined dimension means "no filter for that axis". Mirrors
 * `filterTypesV2` in the Type-page browser — same multi-dim AND semantics.
 *
 * NOTE: `type_guid` is NOT present on `AnalysisTypeRecord` (the analysis
 * payload pre-dates the Layer-2 GUID bridge). When `filter.type_guid` is
 * set we conservatively keep all rows so the user doesn't see "0 types"
 * — viewer-side selection drives the focused view in that case.
 */
function filterAnalysisTypes(
  types: AnalysisTypeRecord[],
  filter: Pick<FilterContext, 'ifc_class' | 'excluded_ifc_class' | 'floor_code' | 'type_guid'>
): AnalysisTypeRecord[] {
  const includedClasses = filter.ifc_class;
  const excludedClasses = filter.excluded_ifc_class;
  const floorCodes = filter.floor_code;
  const hasInclude = includedClasses && includedClasses.length > 0;
  const hasExclude = excludedClasses && excludedClasses.length > 0;
  const hasFloor = floorCodes && floorCodes.length > 0;
  if (!hasInclude && !hasExclude && !hasFloor) return types;

  return types.filter((t) => {
    // Match against both forms the store uses — raw (e.g. "IfcWall") and
    // the AnalysisTypeRecord shape (`element_class`/`type_class`).
    const elementClass = t.element_class || t.type_class;
    if (hasInclude && !includedClasses!.includes(elementClass)) return false;
    if (hasExclude && excludedClasses!.includes(elementClass)) return false;
    if (hasFloor) {
      // Match by storey GUID OR storey name — `storey_distribution[].storey`
      // carries the name; the filter store carries GUIDs when fragments-v3
      // provides them, else names (see VerifiedStoreyChart filterKey).
      const dist = t.storey_distribution ?? [];
      const matches = dist.some((sd) => floorCodes!.includes(sd.storey));
      if (!matches) return false;
    }
    return true;
  });
}

// ─── KPI Card — removed Track C lift ─────────────────────────────────────
// The old local `<KpiCard>` was replaced by `<AnalysisKpiCluster>` which
// uses DashboardTile + useCountUp + Sparkline per the v2 visual bar.

// ─── Quality Checks Card ────────────────────────────────────────────────────

function QualityCard({
  analysis,
  types,
  stats,
  onExpand,
  onClick,
  onViewData,
}: {
  analysis: ModelAnalysis;
  /** Cross-filtered slice. Drives every count rendered in this card. */
  types: AnalysisTypeRecord[];
  stats: AnalysisStats;
  onExpand?: () => void;
  onClick?: () => void;
  onViewData?: () => void;
}) {
  // Count distinct types affected per check — gives a type-level view alongside
  // the instance-level counts. Cross-filtered subset so the card animates
  // when the user clicks any other tile.
  const typesWithProxy = types.filter((t) => t.is_proxy).length;
  const typesWithExtUnset = types.filter((t) => t.is_external_unset > 0).length;
  const typesWithLbUnset = types.filter((t) => t.loadbearing_unset > 0).length;
  const typesWithFrUnset = types.filter((t) => t.fire_rating_unset > 0).length;

  // `duplicate_guid_count` is a model-level scalar (not per-type), so it
  // stays on the unfiltered analysis. Every other count comes from `stats`
  // which already reflects the cross-filtered subset.
  const checks = [
    { label: 'Duplicate GUIDs', instances: analysis.duplicate_guid_count, types: null as number | null, ok: analysis.duplicate_guid_count === 0 },
    { label: 'Proxy-typed', instances: stats.proxyCount, types: typesWithProxy, ok: stats.proxyCount === 0 },
    { label: 'IsExternal unset', instances: stats.missingIsExternal, types: typesWithExtUnset, ok: stats.missingIsExternal === 0 },
    { label: 'LoadBearing unset', instances: stats.missingLoadBearing, types: typesWithLbUnset, ok: stats.missingLoadBearing === 0 },
    { label: 'FireRating unset', instances: stats.missingFireRating, types: typesWithFrUnset, ok: stats.missingFireRating === 0 },
  ];

  const totalIssueTypes = new Set(
    types
      .filter((t) =>
        t.is_proxy ||
        t.is_external_unset > 0 ||
        t.loadbearing_unset > 0 ||
        t.fire_rating_unset > 0
      )
      .map((t) => t.type_class)
  ).size;
  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.ok).length;
  const animatedIssueTypes = useCountUp(totalIssueTypes);

  // Body click cross-filters the page (PowerBI pattern); the Table2
  // icon in the header is the secondary "view raw issues table" escape.
  const body = (
    <CardContent className="p-[clamp(0.5rem,1vw,0.75rem)] flex-1 min-h-0 flex flex-col gap-[clamp(0.3rem,0.5vw,0.4rem)]">
      <CardHeader title="Quality" onExpand={onExpand} onViewData={onViewData} />

      {/* Pass/fail summary badge row */}
      <div className="flex items-center gap-2">
        <span className={`text-[clamp(0.55rem,0.8vw,0.7rem)] font-semibold px-2 py-0.5 rounded-full ${
          passedChecks === totalChecks
            ? 'bg-forest/15 text-forest'
            : passedChecks === 0
            ? 'bg-red-500/15 text-red-400'
            : 'bg-amber-500/15 text-amber-500'
        }`}>
          {passedChecks}/{totalChecks} checks pass
        </span>
        {totalIssueTypes > 0 && (
          <span className="text-[clamp(0.5rem,0.7vw,0.6rem)] text-text-tertiary tabular-nums">
            {animatedIssueTypes.toLocaleString()} type{totalIssueTypes !== 1 ? 's' : ''} affected
          </span>
        )}
      </div>

      <div className="space-y-[clamp(0.2rem,0.4vw,0.3rem)] flex-1">
        {checks.map((c) => (
          <QualityCheckRow key={c.label} check={c} />
        ))}
      </div>
      <div className="mt-auto pt-[clamp(0.3rem,0.5vw,0.4rem)] border-t border-border text-[clamp(0.5rem,0.8vw,0.6rem)] text-text-tertiary">
        {analysis.ifc_schema} &middot; {analysis.application}
      </div>
    </CardContent>
  );

  if (onClick) {
    return (
      <DrillTarget
        ariaLabel="Filter to types with quality issues"
        onActivate={onClick}
        className="h-full"
      >
        <Card className="h-full flex flex-col card-accent-lime">
          {body}
        </Card>
      </DrillTarget>
    );
  }

  return (
    <Card className="h-full flex flex-col card-accent-lime">
      {body}
    </Card>
  );
}

// ─── Quality check row — animated per-check pill ───────────────────────────
// Split into its own component so we can call `useCountUp` per row without
// violating the rules of hooks (one hook per row inside a `.map` callback
// would otherwise break on row-count changes — they don't here, but the
// component split is the safer pattern and keeps each pill smoothly animating).

interface QualityCheck {
  label: string;
  instances: number;
  types: number | null;
  ok: boolean;
}

function QualityCheckRow({ check }: { check: QualityCheck }) {
  const animatedInstances = useCountUp(check.instances);
  const animatedTypes = useCountUp(check.types ?? 0);
  return (
    <div className="flex items-center justify-between gap-2 text-[clamp(0.55rem,1vw,0.7rem)]">
      <span className="text-text-secondary truncate">{check.label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {check.types !== null && !check.ok && (
          <span className="text-[clamp(0.45rem,0.65vw,0.6rem)] text-text-tertiary tabular-nums">
            {animatedTypes.toLocaleString()} {check.types === 1 ? 'type' : 'types'}
          </span>
        )}
        <span className={`font-semibold tabular-nums px-[clamp(0.3rem,0.6vw,0.5rem)] py-px rounded text-[clamp(0.5rem,0.9vw,0.65rem)] ${
          check.ok
            ? 'bg-forest/15 text-forest'
            : 'bg-red-500/15 text-red-400'
        }`}>
          {check.instances === 0 ? 'OK' : animatedInstances.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ─── Treemap ────────────────────────────────────────────────────────────────

const TREEMAP_COLORS = tokens.dataPalette.slots;

// treemapLayout imported from @/lib/treemap

function Treemap({ types, onTileClick, activeIfcClass, classColorMap }: { types: AnalysisTypeRecord[]; onTileClick?: (ifcClass: string) => void; activeIfcClass?: string | null; classColorMap?: Record<string, string> }) {
  const items = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of types) {
      if (t.instance_count === 0) continue;
      const cls = (t.element_class || t.type_class.replace('Type', '')).replace('Ifc', '');
      counts[cls] = (counts[cls] || 0) + t.instance_count;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [types]);

  if (!items.length) return <div className="text-text-tertiary text-xs">No data</div>;

  const W = 400, H = 220;
  const rects = treemapLayout(items, W, H);

  return (
    <div className="absolute inset-0">
      <div className="relative w-full h-full">
        {rects.map((r, i) => {
          const pctX = (r.x / W) * 100, pctY = (r.y / H) * 100;
          const pctW = (r.w / W) * 100, pctH = (r.h / H) * 100;
          // Color must be stable across filter changes — derive from the
          // project-wide classColorMap (built from totalStats) so a tile
          // keeps its identity when the user clicks it and the filtered
          // universe shrinks to just that class. Fall back to slot order
          // if the map isn't provided (drill overlay etc).
          const color = classColorMap?.[r.label] ?? TREEMAP_COLORS[i % TREEMAP_COLORS.length];
          const showLabel = pctW > 8 && pctH > 8;
          const isActive = activeIfcClass === r.label;
          const interactive = !!onTileClick;
          const tileStyle = {
            left: `${pctX}%`, top: `${pctY}%`,
            width: `${pctW}%`, height: `${pctH}%`,
            background: color, opacity: 0.85,
          };
          const tileClassName = 'absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center p-px';
          const tileContent = showLabel && (
            <>
              <span className="text-[clamp(0.45rem,0.8vw,0.6rem)] font-medium text-white/90 leading-tight truncate max-w-full px-0.5">
                {r.label}
              </span>
              <span className="text-[clamp(0.4rem,0.7vw,0.55rem)] text-white/70 tabular-nums">
                {r.value.toLocaleString()}
              </span>
            </>
          );
          if (!interactive) {
            return (
              <div
                key={r.label}
                className={tileClassName}
                style={tileStyle}
                title={`${r.label}: ${r.value.toLocaleString()}`}
              >
                {tileContent}
              </div>
            );
          }
          return (
            <DrillTarget
              key={r.label}
              active={isActive}
              ariaLabel={`Filter by ${r.label}`}
              title={`${r.label}: ${r.value.toLocaleString()}`}
              className={tileClassName}
              style={tileStyle}
              onActivate={() => onTileClick!(r.label)}
            >
              {tileContent}
            </DrillTarget>
          );
        })}
      </div>
    </div>
  );
}

// ─── Geometry Bar ──────────────────────────────────────────────────────────

const GEOM_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#94a3b8', '#64748b', '#475569', '#cbd5e1'];

function GeometryBar({ types, onSegmentClick }: { types: AnalysisTypeRecord[]; onSegmentClick?: (representation: string) => void }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of types) {
      if (!t.primary_representation || t.instance_count === 0) continue;
      counts[t.primary_representation] = (counts[t.primary_representation] || 0) + t.instance_count;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [types]);

  if (!data.length) return <div className="text-text-tertiary text-xs">No geometry data</div>;

  const total = data.reduce((s, [, v]) => s + v, 0);
  const interactive = !!onSegmentClick;

  return (
    <div>
      {/* Stacked bar — segments need inline width %. */}
      <div className="h-[clamp(0.6rem,1vw,0.8rem)] rounded-full overflow-hidden flex">
        {data.map(([label, value], i) => {
          const pct = (value / total) * 100;
          const segStyle = { width: `${pct}%`, background: GEOM_COLORS[i % GEOM_COLORS.length] };
          if (!interactive) {
            return (
              <div
                key={label}
                className="h-full"
                style={segStyle}
                title={`${label}: ${value.toLocaleString()} (${pct.toFixed(1)}%)`}
              />
            );
          }
          return (
            <DrillTarget
              key={label}
              ariaLabel={`Filter by ${label}: ${value.toLocaleString()} (${pct.toFixed(1)}%)`}
              title={`${label}: ${value.toLocaleString()} (${pct.toFixed(1)}%)`}
              className="h-full"
              style={segStyle}
              onActivate={() => onSegmentClick!(label)}
            >
              {null}
            </DrillTarget>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-[clamp(0.3rem,0.5vw,0.4rem)]">
        {data.map(([label, value], i) => (
          <GeometryBarLegendItem
            key={label}
            label={label}
            value={value}
            color={GEOM_COLORS[i % GEOM_COLORS.length]}
            onClick={interactive ? () => onSegmentClick!(label) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// Vertical (standing) variant — used in the bottom-row Geometry card.
// Bars grow upward; labels sit underneath at a slight rotation so the
// representation names ("SweptSolid", "Brep", etc.) fit without
// truncation in a half-width tile.
function GeometryBarVertical({
  types,
  onSegmentClick,
}: {
  types: AnalysisTypeRecord[];
  onSegmentClick?: (representation: string) => void;
}) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of types) {
      if (!t.primary_representation || t.instance_count === 0) continue;
      counts[t.primary_representation] =
        (counts[t.primary_representation] || 0) + t.instance_count;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [types]);

  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary text-xs">
        No geometry data
      </div>
    );
  }

  const max = data[0][1];
  const interactive = !!onSegmentClick;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 min-h-0 flex items-end gap-[clamp(0.2rem,0.6vw,0.5rem)] px-1">
        {data.map(([label, value], i) => {
          const heightPct = (value / max) * 100;
          const color = GEOM_COLORS[i % GEOM_COLORS.length];
          const tooltip = `${label}: ${value.toLocaleString()}`;
          const bar = (
            <div
              className="w-full rounded-t-sm transition-all"
              style={{ height: `${heightPct}%`, background: color }}
            />
          );
          return (
            <div
              key={label}
              className="flex-1 min-w-0 h-full flex flex-col items-center gap-1"
            >
              <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] tabular-nums text-text-secondary font-semibold">
                {value.toLocaleString()}
              </span>
              <div className="w-full flex-1 flex items-end">
                {interactive ? (
                  <DrillTarget
                    ariaLabel={`Filter by ${label}: ${value.toLocaleString()}`}
                    title={tooltip}
                    className="w-full h-full flex items-end"
                    onActivate={() => onSegmentClick!(label)}
                  >
                    {bar}
                  </DrillTarget>
                ) : (
                  <div className="w-full h-full flex items-end" title={tooltip}>
                    {bar}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[clamp(0.2rem,0.6vw,0.5rem)] px-1 mt-1">
        {data.map(([label], i) => (
          <div
            key={`label-${label}`}
            className="flex-1 min-w-0 flex items-start justify-center"
          >
            <span
              className="text-[clamp(0.5rem,0.65vw,0.65rem)] text-text-tertiary truncate w-full text-center"
              style={{ color: GEOM_COLORS[i % GEOM_COLORS.length] }}
              title={label}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReuseCard({ types }: { types: AnalysisTypeRecord[] }) {
  const { t } = useTranslation();
  const stats = useMemo(() => {
    let totalInstances = 0;
    let mappedInstances = 0;
    for (const tp of types) {
      totalInstances += tp.instance_count;
      if (typeof tp.mapped_item_count === 'number') {
        mappedInstances += tp.mapped_item_count;
      }
    }
    const reusePercent =
      totalInstances > 0 ? (mappedInstances / totalInstances) * 100 : 0;
    return { totalInstances, mappedInstances, reusePercent };
  }, [types]);
  const animated = useCountUp(stats.reusePercent, { fraction: true });
  const tone =
    stats.reusePercent >= 30
      ? 'good'
      : stats.reusePercent >= 10
        ? 'warning'
        : 'danger';
  const toneColor =
    tone === 'good'
      ? 'hsl(158 70% 28%)'
      : tone === 'warning'
        ? 'hsl(38 92% 50%)'
        : 'hsl(0 84% 60%)';

  return (
    <Card className="overflow-hidden card-accent-forest h-full">
      <CardContent className="p-3 flex flex-col h-full">
        <CardHeader title={t('modelDash.kpis.reuse')} />
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[clamp(1.5rem,3.2vw,2.75rem)] font-semibold tabular-nums tracking-tight leading-none"
              style={{ color: toneColor }}
            >
              {animated.toFixed(1)}
            </span>
            <span
              className="text-[clamp(0.9rem,1.2vw,1.1rem)] font-medium tabular-nums leading-none"
              style={{ color: toneColor }}
            >
              %
            </span>
          </div>
          <div className="text-[clamp(0.6rem,0.8vw,0.8rem)] text-text-tertiary tabular-nums">
            {t('modelDash.kpis.mappedRatioShort', {
              mapped: stats.mappedInstances.toLocaleString(),
              total: stats.totalInstances.toLocaleString(),
            })}
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(stats.reusePercent, 100)}%`,
                background: toneColor,
              }}
            />
          </div>
          <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-text-tertiary/80 leading-[1.45]">
            {t('modelDash.kpis.reuseHint')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function GeometryBarLegendItem({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}) {
  const animated = useCountUp(value);
  const swatch = (
    <>
      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary font-semibold tabular-nums">{animated.toLocaleString()}</span>
    </>
  );
  if (!onClick) {
    return (
      <div className="flex items-center gap-1 text-[clamp(0.45rem,0.7vw,0.55rem)]">
        {swatch}
      </div>
    );
  }
  return (
    <DrillTarget
      ariaLabel={`Filter by ${label}`}
      onActivate={onClick}
      className="flex items-center gap-1 text-[clamp(0.45rem,0.7vw,0.55rem)] hover:text-text-primary rounded px-1 -mx-1"
    >
      {swatch}
    </DrillTarget>
  );
}

// ─── Card Header with expand button ─────────────────────────────────────────

function CardHeader({
  title,
  onExpand,
  onViewData,
  viewDataLabel,
}: {
  title: string;
  onExpand?: () => void;
  onViewData?: () => void;
  viewDataLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-[clamp(0.25rem,0.5vw,0.4rem)]">
      <h3 className="text-[clamp(0.65rem,1.1vw,0.8rem)] font-semibold text-text-primary">
        {title}
      </h3>
      <div className="flex items-center gap-1">
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
        {onExpand && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium
                       bg-forest/15 border border-forest/30 text-lime
                       hover:bg-forest hover:text-white hover:border-forest transition-all"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Viewer Card Header with 3D/Footprint toggle ────────────────────────────

// ViewerCardHeader removed — controls are now floating overlays on the viewer

// ─── Footprint View (Canvas 2D) ─────────────────────────────────────────────

interface SpatialData {
  bounding_box: { min_x: number; max_x: number; min_y: number; max_y: number } | null;
  positions: Array<{ x: number; y: number; cls: string }>;
  origin: { x: number; y: number };
}

function FootprintView({ spatialData, classColorMap, units }: {
  spatialData: SpatialData | null;
  classColorMap: Record<string, string>;
  units: Record<string, unknown>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !spatialData?.bounding_box) return;

    // Size canvas to container
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor(rect.width * dpr);
    const H = Math.floor(rect.height * dpr);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const logicalW = rect.width;
    const logicalH = rect.height;

    const { bounding_box: bb, positions, origin } = spatialData;
    const padding = 48;

    const rangeX = bb.max_x - bb.min_x || 1;
    const rangeY = bb.max_y - bb.min_y || 1;
    const scale = Math.min((logicalW - 2 * padding) / rangeX, (logicalH - 2 * padding) / rangeY);

    // Center the drawing
    const drawW = rangeX * scale;
    const drawH = rangeY * scale;
    const offsetX = (logicalW - drawW) / 2;
    const offsetY = (logicalH - drawH) / 2;

    const toCanvas = (x: number, y: number) => ({
      cx: offsetX + (x - bb.min_x) * scale,
      cy: logicalH - offsetY - (y - bb.min_y) * scale,
    });

    // Determine unit conversion factor (model units → meters)
    let unitFactor = 0.001; // default: mm → m
    if (units && typeof units === 'object') {
      const lengthUnit = units['LENGTHUNIT'] as { symbol?: string } | undefined;
      if (lengthUnit?.symbol === 'm') unitFactor = 1;
      else if (lengthUnit?.symbol === 'cm') unitFactor = 0.01;
      else if (lengthUnit?.symbol === 'ft') unitFactor = 0.3048;
    }

    // Clear
    ctx.fillStyle = '#1a1f2e';
    ctx.fillRect(0, 0, logicalW, logicalH);

    // Draw bounding box
    const tl = toCanvas(bb.min_x, bb.max_y);
    const br = toCanvas(bb.max_x, bb.min_y);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(tl.cx, tl.cy, br.cx - tl.cx, br.cy - tl.cy);
    ctx.setLineDash([]);

    // Dimension labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const widthM = (rangeX * unitFactor).toFixed(1);
    const depthM = (rangeY * unitFactor).toFixed(1);
    ctx.fillText(`${widthM} m`, (tl.cx + br.cx) / 2, br.cy + 20);
    ctx.save();
    ctx.translate(tl.cx - 20, (tl.cy + br.cy) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`${depthM} m`, 0, 0);
    ctx.restore();

    // Origin crosshair
    const o = toCanvas(origin.x, origin.y);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.cx - 10, o.cy); ctx.lineTo(o.cx + 10, o.cy);
    ctx.moveTo(o.cx, o.cy - 10); ctx.lineTo(o.cx, o.cy + 10);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('origin', o.cx + 12, o.cy - 4);

    // Heatmap dots (colored by IFC class)
    ctx.globalAlpha = 0.35;
    for (const pos of positions) {
      const p = toCanvas(pos.x, pos.y);
      const color = classColorMap[pos.cls] || classColorMap[pos.cls.replace('Ifc', '')] || '#94a3b8';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // N arrow (top-right)
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', logicalW - 20, 20);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(logicalW - 20, 24);
    ctx.lineTo(logicalW - 20, 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(logicalW - 23, 28);
    ctx.lineTo(logicalW - 20, 24);
    ctx.lineTo(logicalW - 17, 28);
    ctx.stroke();

  }, [spatialData, classColorMap, units]);

  if (!spatialData?.bounding_box) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1f2e]">
        <span className="text-text-tertiary text-xs">No spatial data — re-run analysis</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// ─── Dashboard Overlay ──────────────────────────────────────────────────────

function DashboardOverlay({ open, onClose, title, children, fullscreen }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  fullscreen?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className={`bg-surface border border-border border-t-2 border-t-forest rounded-xl
                      flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-200
                      ${fullscreen ? 'w-[96vw] h-[92vh]' : 'w-[min(90vw,900px)] max-h-[85vh]'}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-lime">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={`flex-1 min-h-0 ${fullscreen ? '' : 'overflow-y-auto p-5'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Quality Overlay Content ────────────────────────────────────────────────

function QualityOverlayContent({ analysis, stats }: { analysis: ModelAnalysis; stats: AnalysisStats }) {
  const checks = [
    { label: 'Duplicate GUIDs', value: analysis.duplicate_guid_count, ok: analysis.duplicate_guid_count === 0 },
    { label: 'IsExternal unset', value: stats.missingIsExternal, ok: stats.missingIsExternal === 0 },
    { label: 'LoadBearing unset', value: stats.missingLoadBearing, ok: stats.missingLoadBearing === 0 },
    { label: 'FireRating unset', value: stats.missingFireRating, ok: stats.missingFireRating === 0 },
    { label: 'Empty types', value: stats.emptyTypes, ok: stats.emptyTypes === 0 },
    { label: 'Untyped instances', value: stats.untypedCount, ok: stats.untypedCount === 0 },
    { label: 'Proxy-typed instances', value: stats.proxyCount, ok: stats.proxyCount === 0 },
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs text-text-tertiary mb-3">
        {analysis.ifc_schema} &middot; {analysis.application}
      </div>
      {checks.map((c) => (
        <div key={c.label} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <span className="text-sm text-text-secondary">{c.label}</span>
          <span className={`font-semibold tabular-nums px-3 py-1 rounded text-sm ${
            c.ok
              ? 'bg-forest/15 text-forest'
              : 'bg-red-500/15 text-red-400'
          }`}>
            {c.value === 0 ? 'OK' : c.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}


// Processing Message Component
function ProcessingMessage({ status, error }: { status: Model['status']; error?: string | null }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center">
          <ModelStatusBadge status={status} className="mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Processing Model
          </h3>
          <p className="text-text-secondary mb-4">
            {status === 'processing' && 'Extracting metadata and geometry. This tab will update when ready.'}
            {status === 'uploading' && 'Uploading file...'}
            {status === 'error' && `Processing failed: ${error}`}
          </p>
          <p className="text-xs text-text-tertiary">
            You can view the model in the <strong>Web-IFC Viewer</strong> tab while processing continues in the background.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Metadata Tab ───────────────────────────────────────────────────────────

const MODEL_DISCIPLINES = [
  { code: 'ARK', label: 'Architecture', color: '#3B82F6' },
  { code: 'RIB', label: 'Structural', color: '#EF4444' },
  { code: 'RIBp', label: 'Structural Prefab', color: '#F87171', parent: 'RIB' },
  { code: 'RIG', label: 'Geotechnical', color: '#A855F7' },
  { code: 'RIV', label: 'HVAC', color: '#22C55E' },
  { code: 'RIVv', label: 'Ventilation', color: '#4ADE80', parent: 'RIV' },
  { code: 'RIVp', label: 'Plumbing', color: '#2DD4BF', parent: 'RIV' },
  { code: 'RIVspr', label: 'Sprinkler', color: '#FB923C', parent: 'RIV' },
  { code: 'RIkulde', label: 'Cooling', color: '#38BDF8', parent: 'RIV' },
  { code: 'RIvarme', label: 'Heating', color: '#F97316', parent: 'RIV' },
  { code: 'RIE', label: 'Electrical', color: '#F59E0B' },
  { code: 'LARK', label: 'Landscape', color: '#10B981' },
] as const;

const ADVISORY_ROLES = [
  { code: 'RIA', label: 'Acoustics', color: '#8B5CF6' },
  { code: 'RIBr', label: 'Fire Safety', color: '#DC2626' },
  { code: 'RIByfy', label: 'Building Physics', color: '#6366F1' },
  { code: 'RIM', label: 'Environmental', color: '#84CC16' },
  { code: 'BIM-K', label: 'BIM Coordinator', color: '#06B6D4' },
  { code: 'BIM-M', label: 'BIM Manager', color: '#0891B2' },
  { code: 'PGL', label: 'Design Manager', color: '#64748B' },
  { code: 'PM', label: 'Project Manager', color: '#475569' },
  { code: 'BH', label: 'Owner/Client', color: '#334155' },
] as const;

function MetadataTab({ model }: { model: Model }) {
  return (
    <div className="p-[clamp(1rem,2vw,1.5rem)] space-y-[clamp(0.5rem,1vw,0.75rem)]">
      <div className="grid grid-cols-2 gap-[clamp(0.5rem,1vw,0.75rem)]">
        {/* Platform Info */}
        <Card className="card-accent-lavender">
          <CardContent className="p-[clamp(0.75rem,1.5vw,1.25rem)]">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Model Info</h3>
            <div className="space-y-2">
              {([
                ['Name', model.name],
                ['Version', `v${model.version_number}`],
                ['Status', model.status],
                ['Elements', model.element_count.toLocaleString()],
                ['Storeys', String(model.storey_count)],
                ['File', model.original_filename || '—'],
                ['Uploaded', model.created_at ? new Date(model.created_at).toLocaleString() : '—'],
                ['Last Modified', model.updated_at ? new Date(model.updated_at).toLocaleString() : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-text-secondary">{label}</span>
                  <span className="text-text-primary font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Discipline Assignment */}
        <Card className="card-accent-forest">
          <CardContent className="p-[clamp(0.75rem,1.5vw,1.25rem)]">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Discipline</h3>
            <p className="text-xs text-text-secondary mb-3">
              Assign this model to a discipline for filtering, validation rules, and project weighting.
            </p>

            <h4 className="text-xs font-medium text-text-secondary mb-2">Model Disciplines</h4>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {MODEL_DISCIPLINES.map((d) => (
                <button
                  key={d.code}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm text-left transition-colors
                    ${model.discipline === d.code
                      ? 'border-forest bg-forest/15 text-text-primary'
                      : 'border-border text-text-secondary hover:border-forest hover:text-text-primary'}
                    ${'parent' in d ? 'pl-6' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs font-mono text-text-tertiary w-14">{d.code}</span>
                  <span className="text-xs">{d.label}</span>
                </button>
              ))}
            </div>

            <h4 className="text-xs font-medium text-text-secondary mb-2">Advisory Roles</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {ADVISORY_ROLES.map((d) => (
                <button
                  key={d.code}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm text-left transition-colors
                    ${model.discipline === d.code
                      ? 'border-forest bg-forest/15 text-text-primary'
                      : 'border-border text-text-secondary hover:border-forest hover:text-text-primary'}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs font-mono text-text-tertiary w-14">{d.code}</span>
                  <span className="text-xs">{d.label}</span>
                </button>
              ))}
            </div>

            <p className="text-xs text-text-tertiary mt-3">
              Discipline assignment coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Stubbed-tab empty states moved to ComingSoonTile.tsx in
// components/features/model-workspace/. Validation / Scripts / History
// now use the same DashboardTile wrapper for visual consistency.
