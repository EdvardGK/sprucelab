import { useMemo, useState } from 'react';
import {
  ClipboardCheck, Shapes, HelpCircle, Hash, Tags, Globe, ListChecks,
  Library, Unlink, Layers, CheckCircle2, AlertTriangle, Circle, Flag,
  GitBranch, Users, FileText, Wrench,
} from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { VerifiedStoreyChart } from '@/components/features/model-workspace/VerifiedStoreyChart';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { tokens } from '@/lib/design-tokens';
import { treemapLayout } from '@/lib/treemap';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import type {
  AnalysisStorey, AnalysisTypeRecord, ModelStoreyVerification,
} from '@/lib/api-types';

// ════════════════════════════════════════════════════════════════════════════
// MOCK DATA — shared across all four layouts
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
    storey_distribution: storeyDist.map(([storey, instance_count]) => ({
      storey, elevation: null, instance_count,
    })),
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

interface ModelHealth {
  duplicate_guid_count: number;
  predefined_userdef_pct: number;
  crs_present: boolean;
  map_conversion_present: boolean;
  required_pset_coverage_pct: number;
  typebank_match_pct: number;
  mapped_item_ratio_pct: number;
  unclassified_proxy_count: number;
}
const MOCK_HEALTH: ModelHealth = {
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
  { kind: 'warn', label: 'Type-merge candidates (Revit GUID drift)', count: 5 },
  { kind: 'info', label: 'Reuse ratio below project avg (1.8 vs 2.2)' },
  { kind: 'info', label: 'IfcMapConversion missing — federation may misalign' },
];

interface MmiBucket { level: number; types: number; }
const MOCK_MMI: MmiBucket[] = [
  { level: 100, types: 4 }, { level: 200, types: 38 }, { level: 300, types: 168 },
  { level: 400, types: 84 }, { level: 500, types: 18 },
];

interface NsBucket { code: string; name: string; types: number; }
const MOCK_NS3451: NsBucket[] = [
  { code: '221', name: 'Bærevegg', types: 48 },
  { code: '222', name: 'Ikke-bærevegg', types: 36 },
  { code: '232', name: 'Dekke', types: 32 },
  { code: '241', name: 'Dør', types: 38 },
  { code: '242', name: 'Vindu', types: 26 },
  { code: '262', name: 'Tak', types: 14 },
  { code: '281', name: 'Innredning', types: 50 },
];

interface MaterialQty { name: string; family: string; qty: number; unit: string; }
const MOCK_MATERIALS: MaterialQty[] = [
  { name: 'Concrete C35/45', family: 'concrete', qty: 324, unit: 'm³' },
  { name: 'Rebar B500NC',    family: 'steel',    qty: 16800, unit: 'kg' },
  { name: 'Gypsum board 13mm', family: 'gypsum',  qty: 1205, unit: 'm²' },
  { name: 'Mineral wool 100mm', family: 'insulation', qty: 892, unit: 'm²' },
  { name: 'Brick',           family: 'masonry',  qty: 410, unit: 'm²' },
  { name: 'Oak flooring',    family: 'wood',     qty: 224, unit: 'm²' },
];

// ════════════════════════════════════════════════════════════════════════════
// BUILDING BLOCKS — small components reused across the four layouts
// ════════════════════════════════════════════════════════════════════════════

const GRID13 = { display: 'grid', gridTemplateColumns: 'repeat(13, minmax(0, 1fr))', gap: 13 } as const;

function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary truncate">{children}</span>
      {right && <span className="font-mono text-[10px] text-text-tertiary tabular-nums shrink-0 ml-2">{right}</span>}
    </div>
  );
}

function ViewerPlaceholder({ label = '3D viewer' }: { label?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent_0,transparent_10px,rgba(0,0,0,0.04)_10px,rgba(0,0,0,0.04)_11px)] rounded border border-dashed border-line text-text-tertiary text-xs font-mono uppercase tracking-widest">
      {label}
    </div>
  );
}

function StatusRibbon() {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded border border-line bg-surface border-l-[3px] border-l-[hsl(158_70%_28%)]" style={{ height: 36 }}>
      <span className="font-semibold text-[12px]">ARK-BuildingA-V3.ifc</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary truncate">
        V3 of 3 · edkjo · 2026-05-18 14:21 · Revit 2024 · ARK · IFC4 · 42.7 MB · 3 viewer groups · 7 claims · — issues
      </span>
    </div>
  );
}

type Tone = 'good' | 'warn' | 'danger' | 'neutral';
const TONE: Record<Tone, { value: string; ring: string; icon: string }> = {
  good:    { value: 'text-[hsl(158_70%_28%)]', ring: 'ring-1 ring-[hsl(158_70%_28%/0.25)]', icon: 'text-[hsl(158_70%_28%)]' },
  warn:    { value: 'text-amber-600 dark:text-amber-400', ring: 'ring-1 ring-amber-400/40', icon: 'text-amber-500' },
  danger:  { value: 'text-red-600 dark:text-red-400', ring: 'ring-1 ring-red-400/50', icon: 'text-red-500' },
  neutral: { value: 'text-text-primary', ring: '', icon: 'text-text-tertiary' },
};

function Tile({ icon, label, value, suffix, fraction, sub, tone = 'neutral' }: {
  icon: React.ReactNode; label: string; value: string | number;
  suffix?: string; fraction?: boolean; sub?: string; tone?: Tone;
}) {
  const t = TONE[tone];
  const numeric = typeof value === 'number' ? useCountUp(value, { fraction }) : value;
  return (
    <div className={cn('rounded border border-line bg-surface px-2.5 py-2 flex flex-col justify-between min-h-0', t.ring)}>
      <div className="flex items-center justify-between text-text-tertiary">
        <span className="font-mono text-[9px] uppercase tracking-wider truncate">{label}</span>
        <span className={cn('shrink-0', t.icon)}>{icon}</span>
      </div>
      <div className={cn('text-[clamp(0.95rem,1.4vw,1.2rem)] font-semibold tabular-nums leading-none', t.value)}>
        {numeric}{suffix}
      </div>
      {sub && <div className="text-[10px] text-text-tertiary tabular-nums truncate">{sub}</div>}
    </div>
  );
}

function IfcHealthCluster({ columns = 2 }: { columns?: 2 | 5 }) {
  const totalInstances = MOCK_TYPES.reduce((s, t) => s + t.instance_count, 0);
  const untypedPct = 3;
  const orphanPct = (MOCK_VERIFICATION.orphan_count / MOCK_VERIFICATION.physical_total) * 100;
  const h = MOCK_HEALTH;
  return (
    <div className={cn('grid gap-[6px] h-full min-h-0', columns === 2 ? 'grid-cols-2' : 'grid-cols-5')}>
      <Tile icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="EIR fulfilled"
            value={`${EIR_MET}/${EIR_TOTAL}`} sub={`${((EIR_MET/EIR_TOTAL)*100).toFixed(0)}% met`}
            tone={EIR_MET/EIR_TOTAL >= 0.75 ? 'good' : EIR_MET/EIR_TOTAL >= 0.4 ? 'warn' : 'danger'} />
      <Tile icon={<Shapes className="h-3.5 w-3.5" />} label="Types" value={MOCK_TYPES.length}
            sub={`${totalInstances.toLocaleString()} instances`} />
      <Tile icon={<HelpCircle className="h-3.5 w-3.5" />} label="Untyped" value={untypedPct} suffix="%" fraction
            sub={`${Math.round(totalInstances*0.03)} instances`}
            tone={untypedPct < 5 ? 'good' : untypedPct < 15 ? 'warn' : 'danger'} />
      <Tile icon={<Hash className="h-3.5 w-3.5" />} label="Duplicate GUIDs" value={h.duplicate_guid_count}
            sub="must be 0" tone={h.duplicate_guid_count === 0 ? 'good' : 'danger'} />
      <Tile icon={<Tags className="h-3.5 w-3.5" />} label="USERDEFINED" value={h.predefined_userdef_pct} suffix="%" fraction
            sub="PredefinedType skip"
            tone={h.predefined_userdef_pct < 5 ? 'good' : h.predefined_userdef_pct < 20 ? 'warn' : 'danger'} />
      <Tile icon={<Globe className="h-3.5 w-3.5" />} label="CRS"
            value={h.crs_present ? (h.map_conversion_present ? 'OK' : 'No MapConv') : 'Missing'}
            sub={h.crs_present ? 'IfcProjectedCRS' : 'georef missing'}
            tone={h.crs_present && h.map_conversion_present ? 'good' : h.crs_present ? 'warn' : 'danger'} />
      <Tile icon={<ListChecks className="h-3.5 w-3.5" />} label="Pset coverage" value={h.required_pset_coverage_pct} suffix="%" fraction
            sub="required psets by class"
            tone={h.required_pset_coverage_pct >= 90 ? 'good' : h.required_pset_coverage_pct >= 60 ? 'warn' : 'danger'} />
      <Tile icon={<Library className="h-3.5 w-3.5" />} label="TypeBank match" value={h.typebank_match_pct} suffix="%" fraction
            sub="cross-project reuse"
            tone={h.typebank_match_pct >= 50 ? 'good' : h.typebank_match_pct >= 20 ? 'warn' : 'neutral'} />
      <Tile icon={<Layers className="h-3.5 w-3.5" />} label="MappedItem" value={h.mapped_item_ratio_pct} suffix="%" fraction
            sub="geometry reuse"
            tone={h.mapped_item_ratio_pct >= 50 ? 'good' : 'neutral'} />
      <Tile icon={<Unlink className="h-3.5 w-3.5" />} label="Orphans" value={MOCK_VERIFICATION.orphan_count}
            sub={`${orphanPct.toFixed(1)}% outside tree`}
            tone={MOCK_VERIFICATION.orphan_count === 0 ? 'good' : orphanPct < 5 ? 'warn' : 'danger'} />
    </div>
  );
}

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
    <div className="absolute inset-0">
      <div className="relative w-full h-full">
        {rects.map((r, i) => {
          const color = classColorMap[r.label] ?? PALETTE[i % PALETTE.length];
          const showLabel = (r.w / W) * 100 > 8 && (r.h / H) * 100 > 8;
          return (
            <div key={r.label} className="absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center p-px"
              style={{ left: `${(r.x/W)*100}%`, top: `${(r.y/H)*100}%`, width: `${(r.w/W)*100}%`, height: `${(r.h/H)*100}%`, background: color, opacity: 0.85 }}
              title={`${r.label}: ${r.value.toLocaleString()}`}>
              {showLabel && (<>
                <span className="text-[clamp(0.5rem,0.85vw,0.7rem)] font-medium text-white/95 leading-tight truncate max-w-full px-0.5">{r.label}</span>
                <span className="text-[clamp(0.45rem,0.75vw,0.6rem)] text-white/80 tabular-nums">{r.value.toLocaleString()}</span>
              </>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EirChecklist() {
  return (
    <ul className="flex flex-col gap-1 min-h-0 overflow-y-auto pr-1">
      {MOCK_EIR.map(r => {
        const icon = r.status === 'met'
          ? <CheckCircle2 className="h-3 w-3 text-[hsl(158_70%_28%)]" />
          : r.status === 'partial'
          ? <Circle className="h-3 w-3 text-amber-500 fill-amber-500/30" />
          : <AlertTriangle className="h-3 w-3 text-red-500" />;
        return (
          <li key={r.code} className="flex items-center gap-2 text-[11px] py-0.5">
            <span className="shrink-0">{icon}</span>
            <span className="font-mono text-[9px] uppercase text-text-tertiary tabular-nums shrink-0 w-12">{r.code}</span>
            <span className="flex-1 truncate text-text-secondary">{r.label}</span>
            {r.detail && <span className="text-[10px] text-text-tertiary tabular-nums shrink-0">{r.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function AttentionFeed({ limit }: { limit?: number }) {
  const items = limit ? MOCK_ATTENTION.slice(0, limit) : MOCK_ATTENTION;
  return (
    <ul className="flex flex-col gap-1 min-h-0 overflow-y-auto pr-1">
      {items.map((a, i) => {
        const pill = a.kind === 'flag'
          ? 'bg-red-500/10 text-red-600 border-red-400/40'
          : a.kind === 'warn'
          ? 'bg-amber-500/10 text-amber-600 border-amber-400/40'
          : 'bg-text-tertiary/10 text-text-tertiary border-line';
        return (
          <li key={i} className="flex items-center gap-2 text-[11px] py-0.5">
            <span className={cn('rounded-full px-1.5 py-0.5 border font-mono text-[9px] uppercase tracking-wide shrink-0', pill)}>{a.kind}</span>
            {a.count !== undefined && <span className="tabular-nums font-medium shrink-0">{a.count}</span>}
            <span className="flex-1 truncate text-text-secondary">{a.label}</span>
            {a.tag && <span className="font-mono text-[9px] text-text-tertiary uppercase shrink-0">{a.tag}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function MmiDistribution() {
  const total = MOCK_MMI.reduce((s, b) => s + b.types, 0);
  const tones = ['bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500', 'bg-emerald-600'];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 rounded overflow-hidden border border-line">
        {MOCK_MMI.map((b, i) => (
          <div key={b.level} className={tones[i]} style={{ width: `${(b.types / total) * 100}%` }} title={`MMI ${b.level}: ${b.types} types`} />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 text-[10px] tabular-nums text-text-tertiary">
        {MOCK_MMI.map((b, i) => (
          <div key={b.level} className="flex flex-col items-start">
            <span className={cn('inline-block h-2 w-2 rounded', tones[i])}></span>
            <span>MMI {b.level}</span>
            <span className="text-text-primary font-medium">{b.types}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassificationDistribution() {
  const max = Math.max(...MOCK_NS3451.map(b => b.types));
  return (
    <ul className="flex flex-col gap-1">
      {MOCK_NS3451.map(b => (
        <li key={b.code} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-[10px] text-text-tertiary tabular-nums w-8 shrink-0">{b.code}</span>
          <span className="flex-1 truncate text-text-secondary">{b.name}</span>
          <span className="h-1.5 rounded-full bg-text-tertiary/10 overflow-hidden flex-1 max-w-[120px]">
            <span className="block h-full bg-[hsl(158_70%_28%)]" style={{ width: `${(b.types / max) * 100}%` }}></span>
          </span>
          <span className="font-mono text-[10px] tabular-nums w-8 text-right text-text-primary">{b.types}</span>
        </li>
      ))}
    </ul>
  );
}

function MaterialsByQuantity() {
  return (
    <ul className="flex flex-col gap-1">
      {MOCK_MATERIALS.map(m => (
        <li key={m.name} className="flex items-center gap-2 text-[11px]">
          <span className="flex-1 truncate text-text-secondary">{m.name}</span>
          <span className="font-mono text-[10px] text-text-tertiary uppercase w-16 truncate">{m.family}</span>
          <span className="font-mono text-[10px] tabular-nums text-text-primary">{m.qty.toLocaleString()} {m.unit}</span>
        </li>
      ))}
    </ul>
  );
}

function LineageStrip() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2 text-[11px]">
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
      {icon && <span className="text-text-tertiary shrink-0">{icon}</span>}
      <span className="text-text-tertiary text-[10px] uppercase tracking-wider font-mono shrink-0">{k}</span>
      <span className={cn('truncate', emDash && 'text-amber-600')}>{v}</span>
    </div>
  );
}

function ScopedCard({ children, className, span, height }: { children: React.ReactNode; className?: string; span?: number; height?: number }) {
  return (
    <Card className={cn('card-accent-forest overflow-hidden', className)} style={{ gridColumn: span ? `span ${span}` : undefined, height }}>
      <CardContent className="p-3 h-full flex flex-col">{children}</CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT V1 — Above-fold dense (712px target)
// ════════════════════════════════════════════════════════════════════════════

function LayoutV1({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <StatusRibbon />
      {/* Hero · viewer 8 / IFC health 5 · 400px */}
      <div style={{ ...GRID13, height: 400 }}>
        <ScopedCard span={8}>
          <CardTitle>3D viewer · c8 · ≈2:1</CardTitle>
          <ViewerPlaceholder />
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle right="10 signals">IFC health · c5</CardTitle>
          <div className="flex-1 min-h-0"><IfcHealthCluster columns={2} /></div>
        </ScopedCard>
      </div>
      {/* Row 2 · Storeys 5 / EIR 5 / Elements treemap 3 · 254px */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={5}>
          <CardTitle>Storeys + canonical verification · c5</CardTitle>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle right={`${EIR_MET}/${EIR_TOTAL}`}>EIR fulfillment · c5</CardTitle>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </ScopedCard>
        <ScopedCard span={3}>
          <CardTitle>Elements · c3 · ≈1:1</CardTitle>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </ScopedCard>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT V2 — Story arc (scrolls past fold; each band answers one question)
// ════════════════════════════════════════════════════════════════════════════

function LayoutV2({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <StatusRibbon />
      {/* § 1 · Is it ready? — viewer + status hero · 400px */}
      <div style={{ ...GRID13, height: 400 }}>
        <ScopedCard span={8}>
          <CardTitle>§ 1 · Is it ready? · 3D viewer</CardTitle>
          <ViewerPlaceholder />
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>Model state</CardTitle>
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="text-[clamp(2rem,3vw,2.5rem)] font-semibold text-text-primary leading-none tabular-nums">{EIR_MET}<span className="text-text-tertiary text-[60%]"> / {EIR_TOTAL}</span></div>
            <div className="text-[11px] uppercase tracking-wider text-text-tertiary font-mono">EIR requirements met</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Tile icon={<Shapes className="h-3.5 w-3.5" />} label="Types" value={MOCK_TYPES.length} sub="298 used · 14 unused" />
              <Tile icon={<HelpCircle className="h-3.5 w-3.5" />} label="Untyped" value={3} suffix="%" fraction sub="37 instances" tone="good" />
              <Tile icon={<Unlink className="h-3.5 w-3.5" />} label="Orphans" value={12} sub="0.4% outside tree" tone="warn" />
              <Tile icon={<Flag className="h-3.5 w-3.5" />} label="Attention" value={MOCK_ATTENTION.length} sub="3 flagged · 7 warnings" tone="warn" />
            </div>
          </div>
        </ScopedCard>
      </div>
      {/* § 2 · Is it well-formed? · IFC health full-width row · 250px */}
      <div style={{ ...GRID13, height: 250 }}>
        <ScopedCard span={13}>
          <CardTitle right="10 signals">§ 2 · Is it well-formed? · IFC health</CardTitle>
          <div className="flex-1 min-h-0"><IfcHealthCluster columns={5} /></div>
        </ScopedCard>
      </div>
      {/* § 3 · What's in it? · composition · 254px */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={5}>
          <CardTitle>§ 3 · Elements · c5 ≈ 2:1</CardTitle>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>Classification · NS3451</CardTitle>
          <div className="flex-1 min-h-0 overflow-y-auto"><ClassificationDistribution /></div>
        </ScopedCard>
        <ScopedCard span={3}>
          <CardTitle>Materials by qty</CardTitle>
          <div className="flex-1 min-h-0 overflow-y-auto"><MaterialsByQuantity /></div>
        </ScopedCard>
      </div>
      {/* § 4 · How is it organized? · structure · 254px */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={8}>
          <CardTitle>§ 4 · Storeys + canonical verification</CardTitle>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>MMI distribution</CardTitle>
          <div className="flex-1 min-h-0 flex flex-col justify-center"><MmiDistribution /></div>
        </ScopedCard>
      </div>
      {/* § 5 · What needs attention? · 254px */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={8}>
          <CardTitle right={`${MOCK_ATTENTION.length} items`}>§ 5 · Attention</CardTitle>
          <div className="flex-1 min-h-0"><AttentionFeed /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle right={`${EIR_MET}/${EIR_TOTAL}`}>EIR fulfillment</CardTitle>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </ScopedCard>
      </div>
      {/* § 6 · Who owns it / what's connected? · 156px */}
      <div style={{ ...GRID13, height: 156 }}>
        <ScopedCard span={13}>
          <CardTitle>§ 6 · Lineage + connections</CardTitle>
          <div className="flex-1 min-h-0"><LineageStrip /></div>
        </ScopedCard>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT V3 — Coordinator's punch list (attention-first)
// ════════════════════════════════════════════════════════════════════════════

function LayoutV3({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      <StatusRibbon />
      {/* Hero · attention 5 / viewer 8 · 400px */}
      <div style={{ ...GRID13, height: 400 }}>
        <ScopedCard span={5}>
          <CardTitle right={`${MOCK_ATTENTION.length} items`}>Needs attention</CardTitle>
          <div className="flex-1 min-h-0"><AttentionFeed /></div>
        </ScopedCard>
        <ScopedCard span={8}>
          <CardTitle>3D viewer · highlights flagged elements</CardTitle>
          <ViewerPlaceholder />
        </ScopedCard>
      </div>
      {/* Row 2 · IFC health full-width · 250px */}
      <div style={{ ...GRID13, height: 250 }}>
        <ScopedCard span={13}>
          <CardTitle right="10 signals">IFC health</CardTitle>
          <div className="flex-1 min-h-0"><IfcHealthCluster columns={5} /></div>
        </ScopedCard>
      </div>
      {/* Row 3 · storeys 8 / elements 5 · 254px */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={8}>
          <CardTitle>Storeys + canonical verification</CardTitle>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>Elements</CardTitle>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </ScopedCard>
      </div>
      {/* Row 4 · EIR 8 / lineage 5 · 254px */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={8}>
          <CardTitle right={`${EIR_MET}/${EIR_TOTAL}`}>EIR fulfillment</CardTitle>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>Lineage + connections</CardTitle>
          <div className="flex-1 min-h-0"><LineageStrip /></div>
        </ScopedCard>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT V4 — Editorial report (top-to-bottom narrative)
// ════════════════════════════════════════════════════════════════════════════

function LayoutV4({ classColorMap }: { classColorMap: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-[13px]">
      {/* Cover */}
      <div className="text-center py-3 border-y border-line bg-surface rounded">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">Model audit report</div>
        <div className="text-[clamp(1.1rem,1.8vw,1.5rem)] font-semibold mt-1">ARK-BuildingA-V3.ifc</div>
        <div className="text-[11px] text-text-tertiary mt-1">edkjo · 2026-05-18 14:21 · V3 of 3 · Revit 2024 · ARK · IFC4 · 42.7 MB</div>
      </div>
      {/* § 1 State (200px) */}
      <div style={{ ...GRID13, height: 200 }}>
        <ScopedCard span={5}>
          <CardTitle>§ 1 · State</CardTitle>
          <div className="flex flex-col justify-center flex-1 gap-2">
            <div className="text-[clamp(2.5rem,4vw,3.5rem)] font-semibold tabular-nums leading-none">{EIR_MET}<span className="text-text-tertiary text-[50%]"> / {EIR_TOTAL}</span></div>
            <div className="text-[11px] uppercase tracking-wider text-text-tertiary font-mono">EIR requirements met</div>
            <div className="text-[12px] text-text-secondary mt-1">{MOCK_TYPES.length} types across 1,204 instances on 5 storeys. {MOCK_ATTENTION.filter(a => a.kind === 'flag').length} flagged issues; {MOCK_ATTENTION.filter(a => a.kind === 'warn').length} warnings.</div>
          </div>
        </ScopedCard>
        <ScopedCard span={8}>
          <CardTitle>Key signals</CardTitle>
          <div className="grid grid-cols-4 gap-2 flex-1 min-h-0">
            <Tile icon={<Shapes className="h-3.5 w-3.5" />} label="Types" value={MOCK_TYPES.length} sub="298 used" />
            <Tile icon={<HelpCircle className="h-3.5 w-3.5" />} label="Untyped" value={3} suffix="%" fraction sub="37 instances" tone="good" />
            <Tile icon={<Hash className="h-3.5 w-3.5" />} label="Duplicate GUIDs" value={0} sub="must be 0" tone="good" />
            <Tile icon={<Globe className="h-3.5 w-3.5" />} label="CRS" value="No MapConv" sub="IfcProjectedCRS only" tone="warn" />
            <Tile icon={<ListChecks className="h-3.5 w-3.5" />} label="Pset coverage" value={71} suffix="%" fraction sub="required psets" tone="warn" />
            <Tile icon={<Library className="h-3.5 w-3.5" />} label="TypeBank match" value={38} suffix="%" fraction sub="cross-project" tone="warn" />
            <Tile icon={<Layers className="h-3.5 w-3.5" />} label="MappedItem" value={56} suffix="%" fraction sub="geometry reuse" />
            <Tile icon={<Unlink className="h-3.5 w-3.5" />} label="Orphans" value={12} sub="0.4% outside" tone="warn" />
          </div>
        </ScopedCard>
      </div>
      {/* § 2 Composition (400px) */}
      <div style={{ ...GRID13, height: 400 }}>
        <ScopedCard span={8}>
          <CardTitle>§ 2 · Composition · 3D viewer</CardTitle>
          <ViewerPlaceholder label="figure 1 · 3D" />
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>Elements</CardTitle>
          <div className="flex-1 relative"><ElementsTreemap classColorMap={classColorMap} /></div>
        </ScopedCard>
      </div>
      {/* § 3 Structure (254px) */}
      <div style={{ ...GRID13, height: 254 }}>
        <ScopedCard span={8}>
          <CardTitle>§ 3 · Structure · Storeys with canonical verification</CardTitle>
          <div className="flex-1 min-h-0 overflow-hidden"><VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle>Classification (NS3451)</CardTitle>
          <div className="flex-1 min-h-0 overflow-y-auto"><ClassificationDistribution /></div>
        </ScopedCard>
      </div>
      {/* § 4 Quality (300px) */}
      <div style={{ ...GRID13, height: 300 }}>
        <ScopedCard span={8}>
          <CardTitle right={`${EIR_MET}/${EIR_TOTAL}`}>§ 4 · Quality · EIR fulfillment</CardTitle>
          <div className="flex-1 min-h-0"><EirChecklist /></div>
        </ScopedCard>
        <ScopedCard span={5}>
          <CardTitle right={`${MOCK_ATTENTION.length} items`}>Attention</CardTitle>
          <div className="flex-1 min-h-0"><AttentionFeed /></div>
        </ScopedCard>
      </div>
      {/* § 5 Maturity + Materials (200px) */}
      <div style={{ ...GRID13, height: 200 }}>
        <ScopedCard span={5}>
          <CardTitle>§ 5 · Maturity · MMI distribution</CardTitle>
          <div className="flex-1 min-h-0 flex flex-col justify-center"><MmiDistribution /></div>
        </ScopedCard>
        <ScopedCard span={8}>
          <CardTitle>Materials by quantity</CardTitle>
          <div className="flex-1 min-h-0 overflow-y-auto"><MaterialsByQuantity /></div>
        </ScopedCard>
      </div>
      {/* § 6 Lineage (160px) */}
      <div style={{ ...GRID13, height: 160 }}>
        <ScopedCard span={13}>
          <CardTitle>§ 6 · Lineage + connections</CardTitle>
          <div className="flex-1 min-h-0"><LineageStrip /></div>
        </ScopedCard>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE — toggle between the four layouts
// ════════════════════════════════════════════════════════════════════════════

type LayoutKey = 'v1' | 'v2' | 'v3' | 'v4';
const LAYOUTS: Array<{ key: LayoutKey; name: string; pitch: string }> = [
  { key: 'v1', name: 'V1 · Above-fold dense',    pitch: '712px · viewer + IFC health hero + storeys/EIR/elements row' },
  { key: 'v2', name: 'V2 · Story arc',           pitch: '6 bands · one BIM question per band · scrolls past fold' },
  { key: 'v3', name: 'V3 · Coordinator punch',   pitch: 'Attention-first · IFC health row · storeys/elements/EIR below' },
  { key: 'v4', name: 'V4 · Editorial report',    pitch: 'Top-to-bottom audit · § markers · single big EIR number leads' },
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
      <div className="p-[13px]">
        {/* Toggle strip */}
        <div className="flex items-center gap-1 mb-[13px] border-b border-line">
          {LAYOUTS.map(l => (
            <button key={l.key} onClick={() => setActive(l.key)}
              className={cn(
                'px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors',
                active === l.key
                  ? 'border-[hsl(158_70%_28%)] text-text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              )}>
              {l.name}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-tertiary truncate">
            {LAYOUTS.find(l => l.key === active)?.pitch}
          </span>
        </div>
        {/* Layout body */}
        <Layout classColorMap={classColorMap} />
      </div>
    </AppLayout>
  );
}
