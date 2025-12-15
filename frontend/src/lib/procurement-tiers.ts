/**
 * Procurement Tier Logic
 *
 * Classifies IFC types by how they are procured/measured:
 * - PRODUCT: Buy by COUNT (pcs) - discrete items
 * - PARAMETRIC: Buy by LENGTH (m) - linear elements
 * - BUILT: Buy by AREA/VOLUME (m², m³) - volumetric elements
 *
 * Ported from /home/edkjo/dev/ifc-workbench/sidequests/reduzer-mapping/mapping_app.py
 */

// Products: buy by COUNT (pcs) - volume irrelevant
export const PRODUCT_TYPES = new Set([
  'IfcFlowTerminal',
  'IfcFlowFitting',
  'IfcFlowController',
  'IfcEnergyConversionDevice',
  'IfcDistributionControlElement',
  'IfcSanitaryTerminal',
  'IfcDoor',
  'IfcWindow',
  'IfcFurnishingElement',
  'IfcBuildingElementProxy',
  'IfcDiscreteAccessory',
  'IfcMechanicalFastener',
  'IfcVibrationIsolator',
  'IfcDistributionChamberElement',
  // Specific subtypes
  'IfcValve',
  'IfcDamper',
  'IfcPump',
  'IfcFan',
  'IfcAirTerminal',
  'IfcFireSuppressionTerminal',
  'IfcPipeFitting',
  'IfcDuctFitting',
  'IfcCableCarrierFitting',
  'IfcJunctionBox',
]);

// Parametric: buy by LENGTH (m) - profile + length
export const PARAMETRIC_TYPES = new Set([
  'IfcFlowSegment',
  'IfcCableCarrierSegment',
  'IfcCableSegment',
  // Specific subtypes
  'IfcPipeSegment',
  'IfcDuctSegment',
  'IfcCableTray',
  'IfcCable',
]);

// Built: buy by AREA/VOLUME (m², m³)
export const BUILT_TYPES = new Set([
  'IfcWall',
  'IfcSlab',
  'IfcRoof',
  'IfcBeam',
  'IfcColumn',
  'IfcMember',
  'IfcPlate',
  'IfcFooting',
  'IfcPile',
  'IfcStair',
  'IfcRailing',
  'IfcCovering',
]);

export type ProcurementTier = 'product' | 'parametric' | 'built';

export interface RepresentativeUnit {
  tier: ProcurementTier;
  unit: string;
  label: string;
  labelNorwegian: string;
  color: string;
  bgColor: string;
}

/**
 * Get procurement tier for an IFC type.
 * Removes 'Type' suffix for matching (IfcWallType -> IfcWall)
 */
export function getProcurementTier(ifcType: string): ProcurementTier {
  // Remove 'Type' suffix for matching
  const baseType = ifcType.endsWith('Type')
    ? ifcType.slice(0, -4)
    : ifcType;

  if (PRODUCT_TYPES.has(baseType) || PRODUCT_TYPES.has(ifcType)) {
    return 'product';
  }
  if (PARAMETRIC_TYPES.has(baseType) || PARAMETRIC_TYPES.has(ifcType)) {
    return 'parametric';
  }
  if (BUILT_TYPES.has(baseType) || BUILT_TYPES.has(ifcType)) {
    return 'built';
  }

  // Fallback: check by prefix
  if (
    baseType.startsWith('IfcFlowTerminal') ||
    baseType.startsWith('IfcFlowFitting') ||
    baseType.startsWith('IfcFlowController') ||
    baseType.startsWith('IfcDistribution')
  ) {
    return 'product';
  }
  if (
    baseType.startsWith('IfcFlowSegment') ||
    baseType.startsWith('IfcCable')
  ) {
    return 'parametric';
  }

  // Default to built
  return 'built';
}

/**
 * Get representative unit info for an IFC type.
 */
export function getRepresentativeUnit(ifcType: string): RepresentativeUnit {
  const tier = getProcurementTier(ifcType);

  switch (tier) {
    case 'product':
      return {
        tier: 'product',
        unit: 'pcs',
        label: 'Count',
        labelNorwegian: 'Antall (stk)',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
      };
    case 'parametric':
      return {
        tier: 'parametric',
        unit: 'm',
        label: 'Length',
        labelNorwegian: 'Lengde (m)',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      };
    case 'built':
    default:
      return {
        tier: 'built',
        unit: 'm²/m³',
        label: 'Area/Volume',
        labelNorwegian: 'Areal/Volum',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
      };
  }
}

// Discipline → NS3451 Level 1 mapping
export const DISCIPLINE_NS3451_LEVEL1: Record<string, string> = {
  ARK: '2', // Bygning
  IARK: '2', // Innredning
  LARK: '2', // Landskapsarkitektur
  RIB: '2', // Bygning (bæresystem)
  RIBp: '2', // Bygning (prefab)
  RIG: '2', // Grunnarbeider
  RIV: '3', // VVS (generell)
  RIVv: '3', // VVS ventilasjon
  RIVr: '3', // VVS rør
  RIVs: '3', // VVS sanitær
  RIVspr: '3', // Sprinkler
  RIVarme: '3', // Varme
  RIKulde: '3', // Kulde
  RIVfv: '3', // Fjernvarme
  RIVA: '3', // VA (utvendig)
  RIE: '4', // Elkraft
  EKOM: '5', // Ekom
  RIAu: '5', // Automatisering
  FASADE: '2', // Fasade
  TRAPP: '2', // Trapp
};

/**
 * Parse discipline code from model filename.
 * Norwegian BIM convention: {PROJECT}_{DISCIPLINE}_{BUILDING}.ifc
 *
 * Examples:
 * - "S8A_ARK_MMI700.ifc" -> "ARK"
 * - "A4_RIVv_B01.ifc" -> "RIVv"
 */
export function parseDiscipline(filename: string): string | null {
  // Patterns in order of specificity (longer first)
  const patterns = [
    /(?:^|_|-|\s)(IARK)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(LARK)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(ARK)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIBp)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIB)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIG)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIVA)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIV?arme)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RI[Kk]ulde)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RI[Vv]?fv)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIVspr)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIV[vV])(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIV[rR])(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIV)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIE)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(EKOM)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)(RIAu)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)([Ff]asade)(?:_|-|\s|\.|$)/i,
    /(?:^|_|-|\s)([Tt]rapp)(?:_|-|\s|\.|$)/i,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
}
