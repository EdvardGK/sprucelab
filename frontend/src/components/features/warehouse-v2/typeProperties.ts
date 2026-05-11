import type { IFCType } from '@/hooks/use-warehouse';

/**
 * Canonical "what does the modeler tell us about this type" properties.
 * Surface gaps — never invent values. Sprucelab does not classify on the
 * modeler's behalf; we show what's there and flag what isn't.
 */
export interface TypeProperties {
  loadBearing: boolean | null;
  isExternal: boolean | null;
  fireRating: string | null;
  acousticRating: string | null;
  thermalTransmittance: number | null;
  mmi: number | string | null;
}

export const EMPTY_TYPE_PROPERTIES: TypeProperties = {
  loadBearing: null,
  isExternal: null,
  fireRating: null,
  acousticRating: null,
  thermalTransmittance: null,
  mmi: null,
};

export function extractTypeProperties(
  raw: IFCType['properties']
): TypeProperties {
  if (!raw || typeof raw !== 'object') return EMPTY_TYPE_PROPERTIES;

  const find = (key: string): unknown => {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const pset = value as Record<string, unknown>;
      const v = pset[key];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  };

  // MMI is the Norwegian Modeling Maturity Index — surface whichever name
  // the modeler used (custom psets vary).
  let mmiValue: unknown = null;
  for (const candidate of ['MMI', 'ModelMaturityIndex', 'MMI_Status', 'MMIStatus']) {
    mmiValue = find(candidate);
    if (mmiValue !== null) break;
  }

  return {
    loadBearing: asBool(find('LoadBearing')),
    isExternal: asBool(find('IsExternal')),
    fireRating: asString(find('FireRating')),
    acousticRating: asString(find('AcousticRating')),
    thermalTransmittance: asNumber(find('ThermalTransmittance')),
    mmi:
      typeof mmiValue === 'number'
        ? mmiValue
        : typeof mmiValue === 'string'
          ? mmiValue
          : null,
  };
}

function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'yes' || s === '1') return true;
    if (s === 'false' || s === 'no' || s === '0') return false;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
