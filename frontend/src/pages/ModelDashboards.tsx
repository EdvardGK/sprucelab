import { useMemo, useState } from 'react';
import {
  ClipboardCheck, Shapes, HelpCircle, Hash, Tags, Globe, ListChecks,
  Library, Unlink, Layers, CheckCircle2, AlertTriangle, Circle, Flag,
  GitBranch, Users, FileText, Wrench, Maximize2, Box,
} from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { DashboardTile } from '@/components/Layout/DashboardTile';
import { VerifiedStoreyChart } from '@/components/features/model-workspace/VerifiedStoreyChart';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tokens } from '@/lib/design-tokens';
import { treemapLayout } from '@/lib/treemap';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import type {
  AnalysisStorey, AnalysisTypeRecord, ModelStoreyVerification,
} from '@/lib/api-types';

// ════════════════════════════════════════════════════════════════════════════
// Mock data
// ════════════════════════════════════════════════════════════════════════════

const PALETTE = tokens.dataPalette.slots;

function makeType(
  i: number, ifc: string, count: number,
  storeyDist: Array<[string, number]>,
  opts: Partial<AnalysisTypeRecord> = {},
): AnalysisTypeRecord {
  return {
    type_class: `${ifc}Type`, type_name: `${ifc} type ${i + 1}`, element_class: ifc,
    predefined_type: 'STANDARD', instance_count: count,
    is_empty: false, is_proxy: false, is_untyped: false,
    loadbearing_true: 0, loadbearing_false: 0, loadbearing_unset: count,
    is_external_true: 0, is_external_false: 0, is_external_unset: count,
    fire_rating_set: 0, fire_rating_unset: count,
    primary_representation: 'SweptSolid',
    mapped_item_count: i % 3 === 0 ? count : 0,
    mapped_source_count: i % 3 === 0 ? 1 : 0,
    reuse_ratio: 1.4, properties: {},
    storey_distribution: storeyDist.map(([storey, instance_count]) => ({ storey, elevation: null, instance_count })),
    ...opts,
  };
}

const MOCK_TYPES: AnalysisTypeRecord[] = [
  ...Array.from({ length: 84 }, (_, i) => makeType(i, 'IfcWall', 2 + (i % 4), [['U01', 1], ['P01', 1], ['P02', i % 2]])),
  ...Array.from({ length: 32 }, (_, i) => makeType(i, 'IfcSlab', 3 + (i % 3), [['P01', 1], ['P02', 2], ['P03', 1]])),
  ...Array.from({ length: 38 }, (_, i) => makeType(i, 'IfcDoor', 4 + (i % 4), [['P01', 2], ['P02', 2], ['P03', 1]], { predefined_type: i % 5 === 0 ? 'USERDEFINED' : 'STANDARD' })),
  ...Array.from({ length: 26 }, (_, i) => makeType(i, 'IfcWindow', 6 + (i % 3), [['P01', 3], ['P02', 3], ['P03', 1]])),
  ...Array.from({ length: 18 }, (_, i) => makeType(i, 'IfcColumn', 4 + (i % 3), [['U01', 1], ['P01', 2], ['P02', 2]])),
  ...Array.from({ length: 24 }, (_, i) => makeType(i, 'IfcBeam', 4 + (i % 4), [['P01', 2], ['P02', 2], ['P03', 1]])),
  ...Array.from({ length: 14 }, (_, i) => makeType(i, 'IfcRailing', 3 + (i % 2), [['P02', 2], ['P03', 2]])),
  ...Array.from({ length: 6 }, (_, i) => makeType(i, 'IfcStair', 2 + (i % 2), [['P01', 2], ['P02', 1]])),
  ...Array.from({ length: 20 }, (_, i) => makeType(i, 'IfcCovering', 3 + (i % 3), [['P01', 2], ['P02', 2]])),
  ...Array.from({ length: 50 }, (_, i) => makeType(i, 'IfcFurniture', 1 + (i % 3), [['P01', 1], ['P02', 1]], { predefined_type: i % 3 === 0 ? 'USERDEFINED' : 'NOTDEFINED' })),
];

const MOCK_STOREYS: AnalysisStorey[] = [
  { name: 'U01', elevation: -3.0, height: 3.0, element_count: 188 },
  { name: 'P01', elevation: 0.0, height: 3.2, element_count: 312 },
  { name: 'P02', elevation: 3.2, height: 3.0, element_count: 298 },
  { name: 'P03', elevation: 6.2, height: 3.0, element_count: 252 },
  { name: 'P04', elevation: 9.2, height: 3.2, element_count: 154 },
];

const MOCK_VERIFICATION: ModelStoreyVerification = {
  has_canonical: true, matched_count: 4, canonical_count: 5, tolerance_m: 0.25,
  orphan_count: 12, total_products: 1204, physical_total: 1148, non_physical_count: 56,
  model_storeys: [
    { guid: 's-u01', name: 'U01', elevation: -3.0, element_count: 188, status: 'matched', canonical_code: 'U01', canonical_name: 'Underetasje', elevation_delta_m: 0 },
    { guid: 's-p01', name: 'P01', elevation: 0.0, element_count: 312, status: 'matched', canonical_code: 'P01', canonical_name: 'Plan 1', elevation_delta_m: 0 },
    { guid: 's-p02', name: 'P02', elevation: 3.2, element_count: 298, status: 'matched', canonical_code: 'P02', canonical_name: 'Plan 2', elevation_delta_m: 0 },
    { guid: 's-p03', name: 'P03', elevation: 6.2, element_count: 252, status: 'rename', canonical_code: 'P03', canonical_name: 'Plan 3', elevation_delta_m: 0 },
    { guid: 's-p04', name: 'P04', elevation: 9.2, element_count: 154, status: 'deviating', canonical_code: 'P04', canonical_name: 'Plan 4', elevation_delta_m: 0.4 },
  ],
  missing_canonical: [],
};

const MOCK_HEALTH = {
  duplicate_guid_count: 0, predefined_userdef_pct: 14,
  crs_present: true, map_conversion_present: false,
  required_pset_coverage_pct: 71, typebank_match_pct: 38,
  mapped_item_ratio_pct: 56, unclassified_proxy_count: 3,
};

interface EirRequirement { code: string; label: string; status: 'met' | 'missing' | 'partial'; detail?: string; }
const MOCK_EIR: EirRequirement[] = [
  { code: 'CRS-1', label: 'Projected CRS declared', status: 'met' },
  { code: 'CRS-2', label: 'IfcMapConversion to true-north', status: 'missing' },
  { code: 'NS-1', label: 'NS3451 codes on load-bearing elements', status: 'partial', detail: '78%' },
  { code: 'PSET-1', label: 'Pset_WallCommon on all IfcWall', status: 'partial', detail: '82%' },
  { code: 'PSET-2', label: 'Pset_DoorCommon on all IfcDoor', status: 'met' },
  { code: 'PSET-3', label: 'Pset_SlabCommon on all IfcSlab', status: 'partial', detail: '64%' },
  { code: 'TYP-1', label: 'No untyped load-bearing elements', status: 'met' },
  { code: 'TYP-2', label: 'No raw IfcProxy without classification', status: 'missing', detail: '3 found' },
  { code: 'NAM-1', label: 'Type naming matches ARK_XXX_NNN regex', status: 'partial', detail: '91%' },
  { code: 'MMI-1', label: 'MMI ≥ 200 on all primary elements', status: 'partial', detail: '88%' },
  { code: 'GEO-1', label: 'Bounding box within 5 km of project origin', status: 'met' },
  { code: 'GUID-1', label: 'No duplicate GlobalIds', status: 'met' },
  { code: 'VER-1', label: 'Verified by human reviewer', status: 'missing' },
];
const EIR_MET = MOCK_EIR.filter(r => r.status === 'met').length;
const EIR_TOTAL = MOCK_EIR.length;

interface AttentionItem { kind: 'flag' | 'warn' | 'info'; label: string; tag?: string; count?: number; }
const MOCK_ATTENTION: AttentionItem[] = [
  { kind: 'flag', label: 'Walls missing fire-rating', tag: 'PSET-1', count: 7 },
  { kind: 'flag', label: 'Storey deviations from canonical', tag: 'CRS', count: 5 },
  { kind: 'flag', label: 'Raw IfcProxy without classification', tag: 'TYP-2', count: 3 },
  { kind: 'warn', label: 'Orphan elements outside spatial tree', count: 12 },
  { kind: 'warn', label: 'Untyped wall elements', tag: 'ARK', count: 9 },
  { kind: 'warn', label: 'Types use IfcProxy', tag: 'ARK', count: 3 },
  { kind: 'warn', label: 'Types missing material layers', tag: 'ARK', count: 14 },
  { kind: 'warn', label: 'Type-merge candidates', count: 5 },
  { kind: 'info', label: 'Reuse ratio below project avg (1.8 vs 2.2)' },
  { kind: 'info', label: 'IfcMapConversion missing — federation may misalign' },
];

const MOCK_MMI = [
  { level: 100, types: 4 },  { level: 200, types: 38 }, { level: 300, types: 168 },
  { level: 400, types: 84 }, { level: 500, types: 18 },
];
const MMI_COLORS = ['hsl(0 65% 55%)', 'hsl(28 88% 55%)', 'hsl(158 50% 45%)', 'hsl(158 65% 35%)', 'hsl(158 80% 25%)'];

const MOCK_NS3451 = [
  { code: '221', name: 'Bærevegg', types: 48 },
  { code: '222', name: 'Ikke-bærevegg', types: 36 },
  { code: '232', name: 'Dekke', types: 32 },
  { code: '241', name: 'Dør', types: 38 },
  { code: '242', name: 'Vindu', types: 26 },
  { code: '262', name: 'Tak', types: 14 },
  { code: '281', name: 'Innredning', types: 50 },
];

const MOCK_MATERIALS = [
  { name: 'Concrete C35/45', family: 'Concrete', qty: 324, unit: 'm³', color: 'hsl(0 0% 55%)' },
  { name: 'Rebar B500NC',    family: 'Steel',    qty: 16800, unit: 'kg', color: 'hsl(200 15% 45%)' },
  { name: 'Gypsum board',    family: 'Gypsum',   qty: 1205, unit: 'm²', color: 'hsl(40 30% 75%)' },
  { name: 'Mineral wool',    family: 'Insulation', qty: 892, unit: 'm²', color: 'hsl(45 70% 65%)' },
  { name: 'Brick',           family: 'Masonry',  qty: 410, unit: 'm²', color: 'hsl(15 50% 50%)' },
  { name: 'Oak flooring',    family: 'Wood',     qty: 224, unit: 'm²', color: 'hsl(28 55% 45%)' },
];

// ════════════════════════════════════════════════════════════════════════════
// Primitives
// ════════════════════════════════════════════════════════════════════════════

const GRID13 = { display: 'grid', gridTemplateColumns: 'repeat(13, minmax(0, 1fr))', gap: 13 } as const;

function Title({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-3 flex-shrink-0">
      <h3 className="text-[13px] font-semibold text-text-primary truncate">{children}</h3>
      {right && <span className="text-[11px] text-text-tertiary tabular-nums ml-2 shrink-0">{right}</span>}
    </div>
  );
}

function Pane({ children, span, className }: { children: React.ReactNode; span?: number; className?: string }) {
  return (
    <DashboardTile id={`pane-${span}`} className={cn('p-4', className)} style={{ gridColumn: span ? `span ${span}` : undefined }}>
      {children}
    </DashboardTile>
  );
}

// Realistic-looking viewer placeholder: dark canvas, axis gizmo, perspective grid
function Viewer({ tall }: { tall?: boolean }) {
  return (
    <div className={cn('relative w-full rounded overflow-hidden bg-gradient-to-b from-[hsl(220_15%_14%)] to-[hsl(220_18%_10%)]', tall ? 'h-full' : 'flex-1')}>
      {/* perspective floor grid — preserveAspectRatio so the model silhouette doesn't stretch */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 500">
        <defs>
          <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.08)" />
          </linearGradient>
        </defs>
        {/* perspective lines */}
        {Array.from({ length: 16 }, (_, i) => (
          <line key={`v${i}`} x1={400 + (i - 8) * 80} y1="500" x2="400" y2="280" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        ))}
        {[440, 470, 500].map((y, i) => (
          <ellipse key={i} cx="400" cy={y - 5} rx={400 - i * 80} ry={20 - i * 5} stroke="rgba(255,255,255,0.06)" fill="none" />
        ))}
        {/* model silhouette */}
        <g transform="translate(280 180)" fill="rgba(180,200,210,0.85)" stroke="rgba(255,255,255,0.4)" strokeWidth="1">
          <polygon points="0,80 60,50 60,170 0,200" />
          <polygon points="60,50 180,30 240,55 240,150 180,165 60,170" fill="rgba(160,180,200,0.85)" />
          <polygon points="180,30 200,10 240,15 240,55" fill="rgba(200,215,225,0.9)" />
          <polygon points="240,55 240,150 280,135 280,40 240,15" fill="rgba(150,170,190,0.85)" />
        </g>
        <rect x="0" y="380" width="800" height="120" fill="url(#floorFade)" />
      </svg>
      {/* axis gizmo */}
      <svg className="absolute bottom-3 left-3 h-12 w-12 opacity-80" viewBox="0 0 60 60">
        <line x1="30" y1="30" x2="55" y2="30" stroke="#dc2626" strokeWidth="2" />
        <line x1="30" y1="30" x2="30" y2="5" stroke="#16a34a" strokeWidth="2" />
        <line x1="30" y1="30" x2="12" y2="48" stroke="#2563eb" strokeWidth="2" />
        <text x="56" y="32" fill="#dc2626" fontSize="8" fontFamily="monospace">X</text>
        <text x="32" y="6" fill="#16a34a" fontSize="8" fontFamily="monospace">Y</text>
        <text x="2" y="50" fill="#2563eb" fontSize="8" fontFamily="monospace">Z</text>
      </svg>
      {/* navigation hint */}
      <div className="absolute top-3 right-3 flex gap-1">
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">2D</Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"><Maximize2 className="h-3 w-3" /></Button>
      </div>
      <div className="absolute bottom-3 right-3 text-[10px] font-mono text-white/40 tracking-wide">312 types · 1 204 instances · 5 storeys</div>
    </div>
  );
}

function StatusRibbon() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded border border-line bg-surface border-l-[3px] border-l-[hsl(158_70%_28%)]">
      <Box className="h-3.5 w-3.5 text-[hsl(158_70%_28%)] shrink-0" />
      <span className="font-semibold text-[12px]">ARK-BuildingA-V3.ifc</span>
      <span className="text-[11px] text-text-tertiary truncate">V3 of 3 · edkjo · 2026-05-18 · Revit 2024 · ARK · IFC4 · 42.7 MB · 3 viewer groups · 7 claims</span>
    </div>
  );
}

// Hook-safe Tile — hook is always called, value-to-number conversion happens after
type Tone = 'good' | 'warn' | 'danger' | 'neutral';
const TONE: Record<Tone, { value: string; ring: string; icon: string }> = {
  good:    { value: 'text-[hsl(158_70%_28%)]', ring: 'ring-1 ring-[hsl(158_70%_28%/0.2)]', icon: 'text-[hsl(158_70%_28%)]' },
  warn:    { value: 'text-amber-600 dark:text-amber-400', ring: 'ring-1 ring-amber-400/30', icon: 'text-amber-500' },
  danger:  { value: 'text-red-600 dark:text-red-400', ring: 'ring-1 ring-red-400/40', icon: 'text-red-500' },
  neutral: { value: 'text-text-primary', ring: 'ring-1 ring-line/40', icon: 'text-text-tertiary' },
};

interface TileProps {
  icon: React.ReactNode; label: string; value: number; valueLabel?: string;
  suffix?: string; fraction?: boolean; sub?: string; tone?: Tone;
}
function Tile({ icon, label, value, valueLabel, suffix, fraction, sub, tone = 'neutral' }: TileProps) {
  const animated = useCountUp(value, { fraction });
  const t = TONE[tone];
  return (
    <div className={cn('rounded-lg border border-line bg-surface px-3 py-2.5 flex flex-col gap-1.5 min-h-0', t.ring)}>
      <div className="flex items-center justify-between text-text-tertiary">
        <span className="text-[10px] uppercase tracking-wider font-medium truncate">{label}</span>
        <span className={cn('shrink-0', t.icon)}>{icon}</span>
      </div>
      <div className={cn('text-[clamp(1.1rem,1.6vw,1.5rem)] font-semibold tabular-nums leading-none', t.value)}>
        {valueLabel ?? animated}{suffix}
      </div>
      {sub && <div className="text-[10px] text-text-tertiary tabular-nums truncate">{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// IFC health cluster (real tiles, hook-safe)
// ════════════════════════════════════════════════════════════════════════════

interface HealthMetric { props: TileProps; }
function ifcHealthMetrics(): HealthMetric[] {
  const h = MOCK_HEALTH;
  const totalInstances = MOCK_TYPES.reduce((s, t) => s + t.instance_count, 0);
  const untypedPct = 3;
  const orphanPct = (MOCK_VERIFICATION.orphan_count / MOCK_VERIFICATION.physical_total) * 100;
  return [
    { props: { icon: <ClipboardCheck className="h-3.5 w-3.5" />, label: 'EIR fulfilled', value: EIR_MET, valueLabel: `${EIR_MET}/${EIR_TOTAL}`, sub: `${((EIR_MET/EIR_TOTAL)*100).toFixed(0)}% met`, tone: EIR_MET/EIR_TOTAL >= 0.75 ? 'good' : EIR_MET/EIR_TOTAL >= 0.4 ? 'warn' : 'danger' } },
    { props: { icon: <Shapes className="h-3.5 w-3.5" />, label: 'Types', value: MOCK_TYPES.length, sub: `${totalInstances.toLocaleString()} instances` } },
    { props: { icon: <HelpCircle className="h-3.5 w-3.5" />, label: 'Untyped', value: untypedPct, suffix: '%', fraction: true, sub: `${Math.round(totalInstances*0.03)} instances`, tone: 'good' } },
    { props: { icon: <Hash className="h-3.5 w-3.5" />, label: 'Duplicate GUIDs', value: h.duplicate_guid_count, sub: 'must be 0', tone: 'good' } },
    { props: { icon: <Tags className="h-3.5 w-3.5" />, label: 'USERDEFINED', value: h.predefined_userdef_pct, suffix: '%', fraction: true, sub: 'PredefinedType skip', tone: 'warn' } },
    { props: { icon: <Globe className="h-3.5 w-3.5" />, label: 'CRS', value: 0, valueLabel: 'No MapConv', sub: 'IfcProjectedCRS only', tone: 'warn' } },
    { props: { icon: <ListChecks className="h-3.5 w-3.5" />, label: 'Pset coverage', value: h.required_pset_coverage_pct, suffix: '%', fraction: true, sub: 'required by class', tone: 'warn' } },
    { props: { icon: <Library className="h-3.5 w-3.5" />, label: 'TypeBank match', value: h.typebank_match_pct, suffix: '%', fraction: true, sub: 'cross-project', tone: 'warn' } },
    { props: { icon: <Layers className="h-3.5 w-3.5" />, label: 'MappedItem', value: h.mapped_item_ratio_pct, suffix: '%', fraction: true, sub: 'geometry reuse' } },
    { props: { icon: <Unlink className="h-3.5 w-3.5" />, label: 'Orphans', value: MOCK_VERIFICATION.orphan_count, sub: `${orphanPct.toFixed(1)}% outside tree`, tone: 'warn' } },
  ];
}

function IfcHealthCluster({ columns }: { columns: 2 | 5 }) {
  const metrics = ifcHealthMetrics();
  return (
    <div className={cn('grid gap-2 h-full min-h-0', columns === 2 ? 'grid-cols-2' : 'grid-cols-5')}>
      {metrics.map((m, i) => <Tile key={i} {...m.props} />)}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Real charts
// ════════════════════════════════════════════════════════════════════════════

function ElementsTreemap({ classColorMap }: { classColorMap: Record<string, string> }) {
  const items = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of MOCK_TYPES) {
      if (t.instance_count === 0) continue;
      const cls = (t.element_class || t.type_class.replace('Type', '')).replace('Ifc', '');
      counts[cls] = (counts[cls] || 0) + t.instance_count;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, []);
  const W = 400, H = 220;
  const rects = treemapLayout(items, W, H);
  return (
    <div className="absolute inset-0 rounded overflow-hidden">
      {rects.map((r, i) => {
        const color = classColorMap[r.label] ?? PALETTE[i % PALETTE.length];
        const showLabel = (r.w / W) * 100 > 8 && (r.h / H) * 100 > 8;
        return (
          <div key={r.label} className="absolute border border-black/20 overflow-hidden flex flex-col items-center justify-center px-1"
            style={{ left: `${(r.x/W)*100}%`, top: `${(r.y/H)*100}%`, width: `${(r.w/W)*100}%`, height: `${(r.h/H)*100}%`, background: color }}
            title={`${r.label}: ${r.value.toLocaleString()}`}>
            {showLabel && (<>
              <span className="text-[clamp(0.6rem,0.9vw,0.8rem)] font-medium text-white leading-tight truncate max-w-full">{r.label}</span>
              <span className="text-[clamp(0.5rem,0.75vw,0.65rem)] text-white/85 tabular-nums">{r.value.toLocaleString()}</span>
            </>)}
          </div>
        );
      })}
    </div>
  );
}

function EirChecklist() {
  return (
    <ul className="flex flex-col gap-1.5 min-h-0 overflow-y-auto pr-1">
      {MOCK_EIR.map(r => {
        const icon = r.status === 'met'
          ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(158_70%_28%)]" />
          : r.status === 'partial'
          ? <Circle className="h-3.5 w-3.5 text-amber-500 fill-amber-500/30" />
          : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
        return (
          <li key={r.code} className="flex items-center gap-2 text-[12px] py-1">
            <span className="shrink-0">{icon}</span>
            <span className="font-mono text-[10px] uppercase text-text-tertiary tabular-nums shrink-0 w-14">{r.code}</span>
            <span className="flex-1 truncate text-text-secondary">{r.label}</span>
            {r.detail && <span className="text-[11px] text-text-tertiary tabular-nums shrink-0">{r.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function AttentionFeed({ limit }: { limit?: number }) {
  const items = limit ? MOCK_ATTENTION.slice(0, limit) : MOCK_ATTENTION;
  return (
    <ul className="flex flex-col gap-1.5 min-h-0 overflow-y-auto pr-1">
      {items.map((a, i) => {
        const pill = a.kind === 'flag'
          ? 'bg-red-500/10 text-red-600 border-red-400/40'
          : a.kind === 'warn'
          ? 'bg-amber-500/10 text-amber-600 border-amber-400/40'
          : 'bg-text-tertiary/10 text-text-tertiary border-line';
        return (
          <li key={i} className="flex items-center gap-2 text-[12px] py-1">
            <span className={cn('rounded-full px-1.5 py-0.5 border font-mono text-[9px] uppercase tracking-wide shrink-0', pill)}>{a.kind}</span>
            {a.count !== undefined && <span className="tabular-nums font-medium text-[13px] shrink-0 w-6 text-right">{a.count}</span>}
            <span className="flex-1 truncate text-text-secondary">{a.label}</span>
            {a.tag && <span className="font-mono text-[9px] text-text-tertiary uppercase shrink-0">{a.tag}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// Real horizontal stacked bar with proper axis ticks
function MmiBar() {
  const total = MOCK_MMI.reduce((s, b) => s + b.types, 0);
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 justify-center">
      <div className="flex h-7 rounded overflow-hidden border border-line shadow-sm">
        {MOCK_MMI.map((b, i) => {
          const pct = (b.types / total) * 100;
          return (
            <div key={b.level} className="flex items-center justify-center text-[11px] font-medium text-white tabular-nums"
                 style={{ width: `${pct}%`, background: MMI_COLORS[i], minWidth: pct > 4 ? undefined : 0 }}
                 title={`MMI ${b.level}: ${b.types} types (${pct.toFixed(1)}%)`}>
              {pct > 6 && b.types}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {MOCK_MMI.map((b, i) => (
          <div key={b.level} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: MMI_COLORS[i] }} />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-mono">MMI {b.level}</span>
              <span className="text-[12px] font-medium text-text-primary tabular-nums">{b.types}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Real horizontal bar chart with proper axis
function ClassificationBars() {
  const max = Math.max(...MOCK_NS3451.map(b => b.types));
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto">
      {MOCK_NS3451.map(b => {
        const pct = (b.types / max) * 100;
        return (
          <div key={b.code} className="flex items-center gap-2 text-[12px]">
            <span className="font-mono text-[11px] text-text-tertiary tabular-nums shrink-0">{b.code}</span>
            <span className="text-text-secondary text-[12px] shrink-0">{b.name}</span>
            <div className="flex-1 h-5 bg-text-tertiary/10 rounded-sm overflow-hidden relative min-w-[60px]">
              <div className="h-full bg-[hsl(158_70%_28%)] rounded-sm" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-text-primary shrink-0 w-8 text-right">{b.types}</span>
          </div>
        );
      })}
    </div>
  );
}

// Real materials list with quantity + family color swatch
function MaterialsList() {
  const max = Math.max(...MOCK_MATERIALS.map(m => m.qty / (m.unit === 'kg' ? 50 : 1)));
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto">
      {MOCK_MATERIALS.map(m => {
        const normalized = m.qty / (m.unit === 'kg' ? 50 : 1);
        const pct = (normalized / max) * 100;
        return (
          <div key={m.name} className="flex items-center gap-2 text-[12px]">
            <span className="h-3 w-3 rounded-sm shrink-0 border border-black/10" style={{ background: m.color }} />
            <span className="text-text-primary text-[12px] shrink-0 truncate">{m.name}</span>
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-mono shrink-0">{m.family}</span>
            <div className="flex-1 h-4 bg-text-tertiary/10 rounded-sm overflow-hidden min-w-[40px]">
              <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: m.color, opacity: 0.7 }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-text-primary shrink-0">{m.qty.toLocaleString()} {m.unit}</span>
          </div>
        );
      })}
    </div>
  );
}

function LineageStrip() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 text-[12px]">
      <Item k="Uploader" v="edkjo" icon={<Users className="h-3 w-3" />} />
      <Item k="Last modified" v="2026-05-18 14:35" icon={<GitBranch className="h-3 w-3" />} />
      <Item k="Application" v="Revit 2024" icon={<Wrench className="h-3 w-3" />} />
      <Item k="Discipline" v="ARK" />
      <Item k="Version" v="V3 of 3" />
      <Item k="Schema" v="IFC4" />
      <Item k="Federated into" v="3 viewer groups" />
      <Item k="Linked drawings" v="12 sheets" icon={<FileText className="h-3 w-3" />} />
      <Item k="Issues on objects" v="— pending" emDash />
      <Item k="Claims" v="7" />
      <Item k="Annotations" v="— pending" emDash />
      <Item k="Last federated" v="2026-05-18 14:40" />
    </div>
  );
}
function Item({ k, v, icon, emDash }: { k: string; v: string; icon?: React.ReactNode; emDash?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      {icon && <span className="text-text-tertiary shrink-0 self-center">{icon}</span>}
      <span className="text-text-tertiary text-[10px] uppercase tracking-wider font-mono shrink-0">{k}</span>
      <span className={cn('truncate text-[12px] font-medium', emDash && 'text-amber-600')}>{v}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Layouts
// ════════════════════════════════════════════════════════════════════════════

function LayoutV1({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <StatusRibbon />
      <div style={{ ...GRID13, height: 460 }}>
        <Pane span={8}><Title>3D viewer</Title><Viewer /></Pane>
        <Pane span={5}>
          <Title right="10 signals">IFC health</Title>
          <div className="flex-1 min-h-0"><IfcHealthCluster columns={2} /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={5}>
          <Title>Storeys + canonical verification</Title>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </Pane>
        <Pane span={5}>
          <Title right={`${EIR_MET} of ${EIR_TOTAL}`}>EIR fulfillment</Title>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </Pane>
        <Pane span={3}>
          <Title>Elements</Title>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </Pane>
      </div>
    </div>
  );
}

function LayoutV2({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <StatusRibbon />
      <div style={{ ...GRID13, height: 460 }}>
        <Pane span={8}><Title>3D viewer</Title><Viewer /></Pane>
        <Pane span={5}>
          <Title>Model state</Title>
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div>
              <div className="text-[clamp(2.5rem,4vw,3.5rem)] font-semibold tabular-nums leading-none">
                {EIR_MET}<span className="text-text-tertiary text-[55%]"> / {EIR_TOTAL}</span>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-text-tertiary mt-1">EIR requirements met</div>
            </div>
            <div className="grid grid-cols-2 gap-2 auto-rows-min">
              <Tile icon={<Shapes className="h-3.5 w-3.5" />} label="Types" value={MOCK_TYPES.length} sub="298 used · 14 unused" />
              <Tile icon={<HelpCircle className="h-3.5 w-3.5" />} label="Untyped" value={3} suffix="%" fraction sub="37 instances" tone="good" />
              <Tile icon={<Unlink className="h-3.5 w-3.5" />} label="Orphans" value={12} sub="0.4% outside tree" tone="warn" />
              <Tile icon={<Flag className="h-3.5 w-3.5" />} label="Attention" value={MOCK_ATTENTION.length} sub="3 flagged · 7 warnings" tone="warn" />
            </div>
          </div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 260 }}>
        <Pane span={13}>
          <Title right="10 signals">IFC health</Title>
          <div className="flex-1 min-h-0"><IfcHealthCluster columns={5} /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={5}>
          <Title>Elements</Title>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </Pane>
        <Pane span={5}>
          <Title>NS3451 classification</Title>
          <ClassificationBars />
        </Pane>
        <Pane span={3}>
          <Title>Materials</Title>
          <MaterialsList />
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={8}>
          <Title>Storeys + canonical verification</Title>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </Pane>
        <Pane span={5}>
          <Title>MMI distribution</Title>
          <MmiBar />
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={8}>
          <Title right={`${MOCK_ATTENTION.length} items`}>Attention</Title>
          <div className="flex-1 min-h-0"><AttentionFeed /></div>
        </Pane>
        <Pane span={5}>
          <Title right={`${EIR_MET}/${EIR_TOTAL}`}>EIR fulfillment</Title>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 180 }}>
        <Pane span={13}>
          <Title>Lineage + connections</Title>
          <div className="flex-1 min-h-0"><LineageStrip /></div>
        </Pane>
      </div>
    </div>
  );
}

function LayoutV3({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <StatusRibbon />
      <div style={{ ...GRID13, height: 460 }}>
        <Pane span={5}>
          <Title right={`${MOCK_ATTENTION.length} items`}>Needs attention</Title>
          <div className="flex-1 min-h-0"><AttentionFeed /></div>
        </Pane>
        <Pane span={8}><Title>3D viewer</Title><Viewer /></Pane>
      </div>
      <div style={{ ...GRID13, height: 260 }}>
        <Pane span={13}>
          <Title right="10 signals">IFC health</Title>
          <div className="flex-1 min-h-0"><IfcHealthCluster columns={5} /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={8}>
          <Title>Storeys + canonical verification</Title>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </Pane>
        <Pane span={5}>
          <Title>Elements</Title>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={8}>
          <Title right={`${EIR_MET}/${EIR_TOTAL}`}>EIR fulfillment</Title>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </Pane>
        <Pane span={5}>
          <Title>Lineage + connections</Title>
          <div className="flex-1 min-h-0"><LineageStrip /></div>
        </Pane>
      </div>
    </div>
  );
}

function LayoutV4({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <div className="text-center py-4 border-y border-line bg-surface rounded">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono">Model audit report</div>
        <div className="text-[clamp(1.3rem,2vw,1.75rem)] font-semibold mt-1">ARK-BuildingA-V3.ifc</div>
        <div className="text-[11px] text-text-tertiary mt-1">edkjo · 2026-05-18 · V3 of 3 · Revit 2024 · ARK · IFC4 · 42.7 MB</div>
      </div>
      <div style={{ ...GRID13, height: 220 }}>
        <Pane span={5}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono mb-2">§ 1 · State</div>
          <div className="flex flex-col justify-center flex-1 gap-2">
            <div className="text-[clamp(3rem,5vw,4rem)] font-semibold tabular-nums leading-none">{EIR_MET}<span className="text-text-tertiary text-[45%]"> / {EIR_TOTAL}</span></div>
            <div className="text-[11px] uppercase tracking-wider text-text-tertiary">EIR requirements met</div>
            <p className="text-[12px] text-text-secondary mt-2 leading-relaxed">{MOCK_TYPES.length} types across 1,204 instances on 5 storeys. {MOCK_ATTENTION.filter(a => a.kind === 'flag').length} flagged issues; {MOCK_ATTENTION.filter(a => a.kind === 'warn').length} warnings.</p>
          </div>
        </Pane>
        <Pane span={8}>
          <Title>Key signals</Title>
          <div className="grid grid-cols-4 gap-2 flex-1 min-h-0">
            <Tile icon={<Shapes className="h-3.5 w-3.5" />} label="Types" value={MOCK_TYPES.length} sub="298 used" />
            <Tile icon={<HelpCircle className="h-3.5 w-3.5" />} label="Untyped" value={3} suffix="%" fraction sub="37 instances" tone="good" />
            <Tile icon={<Hash className="h-3.5 w-3.5" />} label="Duplicate GUIDs" value={0} sub="must be 0" tone="good" />
            <Tile icon={<Globe className="h-3.5 w-3.5" />} label="CRS" value={0} valueLabel="No MapConv" sub="IfcProjectedCRS only" tone="warn" />
            <Tile icon={<ListChecks className="h-3.5 w-3.5" />} label="Pset coverage" value={71} suffix="%" fraction sub="required psets" tone="warn" />
            <Tile icon={<Library className="h-3.5 w-3.5" />} label="TypeBank match" value={38} suffix="%" fraction sub="cross-project" tone="warn" />
            <Tile icon={<Layers className="h-3.5 w-3.5" />} label="MappedItem" value={56} suffix="%" fraction sub="geometry reuse" />
            <Tile icon={<Unlink className="h-3.5 w-3.5" />} label="Orphans" value={12} sub="0.4% outside" tone="warn" />
          </div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 400 }}>
        <Pane span={8}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono mb-2">§ 2 · Composition</div>
          <Viewer />
        </Pane>
        <Pane span={5}>
          <Title>Elements</Title>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 280 }}>
        <Pane span={8}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono mb-2">§ 3 · Structure</div>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </Pane>
        <Pane span={5}>
          <Title>NS3451 classification</Title>
          <ClassificationBars />
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 320 }}>
        <Pane span={8}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono mb-2">§ 4 · Quality · EIR</div>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </Pane>
        <Pane span={5}>
          <Title right={`${MOCK_ATTENTION.length} items`}>Attention</Title>
          <div className="flex-1 min-h-0"><AttentionFeed /></div>
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 220 }}>
        <Pane span={5}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono mb-2">§ 5 · Maturity (MMI)</div>
          <MmiBar />
        </Pane>
        <Pane span={8}>
          <Title>Materials by quantity</Title>
          <MaterialsList />
        </Pane>
      </div>
      <div style={{ ...GRID13, height: 200 }}>
        <Pane span={13}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-mono mb-2">§ 6 · Lineage + connections</div>
          <div className="flex-1 min-h-0"><LineageStrip /></div>
        </Pane>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════════

type LayoutKey = 'v1' | 'v2' | 'v3' | 'v4';
const LAYOUTS: Array<{ key: LayoutKey; name: string; pitch: string }> = [
  { key: 'v1', name: 'Above-fold dense',   pitch: 'Single-screen: viewer + IFC health hero · storeys/EIR/elements row' },
  { key: 'v2', name: 'Story arc',          pitch: 'Multi-band narrative · one question per band · scrolls' },
  { key: 'v3', name: 'Coordinator',        pitch: 'Attention-first · IFC health · storeys + elements + EIR' },
  { key: 'v4', name: 'Audit report',       pitch: 'Top-to-bottom · single big EIR number leads · § markers' },
];

export default function ModelDashboards() {
  const [active, setActive] = useState<LayoutKey>('v1');

  const classColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const counts: Record<string, number> = {};
    for (const t of MOCK_TYPES) {
      const cls = (t.element_class || t.type_class.replace('Type', '')).replace('Ifc', '');
      counts[cls] = (counts[cls] || 0) + t.instance_count;
    }
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k], i) => { map[k] = PALETTE[i % PALETTE.length]; });
    return map;
  }, []);

  const Layout = active === 'v1' ? LayoutV1 : active === 'v2' ? LayoutV2 : active === 'v3' ? LayoutV3 : LayoutV4;

  return (
    <AppLayout>
      <div className="p-4 max-w-[1440px] mx-auto">
        {/* Toggle bar */}
        <div className="flex items-center gap-0 mb-4 border-b border-line">
          {LAYOUTS.map(l => (
            <button key={l.key} onClick={() => setActive(l.key)}
              className={cn(
                'px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                active === l.key
                  ? 'border-[hsl(158_70%_28%)] text-text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              )}>
              {l.name}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-text-tertiary truncate hidden md:block">
            {LAYOUTS.find(l => l.key === active)?.pitch}
          </span>
        </div>
        <Layout classColorMap={classColorMap} />
      </div>
    </AppLayout>
  );
}
