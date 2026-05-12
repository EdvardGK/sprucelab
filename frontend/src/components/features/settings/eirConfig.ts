/**
 * Field-level schema for the EIR column "configurator" (vs prose).
 *
 * Per `feedback-config-is-eir-bep-status-triad.md` the EIR column is not a
 * static quote — it parameterises *which* fields the BEP must answer. A
 * section that has an `eirFields` config renders editable controls; sections
 * without it fall back to the prose blockquote (transitional).
 *
 * State is local-only for now; backend persistence lands in Phase 7
 * (BEP-backend restore). The shape is intentionally close to the eventual
 * `ProjectEirRequirement` model so the wiring is a thin layer.
 */
export type EirFieldKind =
  | 'toggle'         // boolean — is this requirement active?
  | 'select'         // pick one from options
  | 'multiselect'    // pick zero+ from options
  | 'number'         // numeric tolerance / count
  | 'text';          // freeform clause (rare — last-resort)

export interface EirOption {
  value: string;
  label: string;
  hint?: string;
}

export interface EirField {
  id: string;
  label: string;
  kind: EirFieldKind;
  /** What the BEP author sees when they fill in their commitment. */
  bepRole?: string;
  /** Short helper shown under the control. */
  hint?: string;
  /** For select/multiselect. */
  options?: EirOption[];
  /** For number. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Default value if the user hasn't edited yet. */
  defaultValue?: string | number | boolean | string[];
}

/**
 * Pilot configurator: "Coordinates & Geometry".
 * Other sections still render the prose blockquote until they get an
 * `eirFields` config of their own.
 */
export const SECTION_EIR_FIELDS: Record<string, EirField[]> = {
  coordinates: [
    {
      id: 'horizontal_crs',
      label: 'Allowed horizontal CRS',
      kind: 'multiselect',
      bepRole: 'BEP picks one as the project CRS.',
      hint: 'EUREF89 = ETRS89 (Norwegian alias). Backed by the EPSG database via pyproj on the backend; this list narrows the project picker.',
      options: [
        // EUREF89/NTM — Norwegian Transverse Mercator zones 5–14 (each one degree wide, central meridian = zone number).
        { value: 'euref89_ntm5', label: 'EUREF89 / NTM5', hint: 'EPSG:5105 — central meridian 5°E' },
        { value: 'euref89_ntm6', label: 'EUREF89 / NTM6', hint: 'EPSG:5106 — central meridian 6°E' },
        { value: 'euref89_ntm7', label: 'EUREF89 / NTM7', hint: 'EPSG:5107 — central meridian 7°E' },
        { value: 'euref89_ntm8', label: 'EUREF89 / NTM8', hint: 'EPSG:5108 — central meridian 8°E' },
        { value: 'euref89_ntm9', label: 'EUREF89 / NTM9', hint: 'EPSG:5109 — central meridian 9°E' },
        { value: 'euref89_ntm10', label: 'EUREF89 / NTM10', hint: 'EPSG:5110 — central meridian 10°E' },
        { value: 'euref89_ntm11', label: 'EUREF89 / NTM11', hint: 'EPSG:5111 — central meridian 11°E' },
        { value: 'euref89_ntm12', label: 'EUREF89 / NTM12', hint: 'EPSG:5112 — central meridian 12°E' },
        { value: 'euref89_ntm13', label: 'EUREF89 / NTM13', hint: 'EPSG:5113 — central meridian 13°E' },
        { value: 'euref89_ntm14', label: 'EUREF89 / NTM14', hint: 'EPSG:5114 — central meridian 14°E' },
        // EUREF89/UTM — wider-zone alternative used for non-Norwegian or larger-area projects.
        { value: 'euref89_utm32n', label: 'EUREF89 / UTM 32N', hint: 'EPSG:25832 — southern Norway' },
        { value: 'euref89_utm33n', label: 'EUREF89 / UTM 33N', hint: 'EPSG:25833 — central Norway' },
        { value: 'euref89_utm35n', label: 'EUREF89 / UTM 35N', hint: 'EPSG:25835 — northern Norway / Finnmark' },
        // Escape hatch
        { value: 'other', label: 'Other (manual EPSG)' },
      ],
      defaultValue: ['euref89_ntm10'],
    },
    {
      id: 'vertical_datum',
      label: 'Allowed vertical datums',
      kind: 'multiselect',
      bepRole: 'BEP picks one as the project vertical reference.',
      options: [
        { value: 'nn2000', label: 'NN2000' },
        { value: 'nn1954', label: 'NN1954' },
        { value: 'evrf2007', label: 'EVRF2007' },
        { value: 'egm96', label: 'EGM96' },
        { value: 'egm2008', label: 'EGM2008' },
      ],
      defaultValue: ['nn2000'],
    },
    {
      id: 'basepoint_required',
      label: 'Project basepoint required',
      kind: 'toggle',
      bepRole: 'BEP enters eastings + northings + orthometric height.',
      defaultValue: true,
    },
    {
      id: 'control_point_required',
      label: 'Project control point required',
      kind: 'toggle',
      bepRole: 'BEP enters a second reference point to anchor rotation.',
      defaultValue: true,
    },
    {
      id: 'position_tolerance_m',
      label: 'Position tolerance',
      kind: 'number',
      unit: 'm',
      min: 0,
      max: 5,
      step: 0.05,
      hint: 'Delivered placement must match the project basepoint within this radius.',
      defaultValue: 0.1,
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
};

export function getEirFields(sectionId: string): EirField[] | null {
  return SECTION_EIR_FIELDS[sectionId] ?? null;
}
