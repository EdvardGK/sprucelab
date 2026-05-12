/**
 * EIR rule registry.
 *
 * The Project EIR is a composed set of rules picked from this palette.
 * Each rule kind has its own typed configuration (re-using the `EirField`
 * shape from `eirConfig.ts`). The page renders the palette as a sidebar
 * (click to add) and the active rules as workspace cards.
 *
 * State is local-only for now (`useState` in the page). Persistence lands
 * with the Phase 7 BEP-backend restore — the on-the-wire shape is
 * intentionally close to `ProjectEirRule { kind, config, position }`.
 */
import {
  Activity,
  Boxes,
  Compass,
  FileSearch,
  Grid3x3,
  Hash,
  Landmark,
  Layers,
  Map,
  MapPin,
  Pin,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { EirField } from './eirConfig';

export type EirRuleKind =
  | 'crs'
  | 'basepoint'
  | 'control_point'
  | 'site_plan'
  | 'site_grid'
  | 'canonical_floors'
  | 'naming'
  | 'classification'
  | 'tagging'
  | 'mmi_lod'
  | 'ifc_schema'
  | 'custom_properties'
  | 'scopes'
  | 'disciplines'
  | 'parties';

export type EirRuleGroup = 'geometry' | 'scope' | 'standards';

export interface EirRuleDefinition {
  kind: EirRuleKind;
  title: string;
  /** One-line description shown in the palette. */
  blurb: string;
  group: EirRuleGroup;
  icon: LucideIcon;
  /** Form fields rendered inside the rule card. */
  fields: EirField[];
}

const NORWEGIAN_CRS_OPTIONS = [
  { value: 'euref89_ntm5', label: 'EUREF89 / NTM5', hint: 'EPSG:5105' },
  { value: 'euref89_ntm6', label: 'EUREF89 / NTM6', hint: 'EPSG:5106' },
  { value: 'euref89_ntm7', label: 'EUREF89 / NTM7', hint: 'EPSG:5107' },
  { value: 'euref89_ntm8', label: 'EUREF89 / NTM8', hint: 'EPSG:5108' },
  { value: 'euref89_ntm9', label: 'EUREF89 / NTM9', hint: 'EPSG:5109' },
  { value: 'euref89_ntm10', label: 'EUREF89 / NTM10', hint: 'EPSG:5110' },
  { value: 'euref89_ntm11', label: 'EUREF89 / NTM11', hint: 'EPSG:5111' },
  { value: 'euref89_ntm12', label: 'EUREF89 / NTM12', hint: 'EPSG:5112' },
  { value: 'euref89_ntm13', label: 'EUREF89 / NTM13', hint: 'EPSG:5113' },
  { value: 'euref89_ntm14', label: 'EUREF89 / NTM14', hint: 'EPSG:5114' },
  { value: 'euref89_utm32n', label: 'EUREF89 / UTM 32N', hint: 'EPSG:25832 — sør-Norge' },
  { value: 'euref89_utm33n', label: 'EUREF89 / UTM 33N', hint: 'EPSG:25833 — midt-Norge' },
  { value: 'euref89_utm35n', label: 'EUREF89 / UTM 35N', hint: 'EPSG:25835 — Finnmark' },
  { value: 'other', label: 'Other (manual EPSG)' },
];

const VERTICAL_DATUMS = [
  { value: 'nn2000', label: 'NN2000', hint: 'EPSG:5941 — current Norwegian normal null' },
  { value: 'nn1954', label: 'NN1954', hint: 'EPSG:5776 — legacy' },
  { value: 'evrf2007', label: 'EVRF2007', hint: 'EPSG:5621 — European vertical reference' },
  { value: 'egm96', label: 'EGM96', hint: 'EPSG:5773 — global geoid' },
  { value: 'egm2008', label: 'EGM2008', hint: 'EPSG:3855 — global geoid (high res)' },
];

export const EIR_RULES: EirRuleDefinition[] = [
  // ─── Geometry & Place ─────────────────────────────────────────
  {
    kind: 'crs',
    title: 'Coordinate reference system',
    blurb: 'Allowed horizontal CRS + vertical datum.',
    group: 'geometry',
    icon: Compass,
    fields: [
      {
        id: 'horizontal_crs',
        label: 'Allowed horizontal CRS',
        kind: 'multiselect',
        bepRole: 'BEP picks one as the project CRS.',
        hint: 'EUREF89 = ETRS89 (Norwegian alias). Backed by the EPSG database via pyproj.',
        options: NORWEGIAN_CRS_OPTIONS,
        defaultValue: ['euref89_ntm10'],
      },
      {
        id: 'vertical_datum',
        label: 'Allowed vertical datum',
        kind: 'multiselect',
        bepRole: 'BEP picks one for the project vertical reference.',
        options: VERTICAL_DATUMS,
        defaultValue: ['nn2000'],
      },
    ],
  },
  {
    kind: 'basepoint',
    title: 'Project basepoint',
    blurb: 'World-coordinate anchor for placement.',
    group: 'geometry',
    icon: MapPin,
    fields: [
      {
        id: 'required',
        label: 'Required',
        kind: 'toggle',
        defaultValue: true,
      },
      {
        id: 'address',
        label: 'Indicative address',
        kind: 'address',
        bepRole: 'BEP enters the resolved E/N/H.',
        hint: 'Adressesøk via Kartverket Geonorge. Lat/lon is informational only; BEP fills exact E/N/H per the chosen CRS.',
      },
      {
        id: 'position_tolerance_m',
        label: 'Position tolerance',
        kind: 'number',
        unit: 'm',
        min: 0,
        max: 5,
        step: 0.05,
        hint: 'Delivered placement must match within this radius.',
        defaultValue: 0.1,
      },
    ],
  },
  {
    kind: 'control_point',
    title: 'Project control point',
    blurb: 'Second reference anchoring rotation.',
    group: 'geometry',
    icon: Pin,
    fields: [
      {
        id: 'required',
        label: 'Required',
        kind: 'toggle',
        defaultValue: true,
      },
      {
        id: 'address',
        label: 'Indicative address',
        kind: 'address',
        bepRole: 'BEP enters the resolved E/N/H.',
      },
      {
        id: 'rotation_tolerance_deg',
        label: 'Rotation tolerance',
        kind: 'number',
        unit: '°',
        min: 0,
        max: 5,
        step: 0.05,
        hint: 'Delivered true-north must match within this angle.',
        defaultValue: 0.1,
      },
    ],
  },
  {
    kind: 'site_plan',
    title: 'Site model',
    blurb: 'Lokasjonsplan / fastmerker / site context.',
    group: 'geometry',
    icon: Map,
    fields: [
      {
        id: 'required',
        label: 'Required',
        kind: 'toggle',
        defaultValue: true,
      },
      {
        id: 'address',
        label: 'Site address',
        kind: 'address',
        hint: 'Adressesøk via Kartverket Geonorge. Anchors the site bounding box.',
      },
      {
        id: 'formats',
        label: 'Accepted formats',
        kind: 'multiselect',
        options: [
          { value: 'ifc', label: 'IFC (site model)' },
          { value: 'kof', label: 'KOF (fastmerker)' },
          { value: 'geojson', label: 'GeoJSON' },
          { value: 'dwg', label: 'DWG' },
        ],
        defaultValue: ['ifc'],
      },
    ],
  },
  {
    kind: 'site_grid',
    title: 'Project grid',
    blurb: 'Shared coordination grid axes + spacing.',
    group: 'geometry',
    icon: Grid3x3,
    fields: [
      {
        id: 'axis_format',
        label: 'Axis labels',
        kind: 'select',
        options: [
          { value: 'alpha_num', label: 'Letters × numbers (A1 / B2)' },
          { value: 'num_num', label: 'Numbers × numbers (1.1 / 1.2)' },
          { value: 'custom', label: 'Custom' },
        ],
        defaultValue: 'alpha_num',
      },
      {
        id: 'spacing_mode',
        label: 'Spacing rule',
        kind: 'select',
        options: [
          { value: 'free', label: 'Free (any spacing)' },
          { value: 'fixed', label: 'Fixed per project' },
          { value: 'modular', label: 'Modular increments' },
        ],
        defaultValue: 'free',
      },
    ],
  },
  {
    kind: 'canonical_floors',
    title: 'Canonical floors',
    blurb: 'Shared storey list with elevation tolerance.',
    group: 'geometry',
    icon: Layers,
    fields: [
      {
        id: 'elevation_tolerance_m',
        label: 'Elevation tolerance',
        kind: 'number',
        unit: 'm',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.05,
      },
      {
        id: 'block_on_deviation',
        label: 'Block publish on deviation',
        kind: 'toggle',
        hint: 'A model with a storey outside the canonical list + tolerance cannot be published.',
        defaultValue: true,
      },
    ],
  },

  // ─── Scope & Org ───────────────────────────────────────────────
  {
    kind: 'scopes',
    title: 'Federation scopes',
    blurb: 'Named federations driving viewer groups.',
    group: 'scope',
    icon: Boxes,
    fields: [
      {
        id: 'scope_kinds',
        label: 'Scope axes',
        kind: 'multiselect',
        options: [
          { value: 'building', label: 'Building (A / B / …)' },
          { value: 'outdoor_indoor', label: 'Outdoor / indoor' },
          { value: 'landscape', label: 'Landscape' },
          { value: 'infrastructure', label: 'Infrastructure' },
          { value: 'mep_split', label: 'MEP split' },
        ],
        defaultValue: ['building'],
      },
    ],
  },
  {
    kind: 'disciplines',
    title: 'Disciplines',
    blurb: 'Discipline codes + colors used everywhere.',
    group: 'scope',
    icon: Users,
    fields: [
      {
        id: 'convention',
        label: 'Convention',
        kind: 'select',
        options: [
          { value: 'no_default', label: 'Norwegian (ARK, RIB, RIV, …)' },
          { value: 'iso_19650_a', label: 'ISO 19650-2 Annex A' },
          { value: 'custom', label: 'Custom' },
        ],
        defaultValue: 'no_default',
      },
    ],
  },
  {
    kind: 'parties',
    title: 'Parties (Contract / Team / Lead)',
    blurb: 'Per-scope responsibility assignment.',
    group: 'scope',
    icon: Landmark,
    fields: [
      {
        id: 'assignments',
        label: 'Assignment kinds',
        kind: 'multiselect',
        options: [
          { value: 'contract', label: 'Contract' },
          { value: 'team', label: 'Team' },
          { value: 'lead', label: 'Lead modeler' },
        ],
        defaultValue: ['contract', 'lead'],
      },
    ],
  },

  // ─── Standards & Requirements ──────────────────────────────────
  {
    kind: 'classification',
    title: 'Classification system(s)',
    blurb: 'Which standards the project commits to.',
    group: 'standards',
    icon: FileSearch,
    fields: [
      {
        id: 'systems',
        label: 'Required systems',
        kind: 'multiselect',
        options: [
          { value: 'ns3451', label: 'NS 3451 (Norwegian building parts)' },
          { value: 'omniclass', label: 'OmniClass' },
          { value: 'uniclass', label: 'Uniclass 2015' },
          { value: 'ifc_classification_reference', label: 'IFC Pset_ClassificationReference' },
          { value: 'tfm', label: 'TFM (Tverrfaglig merkesystem)' },
        ],
        defaultValue: ['ns3451'],
      },
      {
        id: 'pset_required',
        label: 'Carry classification in IFC Pset',
        kind: 'toggle',
        hint: 'Require Pset_ClassificationReference on every instance.',
        defaultValue: true,
      },
    ],
  },
  {
    kind: 'tagging',
    title: 'Cross-system tagging',
    blurb: 'Tag schemas for cross-system identification.',
    group: 'standards',
    icon: Tags,
    fields: [
      {
        id: 'namespaces',
        label: 'Tag namespaces',
        kind: 'multiselect',
        options: [
          { value: 'discipline', label: 'Discipline tag' },
          { value: 'stage', label: 'Stage tag (FP / DP / UT)' },
          { value: 'lifecycle', label: 'Lifecycle tag' },
          { value: 'asset_id', label: 'Asset ID (FDV)' },
          { value: 'lci', label: 'LCI / EPD reference' },
        ],
        defaultValue: ['discipline', 'asset_id'],
      },
      {
        id: 'pset_carry',
        label: 'Carry tags in IFC Pset',
        kind: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    kind: 'mmi_lod',
    title: 'MMI / LOD matrix',
    blurb: 'Maturity per class per stage.',
    group: 'standards',
    icon: Activity,
    fields: [
      {
        id: 'system',
        label: 'System',
        kind: 'select',
        options: [
          { value: 'mmi_statsbygg', label: 'MMI (Statsbygg-veileder 2.0)' },
          { value: 'lod_aia', label: 'LOD (AIA E202)' },
          { value: 'ids_based', label: 'IDS-driven (buildingSMART)' },
        ],
        defaultValue: 'mmi_statsbygg',
      },
      {
        id: 'stages',
        label: 'Stages tracked',
        kind: 'multiselect',
        options: [
          { value: 'skisse', label: 'Skisse' },
          { value: 'forprosjekt', label: 'Forprosjekt' },
          { value: 'detaljprosjekt', label: 'Detaljprosjekt' },
          { value: 'utforelse', label: 'Utførelse' },
          { value: 'fdv', label: 'FDV' },
        ],
        defaultValue: ['forprosjekt', 'detaljprosjekt', 'utforelse'],
      },
    ],
  },
  {
    kind: 'ifc_schema',
    title: 'IFC schema',
    blurb: 'Allowed IFC versions + MVD profile.',
    group: 'standards',
    icon: Boxes,
    fields: [
      {
        id: 'versions',
        label: 'Allowed versions',
        kind: 'multiselect',
        options: [
          { value: 'ifc2x3', label: 'IFC2x3 TC1' },
          { value: 'ifc4', label: 'IFC4 Add2 TC1' },
          { value: 'ifc4x3', label: 'IFC4.3' },
        ],
        defaultValue: ['ifc4'],
      },
      {
        id: 'mvds',
        label: 'Allowed MVD profiles',
        kind: 'multiselect',
        options: [
          { value: 'reference_view', label: 'ReferenceView (tessellated)' },
          { value: 'design_transfer_view', label: 'DesignTransferView (parametric)' },
          { value: 'coordination_view', label: 'CoordinationView (legacy)' },
        ],
        defaultValue: ['reference_view'],
      },
      {
        id: 'validator_required',
        label: 'Must pass buildingSMART validator',
        kind: 'toggle',
        defaultValue: true,
      },
    ],
  },
  {
    kind: 'custom_properties',
    title: 'Custom properties (Psets)',
    blurb: 'Project-specific Pset values beyond Pset_*Common.',
    group: 'standards',
    icon: Wrench,
    fields: [
      {
        id: 'psets',
        label: 'Required Psets',
        kind: 'multiselect',
        options: [
          { value: 'pset_common', label: 'Pset_*Common defaults' },
          { value: 'acoustic_ns8175', label: 'AcousticClass (NS 8175)' },
          { value: 'fire_no', label: 'FireRating (Norsk klasse)' },
          { value: 'epd_lca', label: 'EPD / LCA reference' },
          { value: 'thermal', label: 'ThermalTransmittance' },
        ],
        defaultValue: ['pset_common'],
      },
    ],
  },
  {
    kind: 'naming',
    title: 'Naming conventions',
    blurb: 'Templates for models, drawings, types, materials.',
    group: 'standards',
    icon: Hash,
    fields: [
      {
        id: 'artifacts',
        label: 'Artifact kinds covered',
        kind: 'multiselect',
        options: [
          { value: 'models', label: 'Models (IFC)' },
          { value: 'drawings', label: 'Drawings (DWG/PDF/SVG)' },
          { value: 'documents', label: 'Documents' },
          { value: 'types', label: 'Type names (IFC)' },
          { value: 'materials', label: 'Material names' },
        ],
        defaultValue: ['models', 'drawings'],
      },
      {
        id: 'template_kind',
        label: 'Template kind',
        kind: 'select',
        options: [
          { value: 'iso_19650_a', label: 'ISO 19650-2 Annex A' },
          { value: 'regex', label: 'Custom regex' },
          { value: 'template_string', label: 'Custom template ({project}-{discipline}…)' },
        ],
        defaultValue: 'iso_19650_a',
      },
      {
        id: 'block_on_violation',
        label: 'Block publish on violation',
        kind: 'toggle',
        defaultValue: true,
      },
    ],
  },
];

export const EIR_RULE_BY_KIND: Record<EirRuleKind, EirRuleDefinition> =
  EIR_RULES.reduce(
    (acc, r) => {
      acc[r.kind] = r;
      return acc;
    },
    {} as Record<EirRuleKind, EirRuleDefinition>
  );

export const EIR_GROUP_LABELS: Record<EirRuleGroup, string> = {
  geometry: 'Geometry & Place',
  scope: 'Scope & Organization',
  standards: 'Standards & Requirements',
};

export const EIR_GROUP_ORDER: EirRuleGroup[] = ['geometry', 'scope', 'standards'];

/** Active rule instance — what the project actually committed to. */
export interface ActiveEirRule {
  /** Stable id for React keys / future persistence. */
  id: string;
  kind: EirRuleKind;
  /** Field-id → current value. Starts from `defaultValue` per field. */
  config: Record<string, unknown>;
}

export function makeActiveRule(kind: EirRuleKind): ActiveEirRule {
  const def = EIR_RULE_BY_KIND[kind];
  const config: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.defaultValue !== undefined) config[f.id] = f.defaultValue;
  }
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    config,
  };
}
