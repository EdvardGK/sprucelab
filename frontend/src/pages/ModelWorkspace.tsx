import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Loader2, Maximize2, X, Box, Grid3x3 } from 'lucide-react';
import { useModel } from '@/hooks/use-models';
import { useModelAnalysis, useRunAnalysis } from '@/hooks/use-model-analysis';
import { Button } from '@/components/ui/button';
import { ModelStatusBadge } from '@/components/ModelStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QTODashboard } from '@/components/features/qto/QTODashboard';
import { MMIDashboard } from '@/components/features/mmi/MMIDashboard';
import { UnifiedBIMViewer } from '@/components/features/viewer/UnifiedBIMViewer';
import { ElementPropertiesPanel, ElementProperties } from '@/components/features/viewer/ElementPropertiesPanel';
import { AppLayout } from '@/components/Layout/AppLayout';
import type { Model, ModelAnalysis, AnalysisTypeRecord, AnalysisStorey } from '@/lib/api-types';
import { treemapLayout } from '@/lib/treemap';
import { DrillModal, type DrillTab } from '@/components/features/drill/DrillModal';

// Tab definitions
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'validation', label: 'Validation' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'history', label: 'History' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ModelWorkspace() {
  const { modelId } = useParams<{ id: string; modelId: string }>();
  const navigate = useNavigate();
  // const location = useLocation();
  const { data: model, isLoading } = useModel(modelId!);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
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
                <ModelStatusBadge status={model.status} />
              </div>
            </div>

            {/* Quick Stats */}
            {isReady && (
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-text-secondary">Elements:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {model.element_count.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-text-secondary">Storeys:</span>{' '}
                  <span className="text-text-primary font-medium">{model.storey_count}</span>
                </div>
                {model.system_count > 0 && (
                  <div>
                    <span className="text-text-secondary">Systems:</span>{' '}
                    <span className="text-text-primary font-medium">{model.system_count}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Tabs Navigation */}
        <div className="border-b border-border bg-background-elevated flex-shrink-0">
          <nav className="flex px-6 space-x-1 overflow-x-auto">
            {TABS.map((tab) => (
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
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'overview' && (isReady ? <OverviewTab model={model} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'validation' && (isReady ? <PlaceholderTab title="Validation" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'metadata' && <MetadataTab model={model} />}
          {activeTab === 'scripts' && (isReady ? <PlaceholderTab title="Scripts" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
          {activeTab === 'history' && (isReady ? <PlaceholderTab title="History" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Overview Tab ─── Analysis dashboard ───────────────────────────────────

const OVERVIEW_SUBTABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'qto', label: 'QTO' },
  { id: 'mmi', label: 'MMI' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'properties', label: 'Properties' },
] as const;

type OverviewSubTab = typeof OVERVIEW_SUBTABS[number]['id'];

function OverviewTab({ model }: { model: Model }) {
  const { data: analysis, isLoading } = useModelAnalysis(model.id);
  const runAnalysis = useRunAnalysis();
  const [subTab, setSubTab] = useState<OverviewSubTab>('dashboard');

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

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="border-b border-border/50 bg-background px-[clamp(1rem,2vw,1.5rem)]">
        <nav className="flex space-x-1">
          {OVERVIEW_SUBTABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`
                px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap
                border-b-2 -mb-px
                ${subTab === tab.id
                  ? 'text-text-primary border-lime'
                  : 'text-text-tertiary border-transparent hover:text-text-secondary'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Sub-tab content */}
      {subTab === 'dashboard' && <AnalysisDashboard analysis={analysis} model={model} />}
      {subTab === 'qto' && <QTODashboard modelId={model.id} />}
      {subTab === 'mmi' && <MMIDashboard modelId={model.id} />}
      {subTab === 'statistics' && <PlaceholderTab title="Statistics" />}
      {subTab === 'properties' && <PlaceholderTab title="Properties" />}
    </div>
  );
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
  const stats = useMemo(() => computeAnalysisStats(analysis), [analysis]);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);
  const [viewerMode, setViewerMode] = useState<'3d' | 'footprint'>('3d');
  const [drillSource, setDrillSource] = useState<DrillSource>(null);
  const hasFile = !!model.file_url;

  const drillConfig = useMemo(() => buildDrillTabs(drillSource, analysis, stats), [drillSource, analysis, stats]);

  // Build class → color map matching treemap ordering (sorted by instance count desc)
  const classColorMap = useMemo(() => {
    const sorted = Object.entries(stats.classCounts).sort((a, b) => b[1] - a[1]);
    const map: Record<string, string> = {};
    sorted.forEach(([cls, _], i) => {
      const color = TREEMAP_COLORS[i % TREEMAP_COLORS.length];
      map[cls] = color;           // "Wall" (treemap key, Ifc prefix stripped)
      map['Ifc' + cls] = color;   // "IfcWall" (viewer typeInfo key)
    });
    return map;
  }, [stats.classCounts]);

  return (
    <>
      <div className="p-[clamp(0.75rem,1.5vw,1rem)] w-full min-h-full">
        <div className="grid grid-cols-6 gap-[clamp(0.3rem,0.6vw,0.5rem)] min-h-full grid-rows-[auto_1fr]">
          {/* Row 1: Quality (2 cols) + KPIs (1 col each) */}
          <div className="col-span-2">
            <QualityCard analysis={analysis} stats={stats} onExpand={() => setOverlay('quality')} onClick={() => setDrillSource({ type: 'quality' })} />
          </div>
          <KpiCard value={analysis.total_types} label="Types" subValue={stats.emptyTypes} subLabel="empty" warn={stats.emptyTypes > 0} accent onClick={() => setDrillSource({ type: 'types' })} />
          <KpiCard value={stats.totalInstances} label="Instances" subValue={stats.untypedCount} subLabel="untyped" warn={stats.untypedCount > 0} ratio={`${stats.typeRatio}:1`} onClick={() => setDrillSource({ type: 'instances' })} />
          <KpiCard value={analysis.total_storeys} label="Storeys" subValue="—" subLabel="BEP compliance" onClick={() => setDrillSource({ type: 'storeys' })} />
          <KpiCard value={analysis.total_spaces} label="Spaces" subValue="—" subLabel="m²" />

          {/* Row 2: Charts stacked (left) | Viewer (right) */}
          <div className="col-span-3 flex flex-col gap-[clamp(0.3rem,0.6vw,0.5rem)] min-h-0">
            <Card className="overflow-hidden flex flex-col card-accent-forest flex-1 min-h-0">
              <CardContent className="p-3 min-h-0 overflow-y-auto">
                <CardHeader title="Storeys" onExpand={() => setOverlay('storeys')} />
                <StoreyChart storeys={analysis.storeys} onBarClick={(name) => setDrillSource({ type: 'storeys', storeyName: name })} />
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-[clamp(0.3rem,0.6vw,0.5rem)] flex-1 min-h-0">
              <Card className="overflow-hidden flex flex-col card-accent-forest">
                <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                  <CardHeader title="Elements" onExpand={() => setOverlay('elements')} />
                  <div className="flex-1 min-h-0 relative">
                    <Treemap types={analysis.types} onTileClick={(cls) => setDrillSource({ type: 'treemap', ifcClass: cls })} />
                  </div>
                </CardContent>
              </Card>
              <Card className="overflow-hidden flex flex-col card-accent-forest">
                <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                  <CardHeader title="Geometry" onExpand={() => setOverlay('geometry')} />
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <GeometryDonut types={analysis.types} onSliceClick={(rep) => setDrillSource({ type: 'geometry', representation: rep })} />
                  </div>
                </CardContent>
              </Card>
            </div>
            <ModelInfoCard analysis={analysis} />
          </div>
          <div className="col-span-3 flex flex-col min-h-0">
            {hasFile ? (
              <Card className="overflow-hidden flex flex-col card-accent-forest flex-1 min-h-0">
                <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                  <ViewerCardHeader
                    mode={viewerMode}
                    onToggle={() => setViewerMode(v => v === '3d' ? 'footprint' : '3d')}
                    onExpand={() => setOverlay('viewer')}
                    hasSpatialData={!!analysis.spatial_data?.bounding_box}
                  />
                  <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-black/20">
                    {viewerMode === '3d' ? (
                      <UnifiedBIMViewer
                        modelId={model.id}
                        showPropertiesPanel={false}
                        classColorMap={classColorMap}
                      />
                    ) : (
                      <FootprintView
                        spatialData={analysis.spatial_data}
                        classColorMap={classColorMap}
                        units={analysis.units}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden flex flex-col card-accent-forest flex-1 min-h-0">
                <CardContent className="p-3 flex-1 flex items-center justify-center">
                  <span className="text-text-tertiary text-sm">No IFC file</span>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Expand overlays */}
      <DashboardOverlay open={overlay === 'quality'} onClose={() => setOverlay(null)} title="Quality Checks">
        <QualityOverlayContent analysis={analysis} stats={stats} />
      </DashboardOverlay>
      <DashboardOverlay open={overlay === 'storeys'} onClose={() => setOverlay(null)} title={`Storeys (${analysis.total_storeys})`}>
        <StoreyChart storeys={analysis.storeys} />
      </DashboardOverlay>
      <DashboardOverlay open={overlay === 'elements'} onClose={() => setOverlay(null)} title="Element Distribution">
        <div className="relative h-[400px]">
          <Treemap types={analysis.types} />
        </div>
      </DashboardOverlay>
      <DashboardOverlay open={overlay === 'geometry'} onClose={() => setOverlay(null)} title="Geometry">
        <GeometryDonut types={analysis.types} />
      </DashboardOverlay>
      {hasFile && (
        <DashboardOverlay open={overlay === 'viewer'} onClose={() => { setOverlay(null); setSelectedElement(null); }} title="3D Viewer" fullscreen>
          <div className="flex h-full">
            <div className="flex-1 relative">
              <UnifiedBIMViewer
                modelId={model.id}
                showPropertiesPanel={false}
                classColorMap={classColorMap}
                onSelectionChange={(element) => setSelectedElement(element)}
              />
            </div>
            <aside className="w-80 border-l border-border bg-background overflow-hidden flex-shrink-0">
              <ElementPropertiesPanel
                element={selectedElement}
                onClose={() => setSelectedElement(null)}
              />
            </aside>
          </div>
        </DashboardOverlay>
      )}

      {/* Drill modal */}
      {drillConfig && (
        <DrillModal
          open={drillSource !== null}
          onOpenChange={(open) => { if (!open) setDrillSource(null); }}
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

function computeAnalysisStats(analysis: ModelAnalysis): AnalysisStats {
  let totalInstances = 0, emptyTypes = 0, untypedCount = 0, proxyCount = 0;
  let missingIsExternal = 0, missingLoadBearing = 0, missingFireRating = 0;
  const classCounts: Record<string, number> = {};
  const repCounts: Record<string, number> = {};

  for (const t of analysis.types) {
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

  const typeRatio = analysis.total_types > 0 ? Math.round(totalInstances / analysis.total_types) : 0;

  return { totalInstances, typeRatio, emptyTypes, untypedCount, proxyCount, missingIsExternal, missingLoadBearing, missingFireRating, classCounts, repCounts };
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ value, label, subValue, subLabel, accent, warn, ratio, onClick }: {
  value: number | string; label: string; subValue?: number | string; subLabel?: string; accent?: boolean; warn?: boolean;
  ratio?: string; onClick?: () => void;
}) {
  const displayValue = typeof value === 'number' ? value.toLocaleString() : value;
  const displaySubValue = typeof subValue === 'number' ? subValue.toLocaleString() : (subValue ?? '');
  return (
    <Card className={`h-full ${accent ? 'bg-forest text-white' : ''} ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all' : ''}`} onClick={onClick}>
      <CardContent className="p-3 flex flex-col justify-between h-full">
        <div className={`text-[clamp(0.55rem,0.9vw,0.7rem)] font-semibold uppercase tracking-wide ${accent ? 'text-white/70' : 'text-text-tertiary'}`}>
          {label}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className={`text-[clamp(1.5rem,4vw,2.25rem)] font-bold tabular-nums leading-none ${accent ? 'text-white' : 'text-text-primary'}`}>
            {displayValue}
          </div>
          {ratio && (
            <div className={`text-[clamp(0.5rem,0.8vw,0.6rem)] tabular-nums mt-1 ${accent ? 'text-white/50' : 'text-text-tertiary'}`}>
              {ratio} per type
            </div>
          )}
        </div>
        {subLabel != null && (
          <div className={`pt-2 border-t flex items-center justify-between text-[clamp(0.55rem,1vw,0.7rem)] ${accent ? 'border-white/20' : 'border-border'}`}>
            <span className={accent ? 'text-white/70' : 'text-text-secondary'}>{subLabel}</span>
            <span className={`font-semibold tabular-nums ${warn ? (accent ? 'text-yellow-300' : 'text-warning') : (accent ? 'text-white' : 'text-forest')}`}>
              {displaySubValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quality Checks Card ────────────────────────────────────────────────────

function QualityCard({ analysis, stats, onExpand, onClick }: { analysis: ModelAnalysis; stats: AnalysisStats; onExpand?: () => void; onClick?: () => void }) {
  const checks = [
    { label: 'Duplicate GUIDs', value: analysis.duplicate_guid_count, ok: analysis.duplicate_guid_count === 0 },
    { label: 'Proxy-typed', value: stats.proxyCount, ok: stats.proxyCount === 0 },
    { label: 'IsExternal unset', value: stats.missingIsExternal, ok: stats.missingIsExternal === 0 },
    { label: 'LoadBearing unset', value: stats.missingLoadBearing, ok: stats.missingLoadBearing === 0 },
    { label: 'FireRating unset', value: stats.missingFireRating, ok: stats.missingFireRating === 0 },
  ];

  return (
    <Card className={`h-full flex flex-col card-accent-lime ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all' : ''}`} onClick={onClick}>
      <CardContent className="p-[clamp(0.5rem,1vw,0.75rem)] flex-1 min-h-0 flex flex-col">
        <CardHeader title="Quality" onExpand={onExpand} />
        <div className="space-y-[clamp(0.2rem,0.4vw,0.3rem)] flex-1">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-[clamp(0.55rem,1vw,0.7rem)]">
              <span className="text-text-secondary">{c.label}</span>
              <span className={`font-semibold tabular-nums px-[clamp(0.3rem,0.6vw,0.5rem)] py-px rounded text-[clamp(0.5rem,0.9vw,0.65rem)] ${
                c.ok
                  ? 'bg-forest/15 text-forest'
                  : 'bg-red-500/15 text-red-400'
              }`}>
                {c.value === 0 ? 'OK' : c.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-[clamp(0.3rem,0.5vw,0.4rem)] border-t border-border text-[clamp(0.5rem,0.8vw,0.6rem)] text-text-tertiary">
          {analysis.ifc_schema} &middot; {analysis.application}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Storey Chart ───────────────────────────────────────────────────────────

function StoreyChart({ storeys, onBarClick }: { storeys: AnalysisStorey[]; onBarClick?: (storeyName: string) => void }) {
  if (!storeys.length) return <div className="text-text-tertiary text-xs">No storeys</div>;

  const sorted = [...storeys].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  const maxCount = Math.max(...sorted.map(s => s.element_count), 1);

  return (
    <div className="space-y-[clamp(0.1rem,0.3vw,0.2rem)]">
      {sorted.map((s) => (
        <div key={s.name}
             className={`grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.5rem,0.9vw,0.65rem)] ${onBarClick ? 'cursor-pointer hover:bg-white/5 rounded transition-colors' : ''}`}
             style={{ gridTemplateColumns: 'minmax(0, 5rem) auto 1fr auto' }}
             onClick={onBarClick ? () => onBarClick(s.name) : undefined}>
          <span className="text-text-secondary truncate" title={s.name}>{s.name}</span>
          <span className="text-text-tertiary tabular-nums w-[3.5em] text-right">
            {s.elevation != null ? `${s.elevation.toFixed(1)}m` : '—'}
          </span>
          <div className="h-[clamp(0.7rem,1.2vw,1rem)] bg-white/5 rounded overflow-hidden">
            <div
              className="h-full rounded bg-gradient-to-r from-navy to-forest transition-all"
              style={{ width: `${(s.element_count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-text-primary tabular-nums font-medium w-[3em] text-right">
            {s.element_count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Treemap ────────────────────────────────────────────────────────────────

const TREEMAP_COLORS = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0', // palette + green
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa', // extended
  '#34d399', '#fbbf24',
];

// treemapLayout imported from @/lib/treemap

function Treemap({ types, onTileClick }: { types: AnalysisTypeRecord[]; onTileClick?: (ifcClass: string) => void }) {
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
          const color = TREEMAP_COLORS[i % TREEMAP_COLORS.length];
          const showLabel = pctW > 8 && pctH > 8;
          return (
            <div
              key={r.label}
              className={`absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center p-px ${onTileClick ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
              style={{
                left: `${pctX}%`, top: `${pctY}%`,
                width: `${pctW}%`, height: `${pctH}%`,
                background: color, opacity: 0.85,
              }}
              title={`${r.label}: ${r.value.toLocaleString()}`}
              onClick={onTileClick ? () => onTileClick(r.label) : undefined}
            >
              {showLabel && (
                <>
                  <span className="text-[clamp(0.45rem,0.8vw,0.6rem)] font-medium text-white/90 leading-tight truncate max-w-full px-0.5">
                    {r.label}
                  </span>
                  <span className="text-[clamp(0.4rem,0.7vw,0.55rem)] text-white/70 tabular-nums">
                    {r.value.toLocaleString()}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Geometry Donut ─────────────────────────────────────────────────────────

const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#94a3b8', '#64748b', '#475569', '#cbd5e1'];

function GeometryDonut({ types, onSliceClick }: { types: AnalysisTypeRecord[]; onSliceClick?: (representation: string) => void }) {
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
  const size = 130;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2, ir = r * 0.55;

  let angle = -Math.PI / 2;
  const paths: JSX.Element[] = [];

  for (let i = 0; i < data.length; i++) {
    const [label, value] = data[i];
    const sweep = (value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep);
    const ix1 = cx + ir * Math.cos(angle + sweep), iy1 = cy + ir * Math.sin(angle + sweep);
    const ix2 = cx + ir * Math.cos(angle), iy2 = cy + ir * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;

    paths.push(
      <path
        key={label}
        d={`M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix1},${iy1} A${ir},${ir} 0 ${large} 0 ${ix2},${iy2} Z`}
        fill={DONUT_COLORS[i % DONUT_COLORS.length]}
        opacity={0.85}
        className={onSliceClick ? 'cursor-pointer hover:opacity-100 transition-opacity' : ''}
        onClick={onSliceClick ? () => onSliceClick(label) : undefined}
      >
        <title>{`${label}: ${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`}</title>
      </path>
    );
    angle += sweep;
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full max-w-full max-h-full">
      {paths}
    </svg>
  );
}

// ─── Model Info Card (combined Context / Units / Coordinates) ────────────────

function ModelInfoCard({ analysis }: { analysis: ModelAnalysis }) {
  const unitRows: [string, string][] = analysis.units && typeof analysis.units === 'object'
    ? Object.entries(analysis.units as Record<string, unknown>).map(([k, v]) => {
        if (v && typeof v === 'object' && 'symbol' in (v as Record<string, unknown>)) {
          return [k, (v as { symbol?: string }).symbol || '?'];
        }
        return [k, String(v ?? '—')];
      })
    : [];

  const coordRows: [string, string][] = [];
  if (analysis.coordinates && typeof analysis.coordinates === 'object') {
    const c = analysis.coordinates as Record<string, unknown>;
    if (c.crs) coordRows.push(['CRS', String(c.crs)]);
    if (c.true_north) coordRows.push(['True N', `${(c.true_north as { angle_deg?: number }).angle_deg ?? 0}°`]);
    if (c.wcs_origin) {
      const o = c.wcs_origin as { x?: number; y?: number; z?: number };
      coordRows.push(['WCS', `${o.x ?? 0}, ${o.y ?? 0}, ${o.z ?? 0}`]);
    }
  }

  const sections = [
    { title: 'Context', rows: [
      ['Project', analysis.project_name || '—'],
      ['Building', analysis.building_name || '—'],
      ['App', analysis.application || '—'],
      ['Schema', analysis.ifc_schema || '—'],
    ] as [string, string][] },
    { title: 'Units', rows: unitRows.length ? unitRows : [['—', 'N/A']] as [string, string][] },
    { title: 'Coords', rows: coordRows.length ? coordRows : [['—', 'N/A']] as [string, string][] },
  ];

  return (
    <Card className="card-accent-lavender">
      <CardContent className="px-3 py-2">
        <div className="grid grid-cols-3 gap-x-3">
          {sections.map((s) => (
            <div key={s.title}>
              <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-0.5">{s.title}</h4>
              {s.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between text-[0.7rem] leading-snug">
                  <span className="text-text-tertiary">{label}</span>
                  <span className="text-text-secondary font-medium truncate ml-1">{value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Card Header with expand button ─────────────────────────────────────────

function CardHeader({ title, onExpand }: { title: string; onExpand?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-[clamp(0.25rem,0.5vw,0.4rem)]">
      <h3 className="text-[clamp(0.65rem,1.1vw,0.8rem)] font-semibold text-text-primary">
        {title}
      </h3>
      {onExpand && (
        <button
          onClick={onExpand}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium
                     bg-forest/15 border border-forest/30 text-lime
                     hover:bg-forest hover:text-white hover:border-forest transition-all"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── Viewer Card Header with 3D/Footprint toggle ────────────────────────────

function ViewerCardHeader({ mode, onToggle, onExpand, hasSpatialData }: {
  mode: '3d' | 'footprint';
  onToggle: () => void;
  onExpand: () => void;
  hasSpatialData: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-[clamp(0.25rem,0.5vw,0.4rem)]">
      <h3 className="text-[clamp(0.65rem,1.1vw,0.8rem)] font-semibold text-text-primary">
        {mode === '3d' ? '3D Viewer' : 'Footprint'}
      </h3>
      <div className="flex items-center gap-1">
        {hasSpatialData && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium
                       bg-forest/15 border border-forest/30 text-lime
                       hover:bg-forest hover:text-white hover:border-forest transition-all"
            title={mode === '3d' ? 'Show footprint' : 'Show 3D'}
          >
            {mode === '3d' ? <Grid3x3 className="h-3 w-3" /> : <Box className="h-3 w-3" />}
          </button>
        )}
        <button
          onClick={onExpand}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium
                     bg-forest/15 border border-forest/30 text-lime
                     hover:bg-forest hover:text-white hover:border-forest transition-all"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

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

// Placeholder Tab Component
function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center">
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {title} - Coming Soon
          </h3>
          <p className="text-text-secondary">
            This feature is under development and will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
