/**
 * Canonical section list for the Project Config page. Order defines
 * the left sub-nav order. Each section's `scope` describes what it
 * will configure when fully wired — these strings show as the
 * placeholder body text until each section's real form lands.
 *
 * `state` is shown as a small chip:
 * - 'live':       fully wired, real form, reads/writes backend
 * - 'partial':    real form but limited fields or read-only backend
 * - 'planned':    placeholder; backend not yet wired
 */
export type SectionState = 'live' | 'partial' | 'planned';

export interface SettingsSection {
  id: string;
  title: string;
  group: 'geometry' | 'scope' | 'standards';
  state: SectionState;
  /** Imperative one-liner — what this section controls. */
  scope: string;
  /** Multi-line body shown in the placeholder card until wired. */
  body?: string[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // ─── Geometry & Place ──────────────────────────────────────────
  {
    id: 'coordinates',
    title: 'Coordinates & Geometry',
    group: 'geometry',
    state: 'planned',
    scope:
      'Project CRS, basepoint, control point, true-north rotation, position + rotation tolerances.',
    body: [
      'Horizontal CRS: full EPSG database via pyproj on the backend (not a fixed list); for Norwegian projects defaults to ETRS89/NTM zones 5–14 + UTM 32/33/35.',
      'Vertical CRS: NN2000 / NN1954 / EVRF2007 / EGM96 / EGM2008.',
      'Project basepoint (eastings + northings + orthometric height) + Project control point (second reference point). Both anchor placement AND rotation.',
      'GIS-style placement tool: pick the basepoint on a world map (OSM + precision basemap for the target country) with live world-coord + projected-coord readout.',
      'Position tolerance (m) + rotation tolerance (deg) drive verification rules.',
    ],
  },
  {
    id: 'project-grid',
    title: 'Project Grid',
    group: 'geometry',
    state: 'planned',
    scope:
      'BIM coordination grid — grid line definitions, labels, spacing, origin.',
    body: [
      'Project grid is the coordination reference that drawings and models share. Defined by axis lines (A, B, C… × 1, 2, 3…), origin, and spacing.',
      'On import, models can be snapped to the grid; on viewer, the grid renders as a faint overlay.',
    ],
  },
  {
    id: 'site-model',
    title: 'Site Model',
    group: 'geometry',
    state: 'planned',
    scope:
      'Lokasjonsplan / basemap, site footprint, real-world context map.',
    body: [
      'Background basemap layered with OpenStreetMap + a precision source (Kartverket WMTS for Norway; Mapbox/Maptiler elsewhere).',
      'Upload of site model IFC (fastmerker + boundary). The site model anchors the federation visually.',
      'GIS-like overlay showing project footprint in real-world coordinates with live readout of cursor lat/lon + projected coords (via proj4js / pyproj transformations).',
    ],
  },
  {
    id: 'floors',
    title: 'Floors',
    group: 'geometry',
    state: 'live',
    scope:
      'Canonical floor list + elevation tolerance; per-model storey deviation gate.',
  },

  // ─── Scope & Org ──────────────────────────────────────────────
  {
    id: 'scopes',
    title: 'Scopes',
    group: 'scope',
    state: 'planned',
    scope:
      'Federation rules — which models belong to which scope (multi-building, indoor/outdoor, A/B/C/landscape/infra).',
    body: [
      'A scope defines a federation rule that picks the models loaded into one Viewer Group.',
      'Examples: "Building A" (all models tagged building=A), "Indoor MEP" (discipline ∈ {MEP, electrical} ∧ outdoor=false), "Infrastructure" (discipline=civil ∨ landscape=true).',
      'Scopes drive the FederatedViewer + filter expressions across the platform.',
    ],
  },
  {
    id: 'disciplines',
    title: 'Disciplines',
    group: 'scope',
    state: 'planned',
    scope:
      'Discipline definitions + colors used across viewer + tables.',
    body: [
      'Norwegian default: ARK, RIB, RIV, RIE, RIBR, RIBfy, RIVA, RIG, LARK.',
      'Each discipline gets a color used by the viewer color-by lens, filter chips, and table tinting.',
    ],
  },
  {
    id: 'parties',
    title: 'Parties',
    group: 'scope',
    state: 'planned',
    scope:
      'Who is responsible for what (Phase 7 org model — Contracts, Teams, Leads).',
    body: [
      'Each discipline + scope is assigned to a Contract / Team / Lead per ISO 19650.',
      'Drives EIR-response authoring + IDS export.',
    ],
  },

  // ─── Standards & Requirements ─────────────────────────────────
  {
    id: 'classification',
    title: 'Classification Systems',
    group: 'standards',
    state: 'planned',
    scope:
      'Primary + supporting classification systems (NS3451 / OmniClass / Uniclass / multi).',
    body: [
      'Names the contractual classification standard per project. Drives the Types v2 "Missing classification" KPI label + threshold.',
      'Multi-system supported (e.g., NS3451 + IFC built-in `IfcClassificationReference`).',
      'Per `feedback-classification-driven-by-eir.md`: never hardcoded; always comes from this setting (or the project\'s EIR document once that module lands).',
    ],
  },
  {
    id: 'mmi-lod',
    title: 'MMI / LOD Matrix',
    group: 'standards',
    state: 'planned',
    scope:
      'Required Modeling Maturity Index (Norway) or Level of Detail per IFC class × per stage.',
    body: [
      'Matrix: rows = IFC classes (Walls / Slabs / Columns / Beams / Doors / Windows / MEP …), columns = project stages (Skisse / Forprosjekt / Detaljprosjekt / Utførelse).',
      'Each cell = required MMI (200 / 300 / 350 / 400) or LOD (100 / 200 / 300 / 350 / 400).',
      'Drives verification: an MMI-200 wall in a stage that requires MMI-300 = flagged claim.',
    ],
  },
  {
    id: 'ifc-schema',
    title: 'IFC Schema',
    group: 'standards',
    state: 'planned',
    scope:
      'Required IFC schema version + MVD per project.',
    body: [
      'Versions: IFC2x3 / IFC4 / IFC4.3.',
      'MVD: ReferenceView (tessellated) or DesignTransferView (parametric).',
      'On model upload, the active schema is checked against this requirement.',
    ],
  },
  {
    id: 'custom-properties',
    title: 'Custom Properties',
    group: 'standards',
    state: 'planned',
    scope:
      'Additional required Pset values beyond Pset_*Common.',
    body: [
      'Per IFC class, declare custom psets/properties the modeler must fill (e.g., `Pset_NorwegianBuildings.AcousticClass`, `Pset_LCA.EPD_GUID`).',
      'Each becomes a row in the verification matrix; missing values surface as flagged claims.',
    ],
  },
  {
    id: 'naming',
    title: 'Naming Conventions',
    group: 'standards',
    state: 'planned',
    scope:
      'Naming rules for models, drawings, documents, types, materials.',
    body: [
      'Per-asset regex / template patterns (e.g., model: `^{project}-{discipline}-{stage}-{revision}\\.ifc$`).',
      'Validator surfaces violations in ClaimInbox so the modeler can fix or override.',
      'Defaults pulled from skiplum-reports + ISO 19650-2 Annex.',
    ],
  },
];

export const GROUP_LABELS: Record<SettingsSection['group'], string> = {
  geometry: 'Geometry & Place',
  scope: 'Scope & Organization',
  standards: 'Standards & Requirements',
};

export const GROUP_ORDER: SettingsSection['group'][] = [
  'geometry',
  'scope',
  'standards',
];
