/**
 * Material family taxonomy — sprucelab-native L1/L2 classification.
 *
 * Not sourced from a single external standard (research 2026-04-15 showed
 * no standard maps cleanly to designer-navigable material families). Instead,
 * we define our own L1 families and crosswalk outward to NS 9431, NPCR, CPV,
 * NS 3451, and HS. Norwegian defaults shipped, Standards Workspace (v1.3)
 * unlocks per-project configuration.
 *
 * See docs/plans/2026-04-15-13-00_Materials-Browser-PRD.md
 */

export type FamilyKey =
  | 'concrete'
  | 'masonry'
  | 'metal'
  | 'wood'
  | 'boards'
  | 'insulation'
  | 'glass'
  | 'membrane'
  | 'polymer'
  | 'finish'
  | 'composite'
  | 'technical'
  | 'other';

export interface FamilyDefinition {
  key: FamilyKey;
  labelKey: string;
  subtypes: SubtypeDefinition[];
  order: number;
}

export interface SubtypeDefinition {
  key: string;
  labelKey: string;
}

export const FAMILIES: FamilyDefinition[] = [
  {
    key: 'concrete',
    labelKey: 'materialBrowser.family.concrete',
    order: 1,
    subtypes: [
      { key: 'in_situ', labelKey: 'materialBrowser.subtype.concrete.inSitu' },
      { key: 'precast', labelKey: 'materialBrowser.subtype.concrete.precast' },
      { key: 'lightweight', labelKey: 'materialBrowser.subtype.concrete.lightweight' },
      { key: 'fibre_reinforced', labelKey: 'materialBrowser.subtype.concrete.fibreReinforced' },
      { key: 'low_carbon', labelKey: 'materialBrowser.subtype.concrete.lowCarbon' },
    ],
  },
  {
    key: 'masonry',
    labelKey: 'materialBrowser.family.masonry',
    order: 2,
    subtypes: [
      { key: 'brick', labelKey: 'materialBrowser.subtype.masonry.brick' },
      { key: 'block', labelKey: 'materialBrowser.subtype.masonry.block' },
      { key: 'stone', labelKey: 'materialBrowser.subtype.masonry.stone' },
    ],
  },
  {
    key: 'metal',
    labelKey: 'materialBrowser.family.metal',
    order: 3,
    subtypes: [
      { key: 'steel_structural', labelKey: 'materialBrowser.subtype.metal.steelStructural' },
      { key: 'steel_rebar', labelKey: 'materialBrowser.subtype.metal.steelRebar' },
      { key: 'steel_cold_formed', labelKey: 'materialBrowser.subtype.metal.steelColdFormed' },
      { key: 'stainless', labelKey: 'materialBrowser.subtype.metal.stainless' },
      { key: 'aluminium', labelKey: 'materialBrowser.subtype.metal.aluminium' },
      { key: 'copper', labelKey: 'materialBrowser.subtype.metal.copper' },
      { key: 'zinc', labelKey: 'materialBrowser.subtype.metal.zinc' },
    ],
  },
  {
    key: 'wood',
    labelKey: 'materialBrowser.family.wood',
    order: 4,
    subtypes: [
      { key: 'solid', labelKey: 'materialBrowser.subtype.wood.solid' },
      { key: 'glulam', labelKey: 'materialBrowser.subtype.wood.glulam' },
      { key: 'clt', labelKey: 'materialBrowser.subtype.wood.clt' },
      { key: 'lvl', labelKey: 'materialBrowser.subtype.wood.lvl' },
      { key: 'engineered', labelKey: 'materialBrowser.subtype.wood.engineered' },
      { key: 'treated', labelKey: 'materialBrowser.subtype.wood.treated' },
    ],
  },
  {
    key: 'boards',
    labelKey: 'materialBrowser.family.boards',
    order: 5,
    subtypes: [
      { key: 'gypsum_standard', labelKey: 'materialBrowser.subtype.boards.gypsumStandard' },
      { key: 'gypsum_wetroom', labelKey: 'materialBrowser.subtype.boards.gypsumWetroom' },
      { key: 'gypsum_fire', labelKey: 'materialBrowser.subtype.boards.gypsumFire' },
      { key: 'osb', labelKey: 'materialBrowser.subtype.boards.osb' },
      { key: 'plywood', labelKey: 'materialBrowser.subtype.boards.plywood' },
      { key: 'particleboard', labelKey: 'materialBrowser.subtype.boards.particleboard' },
      { key: 'cement_board', labelKey: 'materialBrowser.subtype.boards.cementBoard' },
    ],
  },
  {
    key: 'insulation',
    labelKey: 'materialBrowser.family.insulation',
    order: 6,
    subtypes: [
      { key: 'mineral_wool', labelKey: 'materialBrowser.subtype.insulation.mineralWool' },
      { key: 'glass_wool', labelKey: 'materialBrowser.subtype.insulation.glassWool' },
      { key: 'eps', labelKey: 'materialBrowser.subtype.insulation.eps' },
      { key: 'xps', labelKey: 'materialBrowser.subtype.insulation.xps' },
      { key: 'pir', labelKey: 'materialBrowser.subtype.insulation.pir' },
      { key: 'cellulose', labelKey: 'materialBrowser.subtype.insulation.cellulose' },
      { key: 'wood_fibre', labelKey: 'materialBrowser.subtype.insulation.woodFibre' },
      { key: 'aerogel', labelKey: 'materialBrowser.subtype.insulation.aerogel' },
    ],
  },
  {
    key: 'glass',
    labelKey: 'materialBrowser.family.glass',
    order: 7,
    subtypes: [
      { key: 'float', labelKey: 'materialBrowser.subtype.glass.float' },
      { key: 'laminated', labelKey: 'materialBrowser.subtype.glass.laminated' },
      { key: 'insulated_unit', labelKey: 'materialBrowser.subtype.glass.insulatedUnit' },
      { key: 'tempered', labelKey: 'materialBrowser.subtype.glass.tempered' },
    ],
  },
  {
    key: 'membrane',
    labelKey: 'materialBrowser.family.membrane',
    order: 8,
    subtypes: [
      { key: 'vapor_barrier', labelKey: 'materialBrowser.subtype.membrane.vaporBarrier' },
      { key: 'wetroom', labelKey: 'materialBrowser.subtype.membrane.wetroom' },
      { key: 'roof', labelKey: 'materialBrowser.subtype.membrane.roof' },
      { key: 'geotextile', labelKey: 'materialBrowser.subtype.membrane.geotextile' },
    ],
  },
  {
    key: 'polymer',
    labelKey: 'materialBrowser.family.polymer',
    order: 9,
    subtypes: [
      { key: 'pvc', labelKey: 'materialBrowser.subtype.polymer.pvc' },
      { key: 'pe', labelKey: 'materialBrowser.subtype.polymer.pe' },
      { key: 'pp', labelKey: 'materialBrowser.subtype.polymer.pp' },
      { key: 'epoxy', labelKey: 'materialBrowser.subtype.polymer.epoxy' },
    ],
  },
  {
    key: 'finish',
    labelKey: 'materialBrowser.family.finish',
    order: 10,
    subtypes: [
      { key: 'paint', labelKey: 'materialBrowser.subtype.finish.paint' },
      { key: 'tile', labelKey: 'materialBrowser.subtype.finish.tile' },
      { key: 'parquet', labelKey: 'materialBrowser.subtype.finish.parquet' },
      { key: 'linoleum', labelKey: 'materialBrowser.subtype.finish.linoleum' },
      { key: 'vinyl', labelKey: 'materialBrowser.subtype.finish.vinyl' },
      { key: 'carpet', labelKey: 'materialBrowser.subtype.finish.carpet' },
      { key: 'screed', labelKey: 'materialBrowser.subtype.finish.screed' },
    ],
  },
  {
    key: 'composite',
    labelKey: 'materialBrowser.family.composite',
    order: 11,
    subtypes: [
      { key: 'window', labelKey: 'materialBrowser.subtype.composite.window' },
      { key: 'door', labelKey: 'materialBrowser.subtype.composite.door' },
      { key: 'curtain_wall', labelKey: 'materialBrowser.subtype.composite.curtainWall' },
    ],
  },
  {
    key: 'technical',
    labelKey: 'materialBrowser.family.technical',
    order: 12,
    subtypes: [
      { key: 'sealant', labelKey: 'materialBrowser.subtype.technical.sealant' },
      { key: 'adhesive', labelKey: 'materialBrowser.subtype.technical.adhesive' },
      { key: 'mortar', labelKey: 'materialBrowser.subtype.technical.mortar' },
      { key: 'grout', labelKey: 'materialBrowser.subtype.technical.grout' },
    ],
  },
  {
    key: 'other',
    labelKey: 'materialBrowser.family.other',
    order: 99,
    subtypes: [],
  },
];

export const FAMILY_MAP = new Map<FamilyKey, FamilyDefinition>(
  FAMILIES.map((f) => [f.key, f]),
);

/**
 * Heuristic classifier: raw IFC material name → suggested family + subtype.
 *
 * Rules are keyword-match, case-insensitive, Norwegian + English. First match wins.
 * Designed to handle the common cases, not all cases. False positives are expected
 * and can be corrected by the user. Order matters — more specific rules before
 * more general ones (e.g., "lettbetong" before "betong").
 */
interface ClassifierRule {
  family: FamilyKey;
  subtype: string;
  keywords: string[];
}

const CLASSIFIER_RULES: ClassifierRule[] = [
  // Concrete — most specific first
  { family: 'concrete', subtype: 'lightweight', keywords: ['lettbetong', 'lightweight concrete', 'lwac'] },
  { family: 'concrete', subtype: 'fibre_reinforced', keywords: ['fibre reinforced', 'fiberarmert', 'frc'] },
  { family: 'concrete', subtype: 'low_carbon', keywords: ['lavkarbon', 'low carbon', 'low-carbon'] },
  { family: 'concrete', subtype: 'precast', keywords: ['prefab', 'precast', 'hollow core', 'hulldekke', 'hollowcore'] },
  { family: 'concrete', subtype: 'in_situ', keywords: ['betong', 'concrete', 'beton'] },

  // Metal — steel first, then rebar, then other metals
  { family: 'metal', subtype: 'steel_rebar', keywords: ['armering', 'rebar', 'reinforcement bar', 'kamstål'] },
  { family: 'metal', subtype: 'stainless', keywords: ['rustfritt', 'stainless', 'inox'] },
  { family: 'metal', subtype: 'steel_cold_formed', keywords: ['kaldformet', 'cold formed', 'cold-formed'] },
  { family: 'metal', subtype: 'steel_structural', keywords: ['konstruksjonsstål', 'structural steel', 'stål', 'steel'] },
  { family: 'metal', subtype: 'aluminium', keywords: ['aluminium', 'aluminum'] },
  { family: 'metal', subtype: 'copper', keywords: ['kobber', 'copper'] },
  { family: 'metal', subtype: 'zinc', keywords: ['sink', 'zink', 'zinc'] },

  // Wood
  { family: 'wood', subtype: 'clt', keywords: ['clt', 'massivtre', 'cross laminated', 'kl-tre'] },
  { family: 'wood', subtype: 'glulam', keywords: ['limtre', 'glulam', 'glued laminated'] },
  { family: 'wood', subtype: 'lvl', keywords: ['lvl', 'laminated veneer'] },
  { family: 'wood', subtype: 'treated', keywords: ['impregnert', 'treated', 'trykkimpregnert'] },
  { family: 'wood', subtype: 'engineered', keywords: ['kertopuu', 'parallam', 'microllam'] },
  { family: 'wood', subtype: 'solid', keywords: ['treverk', 'timber', 'wood', 'konstruksjonsvirke', 'tre'] },

  // Insulation — specific types before generic
  { family: 'insulation', subtype: 'glass_wool', keywords: ['glassull', 'glass wool', 'glasswool'] },
  { family: 'insulation', subtype: 'mineral_wool', keywords: ['mineralull', 'steinull', 'rockwool', 'glava', 'isover', 'mineral wool', 'stone wool'] },
  { family: 'insulation', subtype: 'eps', keywords: ['eps', 'isopor', 'expanded polystyrene'] },
  { family: 'insulation', subtype: 'xps', keywords: ['xps', 'extruded polystyrene', 'styrofoam'] },
  { family: 'insulation', subtype: 'pir', keywords: ['pir', 'polyisocyanurate', 'polyurethane', 'pur'] },
  { family: 'insulation', subtype: 'cellulose', keywords: ['cellulose', 'papirisolasjon'] },
  { family: 'insulation', subtype: 'wood_fibre', keywords: ['wood fibre', 'trefiber', 'woodfiber'] },
  { family: 'insulation', subtype: 'aerogel', keywords: ['aerogel'] },

  // Boards
  { family: 'boards', subtype: 'gypsum_wetroom', keywords: ['våtromsplate', 'gyproc aquaroc', 'wetroom board', 'glasroc'] },
  { family: 'boards', subtype: 'gypsum_fire', keywords: ['brannplate', 'fire board', 'fireproof gypsum'] },
  { family: 'boards', subtype: 'gypsum_standard', keywords: ['gips', 'gypsum', 'gypsum board', 'gipsplate', 'plasterboard'] },
  { family: 'boards', subtype: 'osb', keywords: ['osb', 'oriented strand board'] },
  { family: 'boards', subtype: 'plywood', keywords: ['kryssfiner', 'plywood'] },
  { family: 'boards', subtype: 'particleboard', keywords: ['sponplate', 'particleboard', 'chipboard'] },
  { family: 'boards', subtype: 'cement_board', keywords: ['sementbundet', 'cement board', 'aquapanel'] },

  // Glass
  { family: 'glass', subtype: 'insulated_unit', keywords: ['3-lags', 'triple glazed', 'double glazed', 'isolerglass', 'iso glass', 'igu'] },
  { family: 'glass', subtype: 'laminated', keywords: ['laminert glass', 'laminated glass', 'sikkerhetsglass'] },
  { family: 'glass', subtype: 'tempered', keywords: ['herdet glass', 'tempered glass', 'toughened'] },
  { family: 'glass', subtype: 'float', keywords: ['float glass', 'planglass', 'glass'] },

  // Masonry
  { family: 'masonry', subtype: 'brick', keywords: ['tegl', 'murstein', 'brick'] },
  { family: 'masonry', subtype: 'block', keywords: ['leca', 'lettklinker', 'block'] },
  { family: 'masonry', subtype: 'stone', keywords: ['natursteinm', 'granitt', 'granite', 'stone', 'stein'] },

  // Membrane
  { family: 'membrane', subtype: 'vapor_barrier', keywords: ['dampsperre', 'vapor barrier', 'vapour barrier', 'plastfolie'] },
  { family: 'membrane', subtype: 'wetroom', keywords: ['våtromsmembran', 'wetroom membrane', 'tetting bad'] },
  { family: 'membrane', subtype: 'roof', keywords: ['takbelegg', 'takmembran', 'roof membrane', 'pvc roof', 'epdm'] },
  { family: 'membrane', subtype: 'geotextile', keywords: ['fiberduk', 'geotextile', 'geomembran'] },

  // Polymer
  { family: 'polymer', subtype: 'pvc', keywords: ['pvc'] },
  { family: 'polymer', subtype: 'pe', keywords: ['polyetylen', 'polyethylene', 'pe-rør', 'hdpe', 'ldpe'] },
  { family: 'polymer', subtype: 'pp', keywords: ['polypropylene', 'polypropylen'] },
  { family: 'polymer', subtype: 'epoxy', keywords: ['epoxy', 'epoksy'] },

  // Finish
  { family: 'finish', subtype: 'paint', keywords: ['maling', 'paint', 'lakk'] },
  { family: 'finish', subtype: 'tile', keywords: ['flis', 'tile', 'fliser', 'keramisk'] },
  { family: 'finish', subtype: 'parquet', keywords: ['parkett', 'parquet'] },
  { family: 'finish', subtype: 'linoleum', keywords: ['linoleum'] },
  { family: 'finish', subtype: 'vinyl', keywords: ['vinyl', 'vinylgulv'] },
  { family: 'finish', subtype: 'carpet', keywords: ['teppe', 'carpet'] },
  { family: 'finish', subtype: 'screed', keywords: ['avretting', 'screed', 'påstøp'] },

  // Composite
  { family: 'composite', subtype: 'window', keywords: ['vindu', 'window'] },
  { family: 'composite', subtype: 'door', keywords: ['dør', 'door'] },
  { family: 'composite', subtype: 'curtain_wall', keywords: ['curtain wall', 'glassfasade', 'facade system'] },

  // Technical
  { family: 'technical', subtype: 'sealant', keywords: ['fugemasse', 'sealant', 'silicone', 'silikon'] },
  { family: 'technical', subtype: 'adhesive', keywords: ['lim', 'adhesive', 'glue'] },
  { family: 'technical', subtype: 'mortar', keywords: ['mørtel', 'mortar'] },
  { family: 'technical', subtype: 'grout', keywords: ['fug', 'grout'] },
];

export interface ClassificationResult {
  family: FamilyKey;
  subtype: string | null;
  confidence: 'confirmed' | 'suggested' | 'unknown';
}

export function classifyMaterialName(name: string | null | undefined): ClassificationResult {
  if (!name) {
    return { family: 'other', subtype: null, confidence: 'unknown' };
  }

  const normalized = name.toLowerCase();

  for (const rule of CLASSIFIER_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        return {
          family: rule.family,
          subtype: rule.subtype,
          confidence: 'suggested',
        };
      }
    }
  }

  return { family: 'other', subtype: null, confidence: 'unknown' };
}

/**
 * Maps legacy Enova MATERIAL_CATEGORY_CHOICES keys (from the old backend enum)
 * to the new sprucelab-native L1 families. Used when a Material has a category
 * field populated from the old enum. No data migration — this is just a read
 * projection.
 */
export const LEGACY_CATEGORY_TO_FAMILY: Record<string, { family: FamilyKey; subtype: string | null }> = {
  // Structural
  steel_structural: { family: 'metal', subtype: 'steel_structural' },
  rebar: { family: 'metal', subtype: 'steel_rebar' },
  concrete_cast: { family: 'concrete', subtype: 'in_situ' },
  concrete_hollowcore: { family: 'concrete', subtype: 'precast' },
  wood_glulam: { family: 'wood', subtype: 'glulam' },
  wood_clt: { family: 'wood', subtype: 'clt' },
  wood_structural: { family: 'wood', subtype: 'solid' },
  wood_treated: { family: 'wood', subtype: 'treated' },
  // Boards
  gypsum_standard: { family: 'boards', subtype: 'gypsum_standard' },
  gypsum_wetroom: { family: 'boards', subtype: 'gypsum_wetroom' },
  osb: { family: 'boards', subtype: 'osb' },
  chipboard: { family: 'boards', subtype: 'particleboard' },
  // Insulation
  mineral_wool_inner: { family: 'insulation', subtype: 'mineral_wool' },
  mineral_wool_outer: { family: 'insulation', subtype: 'mineral_wool' },
  mineral_wool_roof: { family: 'insulation', subtype: 'mineral_wool' },
  glass_wool: { family: 'insulation', subtype: 'glass_wool' },
  insulation_eps: { family: 'insulation', subtype: 'eps' },
  insulation_xps: { family: 'insulation', subtype: 'xps' },
  // Finishes
  paint_interior: { family: 'finish', subtype: 'paint' },
  paint_exterior: { family: 'finish', subtype: 'paint' },
  tile_ceramic: { family: 'finish', subtype: 'tile' },
  tile_adhesive: { family: 'technical', subtype: 'adhesive' },
  parquet: { family: 'finish', subtype: 'parquet' },
  linoleum: { family: 'finish', subtype: 'linoleum' },
  vinyl: { family: 'finish', subtype: 'vinyl' },
  carpet: { family: 'finish', subtype: 'carpet' },
  screed: { family: 'finish', subtype: 'screed' },
  // Membranes
  vapor_barrier: { family: 'membrane', subtype: 'vapor_barrier' },
  wetroom_membrane: { family: 'membrane', subtype: 'wetroom' },
  pvc_roof: { family: 'membrane', subtype: 'roof' },
  // Windows/Doors
  window: { family: 'composite', subtype: 'window' },
  door_interior: { family: 'composite', subtype: 'door' },
  glass_facade: { family: 'composite', subtype: 'curtain_wall' },
  glass_wall_interior: { family: 'glass', subtype: 'float' },
  // Masonry
  block_lightweight: { family: 'masonry', subtype: 'block' },
  brick: { family: 'masonry', subtype: 'brick' },
  // Other
  aggregate: { family: 'masonry', subtype: 'stone' },
  aluminium: { family: 'metal', subtype: 'aluminium' },
  copper: { family: 'metal', subtype: 'copper' },
  pvc_pipe: { family: 'polymer', subtype: 'pvc' },
  pe_pipe: { family: 'polymer', subtype: 'pe' },
  other: { family: 'other', subtype: null },
};

export function resolveFamily(
  rawName: string | null | undefined,
  legacyCategory: string | null | undefined,
): ClassificationResult {
  if (legacyCategory && legacyCategory in LEGACY_CATEGORY_TO_FAMILY) {
    const mapped = LEGACY_CATEGORY_TO_FAMILY[legacyCategory];
    return {
      family: mapped.family,
      subtype: mapped.subtype,
      confidence: 'confirmed',
    };
  }
  return classifyMaterialName(rawName);
}
