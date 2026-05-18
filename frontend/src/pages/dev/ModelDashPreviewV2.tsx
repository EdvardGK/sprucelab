import { useMemo } from 'react';
import {
  ClipboardCheck,
  Shapes,
  HelpCircle,
  Hash,
  Tags,
  Globe,
  ListChecks,
  Library,
  Unlink,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Circle,
} from 'lucide-react';

import { VerifiedStoreyChart } from '@/components/features/model-workspace/VerifiedStoreyChart';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { tokens } from '@/lib/design-tokens';
import { treemapLayout } from '@/lib/treemap';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import type {
  AnalysisStorey,
  AnalysisTypeRecord,
  ModelStoreyVerification,
} from '@/lib/api-types';

// ─── Mock data ──────────────────────────────────────────────────────────────
//
// Same shape contract as v1; richer fields added to exercise IFC-expert tiles
// (PredefinedType USERDEFINED rate, IfcMappedItem ratio, etc). Everything
// here is hand-rolled and backend-free.

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
    mapped_item_count: i % 3 === 0 ? count : 0,
    mapped_source_count: i % 3 === 0 ? 1 : 0,
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

const MOCK_TYPES: AnalysisTypeRecord[] = [
  ...Array.from({ length: 84 }, (_, i) =>
    makeType(i, 'IfcWall', 2 + (i % 4), [['U01', 1], ['P01', 1], ['P02', i % 2]]),
  ),
  ...Array.from({ length: 32 }, (_, i) =>
    makeType(i, 'IfcSlab', 3 + (i % 3), [['P01', 1], ['P02', 2], ['P03', 1]]),
  ),
  ...Array.from({ length: 38 }, (_, i) =>
    makeType(i, 'IfcDoor', 4 + (i % 4), [['P01', 2], ['P02', 2], ['P03', 1]], {
      predefined_type: i % 5 === 0 ? 'USERDEFINED' : 'STANDARD',
    }),
  ),
  ...Array.from({ length: 26 }, (_, i) =>
    makeType(i, 'IfcWindow', 6 + (i % 3), [['P01', 3], ['P02', 3], ['P03', 1]]),
  ),
  ...Array.from({ length: 18 }, (_, i) =>
    makeType(i, 'IfcColumn', 4 + (i % 3), [['U01', 1], ['P01', 2], ['P02', 2]]),
  ),
  ...Array.from({ length: 24 }, (_, i) =>
    makeType(i, 'IfcBeam', 4 + (i % 4), [['P01', 2], ['P02', 2], ['P03', 1]]),
  ),
  ...Array.from({ length: 14 }, (_, i) =>
    makeType(i, 'IfcRailing', 3 + (i % 2), [['P02', 2], ['P03', 2]]),
  ),
  ...Array.from({ length: 6 }, (_, i) =>
    makeType(i, 'IfcStair', 2 + (i % 2), [['P01', 2], ['P02', 1]]),
  ),
  ...Array.from({ length: 20 }, (_, i) =>
    makeType(i, 'IfcCovering', 3 + (i % 3), [['P01', 2], ['P02', 2]]),
  ),
  ...Array.from({ length: 50 }, (_, i) =>
    makeType(i, 'IfcFurniture', 1 + (i % 3), [['P01', 1], ['P02', 1]], {
      predefined_type: i % 3 === 0 ? 'USERDEFINED' : 'NOTDEFINED',
    }),
  ),
];

const MOCK_STOREYS: AnalysisStorey[] = [
  { name: 'U01', elevation: -3.0, height: 3.0, element_count: 188 },
  { name: 'P01', elevation: 0.0, height: 3.2, element_count: 312 },
  { name: 'P02', elevation: 3.2, height: 3.0, element_count: 298 },
  { name: 'P03', elevation: 6.2, height: 3.0, element_count: 252 },
  { name: 'P04', elevation: 9.2, height: 3.2, element_count: 154 },
];

const MOCK_VERIFICATION: ModelStoreyVerification = {
  has_canonical: true,
  matched_count: 4,
  canonical_count: 5,
  tolerance_m: 0.25,
  orphan_count: 12,
  total_products: 1204,
  physical_total: 1148,
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

// IFC-expert signals not in the v1 component contract — added as a sibling
// "ModelHealth" payload. This is the shape we'd extract server-side once the
// backend agrees on a contract.
interface ModelHealth {
  duplicate_guid_count: number;       // IFC integrity invariant: must be 0
  predefined_userdef_pct: number;     // smell: types skipping the enum
  crs_present: boolean;               // IfcProjectedCRS declared
  map_conversion_present: boolean;    // IfcMapConversion declared
  required_pset_coverage_pct: number; // % elements with their canonical pset
  typebank_match_pct: number;         // % of types matching a TypeBankEntry
  mapped_item_ratio_pct: number;      // % geometry using IfcMappedItem
  unclassified_proxy_count: number;   // raw IfcProxy w/o type AND w/o NS3451
}
const MOCK_HEALTH: ModelHealth = {
  duplicate_guid_count: 0,
  predefined_userdef_pct: 14,
  crs_present: true,
  map_conversion_present: false,
  required_pset_coverage_pct: 71,
  typebank_match_pct: 38,
  mapped_item_ratio_pct: 56,
  unclassified_proxy_count: 3,
};

// EIR requirements — mocked. v1 will be sourced from the project EIR
// module (rule builder, ref memory `eir-is-a-rule-builder.md`).
interface EirRequirement {
  code: string;
  label: string;
  status: 'met' | 'missing' | 'partial';
  detail?: string;
}
const MOCK_EIR: EirRequirement[] = [
  { code: 'CRS-1',  label: 'Projected CRS declared',                   status: 'met' },
  { code: 'CRS-2',  label: 'IfcMapConversion to true-north',           status: 'missing' },
  { code: 'NS-1',   label: 'NS3451 codes on load-bearing elements',    status: 'partial', detail: '78%' },
  { code: 'PSET-1', label: 'Pset_WallCommon on all IfcWall',           status: 'partial', detail: '82%' },
  { code: 'PSET-2', label: 'Pset_DoorCommon on all IfcDoor',           status: 'met' },
  { code: 'PSET-3', label: 'Pset_SlabCommon on all IfcSlab',           status: 'partial', detail: '64%' },
  { code: 'TYP-1',  label: 'No untyped load-bearing elements',         status: 'met' },
  { code: 'TYP-2',  label: 'No raw IfcProxy without classification',   status: 'missing', detail: '3 found' },
  { code: 'NAM-1',  label: 'Type naming matches ARK_XXX_NNN regex',    status: 'partial', detail: '91%' },
  { code: 'MMI-1',  label: 'MMI ≥ 200 on all primary elements',        status: 'partial', detail: '88%' },
  { code: 'GEO-1',  label: 'Bounding box within 5 km of project origin', status: 'met' },
  { code: 'GUID-1', label: 'No duplicate GlobalIds',                   status: 'met' },
  { code: 'VER-1',  label: 'Verified by human reviewer',               status: 'missing' },
];

const EIR_MET = MOCK_EIR.filter(r => r.status === 'met').length;
const EIR_TOTAL = MOCK_EIR.length;

// ─── Tiles ──────────────────────────────────────────────────────────────────

type Tone = 'good' | 'warn' | 'danger' | 'neutral';

const TONE: Record<Tone, { value: string; ring: string; icon: string }> = {
  good:    { value: 'text-[hsl(158_70%_28%)]', ring: 'ring-1 ring-[hsl(158_70%_28%/0.25)]', icon: 'text-[hsl(158_70%_28%)]' },
  warn:    { value: 'text-amber-600 dark:text-amber-400', ring: 'ring-1 ring-amber-400/40', icon: 'text-amber-500' },
  danger:  { value: 'text-red-600 dark:text-red-400', ring: 'ring-1 ring-red-400/50', icon: 'text-red-500' },
  neutral: { value: 'text-text-primary', ring: '', icon: 'text-text-tertiary' },
};

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  fraction?: boolean;
  sub?: string;
  tone?: Tone;
}

function Tile({ icon, label, value, suffix, fraction, sub, tone = 'neutral' }: TileProps) {
  const t = TONE[tone];
  const numeric = typeof value === 'number' ? useCountUp(value, { fraction }) : value;
  return (
    <div className={cn(
      'rounded border border-line bg-surface px-2.5 py-2 flex flex-col justify-between min-h-0',
      t.ring,
    )}>
      <div className="flex items-center justify-between text-text-tertiary">
        <span className="font-mono text-[9px] uppercase tracking-wider truncate">{label}</span>
        <span className={cn('shrink-0', t.icon)}>{icon}</span>
      </div>
      <div className={cn('text-[clamp(1rem,1.6vw,1.25rem)] font-semibold tabular-nums leading-none', t.value)}>
        {numeric}{suffix}
      </div>
      {sub && <div className="text-[10px] text-text-tertiary tabular-nums truncate">{sub}</div>}
    </div>
  );
}

// ─── Elements treemap (lifted from v1) ──────────────────────────────────────

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
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
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
            <div key={r.label}
              className="absolute border border-black/30 overflow-hidden flex flex-col items-center justify-center p-px"
              style={{ left: `${pctX}%`, top: `${pctY}%`, width: `${pctW}%`, height: `${pctH}%`, background: color, opacity: 0.85 }}
              title={`${r.label}: ${r.value.toLocaleString()}`}>
              {showLabel && (
                <>
                  <span className="text-[clamp(0.5rem,0.85vw,0.7rem)] font-medium text-white/95 leading-tight truncate max-w-full px-0.5">{r.label}</span>
                  <span className="text-[clamp(0.45rem,0.75vw,0.6rem)] text-white/80 tabular-nums">{r.value.toLocaleString()}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EIR checklist ──────────────────────────────────────────────────────────

function EirChecklist({ requirements }: { requirements: EirRequirement[] }) {
  return (
    <ul className="flex flex-col gap-1 min-h-0 overflow-y-auto pr-1">
      {requirements.map(r => {
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

// ─── KPI cluster v2 — IFC-expert grade ──────────────────────────────────────

function IfcKpiCluster({ types, health, verification }: { types: AnalysisTypeRecord[]; health: ModelHealth; verification: ModelStoreyVerification }) {
  const totalInstances = types.reduce((s, t) => s + t.instance_count, 0);
  const untypedInstances = types.filter(t => t.is_untyped).reduce((s, t) => s + t.instance_count, 0);
  const untypedPct = totalInstances ? (untypedInstances / totalInstances) * 100 : 0;
  const orphanPct = verification.physical_total ? (verification.orphan_count / verification.physical_total) * 100 : 0;

  const eirPct = (EIR_MET / EIR_TOTAL) * 100;

  return (
    <div className="grid grid-cols-2 gap-[6px] h-full min-h-0">
      <Tile icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="EIR fulfilled"
            value={`${EIR_MET}/${EIR_TOTAL}`} sub={`${eirPct.toFixed(0)}% of project EIR`}
            tone={eirPct >= 75 ? 'good' : eirPct >= 40 ? 'warn' : 'danger'} />
      <Tile icon={<Shapes className="h-3.5 w-3.5" />} label="Types"
            value={types.length} sub={`${totalInstances.toLocaleString()} instances`} />
      <Tile icon={<HelpCircle className="h-3.5 w-3.5" />} label="Untyped"
            value={untypedPct} suffix="%" fraction
            sub={`${untypedInstances.toLocaleString()} instances`}
            tone={untypedPct === 0 ? 'good' : untypedPct < 5 ? 'warn' : 'danger'} />
      <Tile icon={<Hash className="h-3.5 w-3.5" />} label="Duplicate GUIDs"
            value={health.duplicate_guid_count} sub="IFC invariant: must be 0"
            tone={health.duplicate_guid_count === 0 ? 'good' : 'danger'} />
      <Tile icon={<Tags className="h-3.5 w-3.5" />} label="USERDEFINED"
            value={health.predefined_userdef_pct} suffix="%" fraction
            sub="PredefinedType skip rate"
            tone={health.predefined_userdef_pct < 5 ? 'good' : health.predefined_userdef_pct < 20 ? 'warn' : 'danger'} />
      <Tile icon={<Globe className="h-3.5 w-3.5" />} label="CRS"
            value={health.crs_present ? (health.map_conversion_present ? 'OK' : 'No MapConv') : 'Missing'}
            sub={health.crs_present ? 'IfcProjectedCRS · ' + (health.map_conversion_present ? 'IfcMapConversion' : 'no MapConversion') : 'georeferencing missing'}
            tone={health.crs_present && health.map_conversion_present ? 'good' : health.crs_present ? 'warn' : 'danger'} />
      <Tile icon={<ListChecks className="h-3.5 w-3.5" />} label="Pset coverage"
            value={health.required_pset_coverage_pct} suffix="%" fraction
            sub="required psets by class"
            tone={health.required_pset_coverage_pct >= 90 ? 'good' : health.required_pset_coverage_pct >= 60 ? 'warn' : 'danger'} />
      <Tile icon={<Library className="h-3.5 w-3.5" />} label="TypeBank match"
            value={health.typebank_match_pct} suffix="%" fraction
            sub="cross-project reuse"
            tone={health.typebank_match_pct >= 50 ? 'good' : health.typebank_match_pct >= 20 ? 'warn' : 'neutral'} />
      <Tile icon={<Layers className="h-3.5 w-3.5" />} label="MappedItem"
            value={health.mapped_item_ratio_pct} suffix="%" fraction
            sub="geometry reuse"
            tone={health.mapped_item_ratio_pct >= 50 ? 'good' : 'neutral'} />
      <Tile icon={<Unlink className="h-3.5 w-3.5" />} label="Orphans"
            value={verification.orphan_count} sub={`${orphanPct.toFixed(1)}% outside tree`}
            tone={verification.orphan_count === 0 ? 'good' : orphanPct < 5 ? 'warn' : 'danger'} />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ModelDashPreviewV2() {
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

  // 1440×900 above-fold budget — status 32 + hero 400 + row 254 + 2 gutters = 712.
  return (
    <div className="bg-background min-h-screen p-[13px]">
      <div className="mx-auto" style={{ maxWidth: 1440 }}>

        {/* Status strip — identity + provenance compressed into one wide ribbon */}
        <div className="flex items-center gap-3 px-3 py-2 mb-[13px] rounded border border-line bg-surface border-l-[3px] border-l-[hsl(158_70%_28%)]"
             style={{ height: 32 }}>
          <span className="font-semibold text-[12px]">ARK-BuildingA-V3.ifc</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            V3 of 3 · edkjo · 2026-05-18 14:21 · Revit 2024 · ARK · IFC4 · 42.7 MB · 3 viewer groups · 7 claims · — issues
          </span>
        </div>

        {/* Hero · 400px · viewer 8 / KPI cluster 5 */}
        <div className="grid gap-[13px] mb-[13px]"
             style={{ height: 400, gridTemplateColumns: 'repeat(13, 1fr)' }}>
          <Card className="card-accent-forest overflow-hidden" style={{ gridColumn: 'span 8' }}>
            <CardContent className="p-3 h-full flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">3D viewer · c8 · ≈2:1</div>
              <div className="flex-1 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent_0,transparent_10px,rgba(0,0,0,0.04)_10px,rgba(0,0,0,0.04)_11px)] rounded border border-dashed border-line text-text-tertiary text-xs font-mono uppercase tracking-widest">
                viewer placeholder
              </div>
            </CardContent>
          </Card>

          <Card className="card-accent-forest overflow-hidden" style={{ gridColumn: 'span 5' }}>
            <CardContent className="p-3 h-full flex flex-col">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  IFC health · 10 signals · c5
                </span>
                <span className="font-mono text-[9px] text-text-tertiary">5 × 2</span>
              </div>
              <div className="flex-1 min-h-0">
                <IfcKpiCluster types={MOCK_TYPES} health={MOCK_HEALTH} verification={MOCK_VERIFICATION} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2 · 254px · Storeys 5 / EIR 5 / Elements treemap 3 */}
        <div className="grid gap-[13px]"
             style={{ height: 254, gridTemplateColumns: 'repeat(13, 1fr)' }}>
          <Card className="card-accent-forest overflow-hidden" style={{ gridColumn: 'span 5' }}>
            <CardContent className="p-3 h-full flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">Storeys + canonical verification · c5 · ≈2:1</div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <VerifiedStoreyChart storeys={MOCK_STOREYS} verification={MOCK_VERIFICATION} />
              </div>
            </CardContent>
          </Card>

          <Card className="card-accent-forest overflow-hidden" style={{ gridColumn: 'span 5' }}>
            <CardContent className="p-3 h-full flex flex-col">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  EIR fulfillment · c5 · ≈2:1
                </span>
                <span className="font-mono text-[10px] text-text-tertiary tabular-nums">{EIR_MET}/{EIR_TOTAL}</span>
              </div>
              <div className="flex-1 min-h-0">
                <EirChecklist requirements={MOCK_EIR} />
              </div>
            </CardContent>
          </Card>

          <Card className="card-accent-forest overflow-hidden" style={{ gridColumn: 'span 3' }}>
            <CardContent className="p-3 h-full flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">Elements · c3 · ≈1:1</div>
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
