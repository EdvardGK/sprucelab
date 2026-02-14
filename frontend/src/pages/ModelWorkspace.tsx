import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Loader2, Maximize2, X } from 'lucide-react';
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
import type { Model, ModelAnalysis, AnalysisTypeRecord, AnalysisStorey } from '@/lib/api-types';

// Tab definitions
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'qto', label: 'QTO' },
  { id: 'mmi', label: 'MMI' },
  { id: 'validation', label: 'Validation' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'properties', label: 'Properties' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'history', label: 'History' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ModelWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // const location = useLocation();
  const { data: model, isLoading } = useModel(id!);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Get preparsed scene from navigation state (if uploaded)
  // const preparsedScene = (location.state as any)?.preparsedScene as THREE.Group | undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex h-screen items-center justify-center">
          <div className="text-text-secondary">Loading model...</div>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex h-screen items-center justify-center">
          <div className="text-error">Model not found</div>
        </div>
      </div>
    );
  }

  // Viewer available immediately if file uploaded (doesn't need processing)
  const hasFile = !!model.file_url;

  // Other tabs need processing to complete
  const isReady = model.status === 'ready';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-gradient-header bg-background-elevated px-6 py-4">
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
      <div className="border-b border-border bg-background-elevated">
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
      <div className="bg-background">
        {/* All tabs - show content or processing message */}
        {activeTab === 'overview' && (isReady ? <OverviewTab model={model} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'qto' && (isReady ? <QTODashboard modelId={model.id} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'mmi' && (isReady ? <MMIDashboard modelId={model.id} /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'validation' && (isReady ? <PlaceholderTab title="Validation" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'statistics' && (isReady ? <PlaceholderTab title="Statistics" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'properties' && (isReady ? <PlaceholderTab title="Properties" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'scripts' && (isReady ? <PlaceholderTab title="Scripts" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'metadata' && (isReady ? <PlaceholderTab title="Metadata" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
        {activeTab === 'history' && (isReady ? <PlaceholderTab title="History" /> : <ProcessingMessage status={model.status} error={model.processing_error} />)}
      </div>
    </div>
  );
}

// ─── Overview Tab ─── Analysis dashboard ───────────────────────────────────

function OverviewTab({ model }: { model: Model }) {
  const { data: analysis, isLoading } = useModelAnalysis(model.id);
  const runAnalysis = useRunAnalysis();

  if (isLoading) {
    return (
      <div className="h-full p-[clamp(0.5rem,2vw,1.5rem)] grid grid-cols-5 grid-rows-[auto_1fr_1fr_auto] gap-[clamp(0.5rem,1vw,0.75rem)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center">
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

function AnalysisDashboard({ analysis, model }: { analysis: ModelAnalysis; model: Model }) {
  const stats = useMemo(() => computeAnalysisStats(analysis), [analysis]);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);
  const hasFile = !!model.file_url;

  return (
    <>
      <div className="p-[clamp(1rem,2vw,1.5rem)] max-w-[1440px] mx-auto w-full space-y-[clamp(0.5rem,1vw,0.75rem)]">
        {/* Row 1: Quality + KPIs */}
        <div className="grid grid-cols-5 gap-[clamp(0.5rem,1vw,0.75rem)]">
          {/* Quality checks card (spans 2 rows via nested flex) */}
          <div className="row-span-2 flex flex-col">
            <QualityCard analysis={analysis} stats={stats} onExpand={() => setOverlay('quality')} />
          </div>
          {/* KPI cards */}
          <KpiCard value={analysis.total_types} label="Types" accent />
          <KpiCard value={analysis.total_products} label="Products" />
          <KpiCard value={analysis.total_storeys} label="Storeys" />
          <KpiCard value={analysis.total_spaces} label="Spaces" />
        </div>

        {/* Row 2: Sub-KPIs */}
        <div className="grid grid-cols-5 gap-[clamp(0.5rem,1vw,0.75rem)]">
          <div /> {/* spacer for quality card column */}
          <SubKpiCard value={stats.emptyTypes} label="Empty Types" warn={stats.emptyTypes > 0} />
          <SubKpiCard value={stats.untypedCount} label="Untyped" warn={stats.untypedCount > 0} />
          <SubKpiCard value={stats.proxyCount} label="Proxy-typed" warn={stats.proxyCount > 0} />
          <SubKpiCard value={analysis.duplicate_guid_count} label="Duplicate GUIDs" warn={analysis.duplicate_guid_count > 0} />
        </div>

        {/* Row 3: Storeys bar chart */}
        <Card className="overflow-hidden flex flex-col card-accent-forest min-h-[180px]">
          <CardContent className="p-[clamp(0.75rem,1.5vw,1.25rem)] flex-1 min-h-0 overflow-y-auto">
            <CardHeader title="Storeys" onExpand={() => setOverlay('storeys')} />
            <StoreyChart storeys={analysis.storeys} />
          </CardContent>
        </Card>

        {/* Row 4: 3D Viewer */}
        {hasFile && (
          <Card className="overflow-hidden flex flex-col card-accent-forest">
            <CardContent className="p-[clamp(0.75rem,1.5vw,1.25rem)] flex flex-col">
              <CardHeader title="3D Viewer" onExpand={() => setOverlay('viewer')} />
              <div className="h-[400px] rounded-lg overflow-hidden bg-black/20">
                <UnifiedBIMViewer
                  modelId={model.id}
                  showPropertiesPanel={false}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Row 5: Treemap + Geometry donut */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-[clamp(0.5rem,1vw,0.75rem)] min-h-[250px]">
          <Card className="overflow-hidden flex flex-col card-accent-forest">
            <CardContent className="p-[clamp(0.75rem,1.5vw,1.25rem)] flex-1 min-h-0 flex flex-col">
              <CardHeader title="Element Distribution" onExpand={() => setOverlay('elements')} />
              <div className="flex-1 min-h-0 relative">
                <Treemap types={analysis.types} />
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden flex flex-col card-accent-forest">
            <CardContent className="p-[clamp(0.75rem,1.5vw,1.25rem)] flex-1 min-h-0 flex flex-col">
              <CardHeader title="Geometry" onExpand={() => setOverlay('geometry')} />
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <GeometryDonut types={analysis.types} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 5: Context / Units / Coordinates */}
        <div className="grid grid-cols-3 gap-[clamp(0.5rem,1vw,0.75rem)]">
          <InfoCard title="Context" rows={[
            ['Project', analysis.project_name || '—'],
            ['Site', analysis.site_name || '—'],
            ['Building', analysis.building_name || '—'],
            ['Application', analysis.application || '—'],
            ['Schema', analysis.ifc_schema || '—'],
          ]} />
          <InfoCard title="Units" rows={
            analysis.units && typeof analysis.units === 'object'
              ? Object.entries(analysis.units as Record<string, unknown>).map(([k, v]) => {
                  if (v && typeof v === 'object' && 'symbol' in (v as Record<string, unknown>)) {
                    const u = v as { name?: string; prefix?: string; symbol?: string };
                    return [k, u.symbol || u.name || '—'];
                  }
                  return [k, String(v ?? '—')];
                })
              : [['—', 'No unit data']]
          } />
          <InfoCard title="Coordinates" rows={
            analysis.coordinates && typeof analysis.coordinates === 'object'
              ? (() => {
                  const c = analysis.coordinates as Record<string, unknown>;
                  const rows: [string, string][] = [];
                  if (c.crs) rows.push(['CRS', String(c.crs)]);
                  if (c.true_north) {
                    const tn = c.true_north as { angle_deg?: number };
                    rows.push(['True North', `${tn.angle_deg ?? 0}°`]);
                  }
                  if (c.wcs_origin) {
                    const o = c.wcs_origin as { x?: number; y?: number; z?: number };
                    rows.push(['WCS Origin', `${o.x ?? 0}, ${o.y ?? 0}, ${o.z ?? 0}`]);
                  }
                  if (c.site_reference) {
                    const s = c.site_reference as { latitude?: number; longitude?: number; elevation?: number };
                    if (s.latitude || s.longitude) rows.push(['Site', `${s.latitude}°N, ${s.longitude}°E`]);
                    if (s.elevation) rows.push(['Elevation', `${s.elevation}m`]);
                  }
                  if (c.orientation_sample) {
                    const os = c.orientation_sample as { dominant?: string };
                    rows.push(['Orientation', os.dominant || '—']);
                  }
                  return rows.length ? rows : [['—', 'No coordinate data']];
                })()
              : [['—', 'No coordinate data']]
          } />
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
        <GeometryDonut types={analysis.types} showAll />
      </DashboardOverlay>
    </>
  );
}

// ─── Stats computation ──────────────────────────────────────────────────────

interface AnalysisStats {
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
  let emptyTypes = 0, untypedCount = 0, proxyCount = 0;
  let missingIsExternal = 0, missingLoadBearing = 0, missingFireRating = 0;
  const classCounts: Record<string, number> = {};
  const repCounts: Record<string, number> = {};

  for (const t of analysis.types) {
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

  return { emptyTypes, untypedCount, proxyCount, missingIsExternal, missingLoadBearing, missingFireRating, classCounts, repCounts };
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-[clamp(0.5rem,1vw,0.75rem)] text-center">
        <div className={`text-[clamp(1.25rem,3vw,1.75rem)] font-bold tabular-nums ${accent ? 'text-lime' : 'text-text-primary'}`}>
          {value.toLocaleString()}
        </div>
        <div className="text-[clamp(0.5rem,0.9vw,0.65rem)] uppercase tracking-wide text-text-tertiary">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

function SubKpiCard({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="p-[clamp(0.4rem,0.8vw,0.6rem)] flex items-center justify-between">
        <span className="text-[clamp(0.55rem,1vw,0.7rem)] text-text-secondary">{label}</span>
        <span className={`text-[clamp(0.7rem,1.2vw,0.85rem)] font-semibold tabular-nums ${warn ? 'text-warning' : 'text-text-primary'}`}>
          {value.toLocaleString()}
        </span>
      </CardContent>
    </Card>
  );
}

// ─── Quality Checks Card ────────────────────────────────────────────────────

function QualityCard({ analysis, stats, onExpand }: { analysis: ModelAnalysis; stats: AnalysisStats; onExpand?: () => void }) {
  const checks = [
    { label: 'Duplicate GUIDs', value: analysis.duplicate_guid_count, ok: analysis.duplicate_guid_count === 0 },
    { label: 'IsExternal unset', value: stats.missingIsExternal, ok: stats.missingIsExternal === 0 },
    { label: 'LoadBearing unset', value: stats.missingLoadBearing, ok: stats.missingLoadBearing === 0 },
    { label: 'FireRating unset', value: stats.missingFireRating, ok: stats.missingFireRating === 0 },
    { label: 'Empty types', value: stats.emptyTypes, ok: stats.emptyTypes === 0 },
  ];

  return (
    <Card className="h-full flex flex-col card-accent-lime">
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

function StoreyChart({ storeys }: { storeys: AnalysisStorey[] }) {
  if (!storeys.length) return <div className="text-text-tertiary text-xs">No storeys</div>;

  const sorted = [...storeys].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  const maxCount = Math.max(...sorted.map(s => s.element_count), 1);

  return (
    <div className="space-y-[clamp(0.1rem,0.3vw,0.2rem)]">
      {sorted.map((s) => (
        <div key={s.name} className="grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.5rem,0.9vw,0.65rem)]"
             style={{ gridTemplateColumns: '1fr auto 3fr auto' }}>
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

function treemapLayout(items: { label: string; value: number }[], W: number, H: number) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rects: { x: number; y: number; w: number; h: number; label: string; value: number }[] = [];
  let x = 0, y = 0, w = W, h = H;

  function layoutRow(row: typeof sorted, rowArea: number) {
    const rowSum = row.reduce((s, i) => s + i.value, 0);

    if (w >= h) {
      // Cut a column from the left; items stack top-to-bottom
      const colWidth = rowArea / h;
      let offsetY = y;
      for (const item of row) {
        const itemH = (item.value / rowSum) * h;
        rects.push({ x, y: offsetY, w: colWidth, h: itemH, label: item.label, value: item.value });
        offsetY += itemH;
      }
      x += colWidth;
      w -= colWidth;
    } else {
      // Cut a row from the top; items go left-to-right
      const rowHeight = rowArea / w;
      let offsetX = x;
      for (const item of row) {
        const itemW = (item.value / rowSum) * w;
        rects.push({ x: offsetX, y, w: itemW, h: rowHeight, label: item.label, value: item.value });
        offsetX += itemW;
      }
      y += rowHeight;
      h -= rowHeight;
    }
  }

  function worst(row: typeof sorted, side: number) {
    const rowSum = row.reduce((s, i) => s + i.value, 0);
    const rowArea = (rowSum / total) * W * H;
    const stripSize = rowArea / side;
    let mx = 0;
    for (const item of row) {
      const itemSide = (item.value / rowSum) * side;
      const r = Math.max(stripSize / itemSide, itemSide / stripSize);
      mx = Math.max(mx, r);
    }
    return mx;
  }

  let remaining = [...sorted];
  while (remaining.length > 0) {
    const side = Math.min(w, h);
    const row = [remaining[0]];
    remaining = remaining.slice(1);

    while (remaining.length > 0) {
      const candidate = [...row, remaining[0]];
      if (worst(candidate, side) <= worst(row, side)) {
        row.push(remaining[0]);
        remaining = remaining.slice(1);
      } else break;
    }

    const rowArea = row.reduce((s, i) => s + (i.value / total) * W * H, 0);
    layoutRow(row, rowArea);
  }

  return rects;
}

function Treemap({ types }: { types: AnalysisTypeRecord[] }) {
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
              className="absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center p-px"
              style={{
                left: `${pctX}%`, top: `${pctY}%`,
                width: `${pctW}%`, height: `${pctH}%`,
                background: color, opacity: 0.85,
              }}
              title={`${r.label}: ${r.value.toLocaleString()}`}
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

const DONUT_COLORS = ['#157954', '#D0D34D', '#C7CEE8', '#2dd4a0', '#fb923c', '#818cf8', '#f87171', '#38bdf8'];

function GeometryDonut({ types, showAll }: { types: AnalysisTypeRecord[]; showAll?: boolean }) {
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
      >
        <title>{`${label}: ${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`}</title>
      </path>
    );
    angle += sweep;
  }

  return (
    <div className="flex items-center gap-[clamp(0.5rem,1.5vw,1rem)]">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-[clamp(5rem,10vw,8rem)] h-[clamp(5rem,10vw,8rem)] flex-shrink-0">
        {paths}
      </svg>
      <div className="space-y-[clamp(0.1rem,0.2vw,0.15rem)] min-w-0">
        {(showAll ? data : data.slice(0, 6)).map(([label, value], i) => (
          <div key={label} className="flex items-center gap-[clamp(0.2rem,0.4vw,0.3rem)] text-[clamp(0.5rem,0.85vw,0.6rem)]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-text-secondary truncate">{label}</span>
            <span className="text-text-tertiary tabular-nums ml-auto">{((value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
        {!showAll && data.length > 6 && (
          <div className="text-[clamp(0.45rem,0.8vw,0.55rem)] text-text-tertiary">
            +{data.length - 6} more
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Info Card ──────────────────────────────────────────────────────────────

function InfoCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <Card className="card-accent-lavender">
      <CardContent className="p-[clamp(0.5rem,1vw,0.75rem)]">
        <h3 className="text-[clamp(0.6rem,1vw,0.75rem)] font-semibold text-text-primary mb-[clamp(0.2rem,0.4vw,0.3rem)]">
          {title}
        </h3>
        <div className="space-y-[clamp(0.1rem,0.2vw,0.15rem)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between text-[clamp(0.5rem,0.85vw,0.6rem)]">
              <span className="text-text-secondary">{label}</span>
              <span className="text-text-primary tabular-nums font-medium truncate ml-2 max-w-[60%] text-right">{value}</span>
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

// ─── Dashboard Overlay ──────────────────────────────────────────────────────

function DashboardOverlay({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="bg-surface border border-border border-t-2 border-t-forest rounded-xl
                      w-[min(90vw,900px)] max-h-[85vh] flex flex-col shadow-2xl
                      animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-lime">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
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

// 3D Viewer Tab Component
function Viewer3DTab({ model }: { model: Model }) {
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);

  return (
    <div className="flex h-full">
      {/* Model tree (left panel) */}
      <aside className="w-64 border-r border-border bg-background p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Model Tree</h2>
        <div className="text-xs text-text-secondary mb-4">
          {model.element_count.toLocaleString()} elements
        </div>

        {/* Placeholder tree structure */}
        <div className="space-y-1 text-xs">
          <div className="font-medium text-text-primary py-1">📁 Project</div>
          <div className="pl-4 space-y-1">
            <div className="font-medium text-text-primary py-1">📁 Site</div>
            <div className="pl-4 space-y-1">
              <div className="font-medium text-text-primary py-1">🏢 Building</div>
              <div className="pl-4 space-y-1">
                {Array.from({ length: model.storey_count || 3 }, (_, i) => (
                  <div key={i} className="text-text-secondary py-1 hover:text-text-primary cursor-pointer">
                    📐 Storey {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-text-tertiary">
          Tree view coming soon...
        </div>
      </aside>

      {/* 3D viewer (center panel) */}
      <main className="flex-1 relative">
        <UnifiedBIMViewer
          modelId={model.id}
          showPropertiesPanel={false}
          onSelectionChange={(element) => setSelectedElement(element)}
        />
      </main>

      {/* Properties panel (right panel) */}
      <aside className="w-80 border-l border-border bg-background overflow-hidden">
        <ElementPropertiesPanel
          element={selectedElement}
          onClose={() => setSelectedElement(null)}
        />
      </aside>
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

// Placeholder Tab Component
function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
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
