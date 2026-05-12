/**
 * Field-level types for the EIR rule configurator.
 *
 * The rule registry in `eirRules.ts` composes these field defs per rule kind.
 * `EirConfigurator` renders the form controls. State persistence lands with
 * Phase 7 BEP-backend restore; on-the-wire shape is intentionally close to
 * `ProjectEirRule { kind, config }`.
 */
export type EirFieldKind =
  | 'toggle'         // boolean — is this requirement active?
  | 'select'         // pick one from options
  | 'multiselect'    // pick zero+ from options (popover w/ inline search)
  | 'number'         // numeric tolerance / count
  | 'text'           // freeform clause (rare — last-resort)
  | 'address';       // adressesøk via Kartverket Geonorge → AddressValue

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
  defaultValue?: string | number | boolean | string[] | AddressValue | null;
}

/**
 * Address payload from Kartverket Geonorge adressesøk. Lat/lon is WGS84
 * (EPSG:4326); the BEP layer converts to the project's chosen horizontal
 * CRS on commit.
 */
export interface AddressValue {
  adressetekst: string;
  lat: number;
  lon: number;
  municipality?: string;
  municipalityNumber?: string;
  postalCode?: string;
  postalPlace?: string;
  gardsnummer?: string;
  bruksnummer?: string;
}
