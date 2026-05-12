/**
 * Canonical section list for the Project Config page. Each section
 * renders the EIR ↔ BEP ↔ Status triad per
 * `feedback-config-is-eir-bep-status-triad.md`:
 *
 * - `eirRequirement`: quoted text from the client's Exchange Information
 *   Requirements document. Read-only.
 * - `bepCommitment`: the project team's editable response.
 * - `consumption`: live status derived from actual project data.
 *
 * `state` is shown as a chip:
 * - 'live':       all three columns wired (EIR placeholder + real BEP + real Status)
 * - 'partial':    BEP form present but consumption is read-only / mocked
 * - 'planned':    placeholder triad; backend not yet wired
 */
export type SectionState = 'live' | 'partial' | 'planned';

export interface EirRequirement {
  /** The quoted requirement text. */
  text: string;
  /** Where in the EIR document this comes from. */
  sourceRef?: string;
  /** Whether the EIR doc has been imported (false = placeholder text). */
  imported?: boolean;
}

export interface SettingsSection {
  id: string;
  title: string;
  group: 'geometry' | 'scope' | 'standards';
  state: SectionState;
  /** Imperative one-liner — what this section controls. */
  scope: string;
  /** Plausible client-EIR text used as placeholder until real EIR is loaded. */
  eirRequirement: EirRequirement;
  /** Multi-line body describing what the BEP form will eventually do. */
  bepBody?: string[];
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
    eirRequirement: {
      text:
        'All models shall be delivered in a horizontal coordinate reference system matching the project location (typically ETRS89/NTM zone for Norwegian projects) and a vertical datum of NN2000. A clearly defined project basepoint AND a project control point shall be established to anchor both placement and rotation. Position tolerance: ±0.1 m. Rotation tolerance: ±0.1°.',
      sourceRef: 'EIR §4.2 — Geometric reference',
      imported: false,
    },
    bepBody: [
      'Horizontal CRS: full EPSG database via pyproj on the backend (not a fixed list); for Norwegian projects defaults to ETRS89/NTM zones 5–14 + UTM 32/33/35.',
      'Vertical CRS: NN2000 / NN1954 / EVRF2007 / EGM96 / EGM2008.',
      'Project basepoint (eastings + northings + orthometric height) + Project control point (second reference point). Both anchor placement AND rotation.',
      'GIS-style placement tool: pick the basepoint on a world map (OSM + precision basemap for the target country) with live world-coord + projected-coord readout.',
    ],
  },
  {
    id: 'project-grid',
    title: 'Project Grid',
    group: 'geometry',
    state: 'planned',
    scope:
      'BIM coordination grid — grid line definitions, labels, spacing, origin.',
    eirRequirement: {
      text:
        'A project coordination grid (axes A, B, C… × 1, 2, 3…) shall be defined and shared across all delivered models and drawings. Grid origin and spacing shall be agreed between disciplines at project setup.',
      sourceRef: 'EIR §4.3 — Coordination grid',
      imported: false,
    },
    bepBody: [
      'Define axis labels, spacing, and grid origin in project coordinates.',
      'On model upload, models can be snapped to the grid; the viewer renders the grid as a faint overlay.',
    ],
  },
  {
    id: 'site-model',
    title: 'Site Model',
    group: 'geometry',
    state: 'planned',
    scope:
      'Lokasjonsplan / basemap, site footprint, real-world context map.',
    eirRequirement: {
      text:
        'A site model (lokasjonsplan / fastmerker) shall be delivered georeferenced to the project CRS. It shall contain survey markers, site boundary, and contextual built environment to anchor disciplines spatially.',
      sourceRef: 'EIR §4.4 — Site model and site context',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'A canonical list of building floors (with codes, names, and absolute elevations) shall be defined at project setup and used consistently across all disciplines. Model storeys deviating from the canonical list shall be flagged and resolved before publish.',
      sourceRef: 'EIR §4.5 — Storey hierarchy',
      imported: false,
    },
  },

  // ─── Scope & Org ──────────────────────────────────────────────
  {
    id: 'scopes',
    title: 'Scopes',
    group: 'scope',
    state: 'planned',
    scope:
      'Federation rules — which models belong to which scope (multi-building, indoor/outdoor, A/B/C/landscape/infra).',
    eirRequirement: {
      text:
        'The project shall be decomposed into named scopes (e.g., Building A, Building B, Landscape, Infrastructure, Indoor MEP, Outdoor MEP). Each delivered model shall declare which scope(s) it belongs to. Federation rules per scope shall be defined for use in coordination views.',
      sourceRef: 'EIR §5.1 — Project scopes',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'Disciplines shall be named per Norwegian convention (ARK, RIB, RIV, RIE, RIBR, RIBfy, RIVA, RIG, LARK) and each model shall declare exactly one primary discipline. Discipline shall drive color coding and federation behavior across the platform.',
      sourceRef: 'EIR §5.2 — Disciplines',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'Responsibilities for each scope × discipline combination shall be assigned to named parties (Contract / Team / Lead) per ISO 19650-2 §5.2. EIR responses (BEP commitments) and deliverables shall be traceable to a responsible party.',
      sourceRef: 'EIR §5.3 — Roles and responsibilities',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'All building parts shall be classified per NS 3451:2009 (Norwegian standard for building part classification). Where IFC-native classification references are available (Pset_ClassificationReference), they shall additionally be populated.',
      sourceRef: 'EIR §6.1 — Classification',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'Required Modeling Maturity Index (MMI) per IFC class per project stage shall be specified per Statsbygg MMI-veileder 2.0 (or equivalent for non-Statsbygg projects). MMI level shall be embedded in each instance via Pset (typically Pset_NorwegianMMI or Pset_StatsbyggMMI).',
      sourceRef: 'EIR §6.2 — Maturity / Level of Detail',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'Models shall be delivered as IFC4 (or higher) using the ReferenceView MVD unless explicitly negotiated. Legacy IFC2x3 shall require client approval per delivery. Files shall validate against the buildingSMART IFC checker.',
      sourceRef: 'EIR §6.3 — IFC schema and MVD',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'Beyond the IFC Pset_*Common defaults (LoadBearing, IsExternal, FireRating, AcousticRating, ThermalTransmittance), additional project-specific properties shall be populated where applicable, including EPD references for LCA, fire classification per Norwegian regulation, and acoustic class per NS 8175.',
      sourceRef: 'EIR §6.4 — Property requirements',
      imported: false,
    },
    bepBody: [
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
    eirRequirement: {
      text:
        'All delivered artifacts (models, drawings, documents, types, materials) shall follow the naming convention defined in ISO 19650-2 Annex A.1, adapted to project codes. Naming violations shall block publish until resolved.',
      sourceRef: 'EIR §6.5 — Naming conventions',
      imported: false,
    },
    bepBody: [
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
