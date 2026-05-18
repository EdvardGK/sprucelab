import { useMemo } from 'react';

import { AnalysisKpiCluster } from '@/components/features/model-workspace/AnalysisKpiCluster';
import { VerifiedStoreyChart } from '@/components/features/model-workspace/VerifiedStoreyChart';
import { Card, CardContent } from '@/components/ui/card';
import { tokens } from '@/lib/design-tokens';
import { treemapLayout } from '@/lib/treemap';
import type {
  AnalysisStorey,
  AnalysisTypeRecord,
  ModelAnalysis,
  ModelStoreyVerification,
} from '@/lib/api-types';

// ─── Mock data ──────────────────────────────────────────────────────────────
//
// Hand-rolled so the preview is backend-free. Shapes match the production
// API exactly (api-types.ts). Numbers picked to exercise every UI branch
// in the components below: classified/material/verified mid-band, a few
// orphans, a small untyped slice.

const PALETTE = tokens.dataPalette.slots;

function makeType(
  i: number,
  ifc: string,
  count: number,
  storeyDist: Array<[string, number]>,
  opts: Partial<AnalysisTypeRecord> = {},
): AnalysisTypeRecord {
  return {
    type_class: `${ifc}Type`,
    type_name: `${ifc} type ${i + 1}`,
    element_class: ifc,
    predefined_type: 'STANDARD',
    instance_count: count,
    is_empty: false,
    is_proxy: false,
    is_untyped: false,
    loadbearing_true: 0,
    loadbearing_false: 0,
    loadbearing_unset: count,
    is_external_true: 0,
    is_external_false: 0,
    is_external_unset: count,
    fire_rating_set: 0,
    fire_rating_unset: count,
    primary_representation: 'SweptSolid',
    mapped_item_count: 0,
    mapped_source_count: 0,
    reuse_ratio: 1.4,
    properties: {},
    storey_distribution: storeyDist.map(([storey, instance_count]) => ({
      storey,
      elevation: null,
      instance_count,
    })),
    ...opts,
  };
}

// Class mix lifted from a realistic mid-sized ARK model — counts add up
// to 1,204 instances across 312 types (matches the wireframe headline).
const MOCK_TYPES: AnalysisTypeRecord[] = [
  // Walls — 214 instances across 84 types
  ...Array.from({ length: 84 }, (_, i) =>
    makeType(i, 'IfcWall', 2 + (i % 4), [
      ['U01', 1],
      ['P01', 1],
      ['P02', i % 2],
    ]),
  ),
  // Slabs — 128 instances across 32 types
  ...Array.from({ length: 32 }, (_, i) =>
    makeType(i, 'IfcSlab', 3 + (i % 3), [
      ['P01', 1],
      ['P02', 2],
      ['P03', 1],
    ]),
  ),
  // Doors — 196 instances across 38 types
  ...Array.from({ length: 38 }, (_, i) =>
    makeType(i, 'IfcDoor', 4 + (i % 4), [
      ['P01', 2],
      ['P02', 2],
      ['P03', 1],
    ]),
  ),
  // Windows — 184 instances across 26 types
  ...Array.from({ length: 26 }, (_, i) =>
    makeType(i, 'IfcWindow', 6 + (i % 3), [
      ['P01', 3],
      ['P02', 3],
      ['P03', 1],
    ]),
  ),
  // Columns — 96 instances across 18 types
  ...Array.from({ length: 18 }, (_, i) =>
    makeType(i, 'IfcColumn', 4 + (i % 3), [
      ['U01', 1],
      ['P01', 2],
      ['P02', 2],
    ]),
  ),
  // Beams — 132 instances across 24 types
  ...Array.from({ length: 24 }, (_, i) =>
    makeType(i, 'IfcBeam', 4 + (i % 4), [
      ['P01', 2],
      ['P02', 2],
      ['P03', 1],
    ]),
  ),
  // Railings — 56 instances across 14 types
  ...Array.from({ length: 14 }, (_, i) =>
    makeType(i, 'IfcRailing', 3 + (i % 2), [
      ['P02', 2],
      ['P03', 2],
    ]),
  ),
  // Stairs — 18 instances across 6 types
  ...Array.from({ length: 6 }, (_, i) =>
    makeType(i, 'IfcStair', 2 + (i % 2), [['P01', 2], ['P02', 1]]),
  ),
  // Coverings — 88 instances across 20 types
  ...Array.from({ length: 20 }, (_, i) =>
    makeType(i, 'IfcCovering', 3 + (i % 3), [
      ['P01', 2],
      ['P02', 2],
    ]),
  ),
  // Furniture — 92 instances across 50 types
  ...Array.from({ length: 50 }, (_, i) =>
    makeType(i, 'IfcFurniture', 1 + (i % 3), [
      ['P01', 1],
      ['P02', 1],
    ]),
  ),
];

const MOCK_STOREYS: AnalysisStorey[] = [
  { name: 'U01', elevation: -3.0, height: 3.0, element_count: 188 },
  { name: 'P01', elevation: 0.0, height: 3.2, element_count: 312 },
  { name: 'P02', elevation: 3.2, height: 3.0, element_count: 298 },
  { name: 'P03', elevation: 6.2, height: 3.0, element_count: 252 },
  { name: 'P04', elevation: 9.2, height: 3.2, element_count: 154 },
];

const MOCK_ANALYSIS: ModelAnalysis = {
  id: 'preview-analysis',
  model: 'preview-model',
  created_at: '2026-05-18T14:21:00Z',
  ifc_schema: 'IFC4',
  file_size_mb: 42.7,
  application: 'Autodesk Revit 2024',
  total_types: MOCK_TYPES.length,
  total_products: MOCK_TYPES.reduce((s, t) => s + t.instance_count, 0),
  total_storeys: MOCK_STOREYS.length,
  total_spaces: 38,
  duplicate_guid_count: 0,
  units: { length: 'm' },
  coordinates: {},
  project_name: 'LBK Building A',
  site_name: 'Site 01',
  building_name: 'Building A',
  storeys: MOCK_STOREYS,
  types: MOCK_TYPES,
  spatial_data: { bounding_box: null, positions: [], origin: { x: 0, y: 0 } },
};

const MOCK_VERIFICATION: ModelStoreyVerification = {
  has_canonical: true,
  matched_count: 4,
  canonical_count: 5,
  tolerance_m: 0.25,
  orphan_count: 12,
  total_products: MOCK_ANALYSIS.total_products,
  physical_total: MOCK_ANALYSIS.total_products - 56, // openings + virtual
  non_physical_count: 56,
  model_storeys: [
    { guid: 's-u01', name: 'U01', elevation: -3.0, element_count: 188, status: 'matched', canonical_code: 'U01', canonical_name: 'Underetasje', elevation_delta_m: 0 },
    { guid: 's-p01', name: 'P01', elevation: 0.0, element_count: 312, status: 'matched', canonical_code: 'P01', canonical_name: 'Plan 1', elevation_delta_m: 0 },
    { guid: 's-p02', name: 'P02', elevation: 3.2, element_count: 298, status: 'matched', canonical_code: 'P02', canonical_name: 'Plan 2', elevation_delta_m: 0 },
    { guid: 's-p03', name: 'P03', elevation: 6.2, element_count: 252, status: 'rename', canonical_code: 'P03', canonical_name: 'Plan 3', elevation_delta_m: 0 },
    { guid: 's-p04', name: 'P04', elevation: 9.2, element_count: 154, status: 'deviating', canonical_code: 'P04', canonical_name: 'Plan 4', elevation_delta_m: 0.4 },
  ],
  missing_canonical: [],
};

// ─── Treemap (lifted from ModelWorkspace, simplified for preview) ───────────

function ElementsTreemap({
  types,
  classColorMap,
}: {
  types: AnalysisTypeRecord[];
  classColorMap: Record<string, string>;
}) {
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

  const W = 400, H = 220;
  const rects = treemapLayout(items, W, H);

  return (
    <div className="absolute inset-0">
      <div className="relative w-full h-full">
        {rects.map((r, i) => {
          const pctX = (r.x / W) * 100, pctY = (r.y / H) * 100;
          const pctW = (r.w / W) * 100, pctH = (r.h / H) * 100;
          const color = classColorMap[r.label] ?? PALETTE[i % PALETTE.length];
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
                  <span className="text-[clamp(0.5rem,0.85vw,0.7rem)] font-medium text-white/95 leading-tight truncate max-w-full px-0.5">
                    {r.label}
                  </span>
                  <span className="text-[clamp(0.45rem,0.75vw,0.6rem)] text-white/80 tabular-nums">
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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ModelDashPreview() {
  const classColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const counts: Record<string, number> = {};
    for (const t of MOCK_TYPES) {
      const cls = (t.element_class || t.type_class.replace('Type', '')).replace('Ifc', '');
      counts[cls] = (counts[cls] || 0) + t.instance_count;
    }
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    ordered.forEach((cls, i) => { map[cls] = PALETTE[i % PALETTE.length]; });
    return map;
  }, []);

  // 1440×900 above-fold budget — see docs/wireframes/2026-05-18_model-dash-10-options.html.
  // Status strip 32 + gutter 13 + hero 400 + gutter 13 + row2 254 = 712px.
  // Card padding 13px. Gutter 13px. Grid 13 columns.
  return (
    <div className="bg-background min-h-screen p-[13px]">
      <div className="mx-auto" style={{ maxWidth: 1440 }}>
        {/* Status strip · c13 */}
        <div className="flex items-center gap-3 px-3 py-2 mb-[13px] rounded border border-line bg-surface border-l-[3px] border-l-[hsl(158_70%_28%)] font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
             style={{ height: 32 }}>
          ARK-BuildingA-V3.ifc · IFC4 · 312 types · 1 204 instances · 5 storeys · 78% classified · 62% material · 4 issues
        </div>

        {/* Hero row · c8 (viewer) / c5 (data column 8/5 inner) · 400px */}
        <div className="grid gap-[13px] mb-[13px]" style={{ height: 400, gridTemplateColumns: 'repeat(13, 1fr)' }}>
          {/* Viewer placeholder (c8) */}
          <Card className="col-span-8 card-accent-forest overflow-hidden">
            <CardContent className="p-3 h-full flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">3D viewer (c8 · ≈2:1)</div>
              <div className="flex-1 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent_0,transparent_10px,rgba(0,0,0,0.04)_10px,rgba(0,0,0,0.04)_11px)] rounded border border-dashed border-line text-text-tertiary text-xs font-mono uppercase tracking-widest">
                viewer placeholder
              </div>
            </CardContent>
          </Card>

          {/* Data column (c5) — inner 8/5 split: KPI top, identity bottom */}
          <div className="col-span-5 flex flex-col gap-[13px]">
            <Card className="card-accent-forest overflow-hidden" style={{ flex: 8 }}>
              <CardContent className="p-3 h-full flex flex-col">
                <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">KPIs (c5 top · 8/13)</div>
                <div className="flex-1 min-h-0">
                  <AnalysisKpiCluster
                    analysis={MOCK_ANALYSIS}
                    storeyVerification={MOCK_VERIFICATION}
                    classColorMap={classColorMap}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="card-accent-forest overflow-hidden" style={{ flex: 5 }}>
              <CardContent className="p-3 h-full flex flex-col">
                <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">Identity · Lineage (c5 bottom · 5/13)</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] flex-1 min-h-0">
                  <span className="text-text-tertiary">Uploader</span><span className="tabular-nums">edkjo</span>
                  <span className="text-text-tertiary">Uploaded</span><span className="tabular-nums">2026-05-18 14:21</span>
                  <span className="text-text-tertiary">Version</span><span className="tabular-nums">V3 of 3</span>
                  <span className="text-text-tertiary">Application</span><span>Revit 2024</span>
                  <span className="text-text-tertiary">Discipline</span><span>ARK</span>
                  <span className="text-text-tertiary">Issues on objects</span><span className="text-amber-600">— pending</span>
                  <span className="text-text-tertiary">Claims</span><span className="tabular-nums">7</span>
                  <span className="text-text-tertiary">Viewer groups</span><span className="tabular-nums">3</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Row 2 · c8 (Storeys bars) / c5 (Elements treemap) · 254px */}
        <div className="grid gap-[13px]" style={{ height: 254, gridTemplateColumns: 'repeat(13, 1fr)' }}>
          <Card className="col-span-8 card-accent-forest overflow-hidden">
            <CardContent className="p-3 h-full flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">Storeys (c8 · ≈3.2:1 · bars)</div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <VerifiedStoreyChart
                  storeys={MOCK_STOREYS}
                  verification={MOCK_VERIFICATION}
                />
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-5 card-accent-forest overflow-hidden">
            <CardContent className="p-3 h-full flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">Elements (c5 · ≈2:1 · treemap)</div>
              <div className="flex-1 relative">
                <ElementsTreemap types={MOCK_TYPES} classColorMap={classColorMap} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
