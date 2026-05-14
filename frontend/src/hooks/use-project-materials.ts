import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';
import { useModels } from './use-models';
import {
  warehouseKeys,
  type IFCType,
  type TypeDefinitionLayer,
} from './use-warehouse';
import {
  resolveFamily,
  FAMILIES,
  type FamilyKey,
  type ClassificationResult,
} from '@/lib/material-families';

// =============================================================================
// TYPES
// =============================================================================

export type MaterialUnit = 'm2' | 'm' | 'm3' | 'kg' | 'pcs';

export interface MaterialTypeUsage {
  type_id: string;
  type_name: string | null;
  ifc_type: string;
  model_id: string;
  model_name: string | null;
  instance_count: number;
  quantity_per_unit: number;
  layer_order: number;
  thickness_mm: number | null;
}

export interface AggregatedMaterial {
  /** Stable key for dedup: `${family}::${normalized_name}` */
  key: string;
  /** Display name (first observed variant) */
  name: string;
  /** All raw IFC name variants that dedupe to this entry */
  raw_names: string[];
  family: FamilyKey;
  subtype: string | null;
  family_confidence: ClassificationResult['confidence'];
  ns3457_code: string | null;
  /** Rolled-up quantity, summed across all usages. Unit carried separately — if
   * usages have mixed units, we keep per-unit buckets. */
  quantities_by_unit: Record<MaterialUnit, number>;
  /** Unique types referencing this material */
  used_in_types: MaterialTypeUsage[];
  /** True if any usage has an EPD id */
  has_epd: boolean;
  /** True if any usage is linked to a product (future — from ProductLibrary) */
  has_product: boolean;
  // TODO: backend exposes unit_cost (NOK / dominant unit) on Material — until
  // then this is always null and the dash shows em-dash for cost.
  unit_cost: number | null;
  // TODO: backend exposes gwp_per_unit (kg CO2e / dominant unit) — until then
  // this is null and dash shows em-dash for GWP.
  gwp_per_unit: number | null;
}

export interface MaterialSet {
  /** Signature hash of the layer sequence */
  signature: string;
  /** Derived name ("top layer + N layers") */
  name: string;
  layer_count: number;
  total_thickness_mm: number | null;
  layers: {
    layer_order: number;
    material_name: string;
    family: FamilyKey;
    thickness_mm: number | null;
    quantity_per_unit: number;
    material_unit: MaterialUnit;
  }[];
  used_in_types: MaterialTypeUsage[];
  total_instance_count: number;
}

export interface FamilyNode {
  key: FamilyKey;
  labelKey: string;
  material_count: number;
  instance_count: number;
  subtypes: SubtypeNode[];
}

export interface SubtypeNode {
  key: string;
  labelKey: string;
  material_count: number;
  instance_count: number;
}

export interface ProjectMaterialsSummary {
  total_materials: number;
  total_sets: number;
  total_instances: number;
  classified_count: number;
  classified_percent: number;
  epd_linked_count: number;
  epd_linked_percent: number;
  procurement_linked_count: number;
  procurement_linked_percent: number;
  unclassified_count: number;
  families_used: number;
  models_loaded: number;
  models_pending: number;
  loading: boolean;
  /** Total quantity across all materials in the dominant unit. */
  total_quantity: number;
  dominant_unit: MaterialUnit | null;
  /** True when materials carry mixed units (no single dominant axis). */
  mixed_units: boolean;
  /** Sum of (quantity × unit_cost) — null when no material has unit_cost. */
  total_cost_nok: number | null;
  /** Sum of (quantity × gwp_per_unit) — null when no EPD-linked material has GWP. */
  total_gwp_kg_co2e: number | null;
}

export interface ProjectMaterialsData {
  summary: ProjectMaterialsSummary;
  families: FamilyNode[];
  materials: AggregatedMaterial[];
  sets: MaterialSet[];
}

// =============================================================================
// AGGREGATION
// =============================================================================

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildMaterialKey(family: FamilyKey, name: string): string {
  return `${family}::${normalizeName(name)}`;
}

function hashLayerSignature(layers: TypeDefinitionLayer[]): string {
  const parts = [...layers]
    .sort((a, b) => a.layer_order - b.layer_order)
    .map(
      (l) =>
        `${l.layer_order}|${normalizeName(l.material_name)}|${l.thickness_mm ?? 'null'}|${l.material_unit}|${l.quantity_per_unit}`,
    );
  return parts.join('##');
}

interface AggregateInput {
  types: IFCType[];
  modelId: string;
  modelName: string | null;
}

export function aggregateProjectMaterials(inputs: AggregateInput[]): Omit<ProjectMaterialsData, 'summary'> {
  const materialsByKey = new Map<string, AggregatedMaterial>();
  const setsBySignature = new Map<string, MaterialSet>();

  for (const { types, modelId, modelName } of inputs) {
    for (const type of types) {
      const layers = type.mapping?.definition_layers;
      if (!layers || layers.length === 0) continue;

      // Aggregate each layer as a material usage
      for (const layer of layers) {
        if (!layer.material_name) continue;

        const classification = resolveFamily(layer.material_name, null);
        const key = buildMaterialKey(classification.family, layer.material_name);

        let material = materialsByKey.get(key);
        if (!material) {
          material = {
            key,
            name: layer.material_name,
            raw_names: [layer.material_name],
            family: classification.family,
            subtype: classification.subtype,
            family_confidence: classification.confidence,
            ns3457_code: layer.ns3457_code,
            quantities_by_unit: { m2: 0, m: 0, m3: 0, kg: 0, pcs: 0 },
            used_in_types: [],
            has_epd: false,
            has_product: false,
            unit_cost: null,
            gwp_per_unit: null,
          };
          materialsByKey.set(key, material);
        } else if (!material.raw_names.includes(layer.material_name)) {
          material.raw_names.push(layer.material_name);
        }

        if (layer.epd_id) material.has_epd = true;

        const qty = layer.quantity_per_unit * type.instance_count;
        material.quantities_by_unit[layer.material_unit] += qty;

        material.used_in_types.push({
          type_id: type.id,
          type_name: type.type_name,
          ifc_type: type.ifc_type,
          model_id: modelId,
          model_name: modelName,
          instance_count: type.instance_count,
          quantity_per_unit: layer.quantity_per_unit,
          layer_order: layer.layer_order,
          thickness_mm: layer.thickness_mm,
        });
      }

      // Aggregate the type as a material set
      if (layers.length > 0) {
        const signature = hashLayerSignature(layers);
        let set = setsBySignature.get(signature);
        const topLayer = [...layers].sort((a, b) => a.layer_order - b.layer_order)[0];
        const totalThickness = layers.every((l) => l.thickness_mm !== null)
          ? layers.reduce((sum, l) => sum + (l.thickness_mm ?? 0), 0)
          : null;

        if (!set) {
          set = {
            signature,
            name: `${topLayer.material_name} + ${layers.length - 1}`,
            layer_count: layers.length,
            total_thickness_mm: totalThickness,
            layers: layers
              .map((l) => ({
                layer_order: l.layer_order,
                material_name: l.material_name,
                family: resolveFamily(l.material_name, null).family,
                thickness_mm: l.thickness_mm,
                quantity_per_unit: l.quantity_per_unit,
                material_unit: l.material_unit,
              }))
              .sort((a, b) => a.layer_order - b.layer_order),
            used_in_types: [],
            total_instance_count: 0,
          };
          setsBySignature.set(signature, set);
        }

        set.used_in_types.push({
          type_id: type.id,
          type_name: type.type_name,
          ifc_type: type.ifc_type,
          model_id: modelId,
          model_name: modelName,
          instance_count: type.instance_count,
          quantity_per_unit: 1,
          layer_order: 0,
          thickness_mm: totalThickness,
        });
        set.total_instance_count += type.instance_count;
      }
    }
  }

  // Build family tree from aggregated materials
  const familyMap = new Map<FamilyKey, Map<string, { count: number; instances: number }>>();
  for (const material of materialsByKey.values()) {
    if (!familyMap.has(material.family)) {
      familyMap.set(material.family, new Map());
    }
    const subtypeMap = familyMap.get(material.family)!;
    const subtypeKey = material.subtype ?? '__null__';
    const existing = subtypeMap.get(subtypeKey) ?? { count: 0, instances: 0 };
    existing.count += 1;
    existing.instances += material.used_in_types.reduce((sum, u) => sum + u.instance_count, 0);
    subtypeMap.set(subtypeKey, existing);
  }

  const families: FamilyNode[] = FAMILIES.filter((f) => familyMap.has(f.key))
    .map((f) => {
      const subtypeMap = familyMap.get(f.key)!;
      const subtypes: SubtypeNode[] = f.subtypes
        .filter((s) => subtypeMap.has(s.key))
        .map((s) => {
          const stats = subtypeMap.get(s.key)!;
          return {
            key: s.key,
            labelKey: s.labelKey,
            material_count: stats.count,
            instance_count: stats.instances,
          };
        });

      const totalMaterials = Array.from(subtypeMap.values()).reduce((sum, s) => sum + s.count, 0);
      const totalInstances = Array.from(subtypeMap.values()).reduce((sum, s) => sum + s.instances, 0);

      return {
        key: f.key,
        labelKey: f.labelKey,
        material_count: totalMaterials,
        instance_count: totalInstances,
        subtypes,
      };
    })
    .sort((a, b) => {
      const orderA = FAMILIES.find((f) => f.key === a.key)?.order ?? 99;
      const orderB = FAMILIES.find((f) => f.key === b.key)?.order ?? 99;
      return orderA - orderB;
    });

  return {
    families,
    materials: Array.from(materialsByKey.values()),
    sets: Array.from(setsBySignature.values()),
  };
}

function buildSummary(
  data: Omit<ProjectMaterialsData, 'summary'>,
  modelsLoaded: number,
  modelsPending: number,
): ProjectMaterialsSummary {
  const total = data.materials.length;
  const classified = data.materials.filter((m) => m.family !== 'other').length;
  const epdLinked = data.materials.filter((m) => m.has_epd).length;
  const procurementLinked = data.materials.filter((m) => m.has_product).length;
  const totalInstances = data.materials.reduce(
    (sum, m) => sum + m.used_in_types.reduce((s, u) => s + u.instance_count, 0),
    0,
  );

  // Total quantity: pick the dominant unit across the whole project.
  // Mixed units are common, so we surface that as a flag instead of
  // crunching numbers across incompatible axes.
  const unitTotals: Record<MaterialUnit, number> = { m2: 0, m: 0, m3: 0, kg: 0, pcs: 0 };
  for (const m of data.materials) {
    for (const u of Object.keys(m.quantities_by_unit) as MaterialUnit[]) {
      unitTotals[u] += m.quantities_by_unit[u];
    }
  }
  const unitEntries = (Object.entries(unitTotals) as [MaterialUnit, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const dominantUnit = unitEntries[0]?.[0] ?? null;
  const totalQuantity = unitEntries[0]?.[1] ?? 0;
  const mixedUnits = unitEntries.length > 1;

  // Cost + GWP totals — `unit_cost` / `gwp_per_unit` are null today (see
  // TODO on AggregatedMaterial). When any material has these fields,
  // sum (qty × per-unit) using each material's own dominant unit. If no
  // material carries the field, surface null so the KPI tile shows the
  // amber em-dash instead of a fabricated zero.
  let totalCost: number | null = null;
  let totalGwp: number | null = null;
  for (const m of data.materials) {
    const dominantForMat = pickDominantUnit(m.quantities_by_unit);
    if (!dominantForMat) continue;
    const q = m.quantities_by_unit[dominantForMat];
    if (m.unit_cost !== null) {
      totalCost = (totalCost ?? 0) + q * m.unit_cost;
    }
    if (m.has_epd && m.gwp_per_unit !== null) {
      totalGwp = (totalGwp ?? 0) + q * m.gwp_per_unit;
    }
  }

  return {
    total_materials: total,
    total_sets: data.sets.length,
    total_instances: totalInstances,
    classified_count: classified,
    classified_percent: total > 0 ? Math.round((classified / total) * 100) : 0,
    epd_linked_count: epdLinked,
    epd_linked_percent: total > 0 ? Math.round((epdLinked / total) * 100) : 0,
    procurement_linked_count: procurementLinked,
    procurement_linked_percent: total > 0 ? Math.round((procurementLinked / total) * 100) : 0,
    unclassified_count: total - classified,
    families_used: data.families.length,
    models_loaded: modelsLoaded,
    models_pending: modelsPending,
    loading: modelsPending > 0,
    total_quantity: totalQuantity,
    dominant_unit: dominantUnit,
    mixed_units: mixedUnits,
    total_cost_nok: totalCost,
    total_gwp_kg_co2e: totalGwp,
  };
}

/**
 * Pick the unit with the largest aggregated quantity for a single material.
 * Used both for the KPI summation and for the per-material rankings on
 * the materials dash.
 */
export function pickDominantUnit(
  quantities: Record<MaterialUnit, number>,
): MaterialUnit | null {
  const entries = (Object.entries(quantities) as [MaterialUnit, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

// =============================================================================
// HOOK
// =============================================================================

export function useProjectMaterials(projectId: string | undefined): {
  data: ProjectMaterialsData | null;
  isLoading: boolean;
  error: Error | null;
  /** Latest moment any underlying type query last refreshed. 0 if none yet. */
  dataUpdatedAt: number;
} {
  const { data: models, isLoading: modelsLoading } = useModels(projectId);

  const readyModels = useMemo(
    () => (models ?? []).filter((m) => m.status === 'ready'),
    [models],
  );

  const typeQueries = useQueries({
    queries: readyModels.map((model) => ({
      queryKey: warehouseKeys.typesList(model.id),
      queryFn: async () => {
        const params = new URLSearchParams();
        params.append('model', model.id);
        // Project-materials aggregates definition_layers across every type, so
        // we need both the nested mapping object (?expand=mapping) and every
        // row in a single response (?page_size=10000). See use-type-mapping.ts.
        params.append('page_size', '10000');
        params.append('expand', 'mapping');
        const response = await apiClient.get<PaginatedResponse<IFCType> | IFCType[]>(
          `/types/types/?${params}`,
        );
        const data = response.data;
        const types = Array.isArray(data) ? data : data?.results ?? [];
        return {
          modelId: model.id,
          modelName: model.name,
          types,
        };
      },
      staleTime: 30 * 1000,
    })),
  });

  const loadedQueries = typeQueries.filter((q) => q.isSuccess && q.data);
  const pendingCount = typeQueries.filter((q) => q.isLoading).length;
  const errored = typeQueries.find((q) => q.isError);

  const aggregated = useMemo(() => {
    if (loadedQueries.length === 0) {
      return {
        families: [] as FamilyNode[],
        materials: [] as AggregatedMaterial[],
        sets: [] as MaterialSet[],
      };
    }
    const inputs: AggregateInput[] = loadedQueries.map((q) => q.data!);
    return aggregateProjectMaterials(inputs);
  }, [loadedQueries.length, loadedQueries.map((q) => q.data?.modelId).join(',')]);

  const summary = useMemo(
    () => buildSummary(aggregated, loadedQueries.length, pendingCount),
    [aggregated, loadedQueries.length, pendingCount],
  );

  const isLoading = modelsLoading || (readyModels.length > 0 && loadedQueries.length === 0);

  // Freshness — most-recent `dataUpdatedAt` across all underlying type queries.
  const dataUpdatedAt = typeQueries.reduce(
    (latest, q) => (q.dataUpdatedAt > latest ? q.dataUpdatedAt : latest),
    0,
  );

  return {
    data: {
      summary,
      ...aggregated,
    },
    isLoading,
    error: errored?.error instanceof Error ? errored.error : null,
    dataUpdatedAt,
  };
}
