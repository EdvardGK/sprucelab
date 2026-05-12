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
      id: 'horizontal_crs_family',
      label: 'Allowed horizontal CRS families',
      kind: 'multiselect',
      bepRole: 'BEP picks the specific zone from this list.',
      hint: 'EPSG database via pyproj backs the actual zone picker in the BEP column.',
      options: [
        { value: 'etrs89_ntm', label: 'ETRS89 / NTM (Norway)', hint: 'Zones 5–14' },
        { value: 'etrs89_utm', label: 'ETRS89 / UTM', hint: 'Zones 32, 33, 35' },
        { value: 'wgs84_utm', label: 'WGS84 / UTM' },
        { value: 'other', label: 'Other (manual EPSG)' },
      ],
      defaultValue: ['etrs89_ntm', 'etrs89_utm'],
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
