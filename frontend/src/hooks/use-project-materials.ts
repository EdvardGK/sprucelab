import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import apiClient from '@/lib/api-client';
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
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useProjectMaterials(projectId: string | undefined): {
  data: ProjectMaterialsData | null;
  isLoading: boolean;
  error: Error | null;
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
        const response = await apiClient.get<IFCType[]>(`/types/types/?${params}`);
        return {
          modelId: model.id,
          modelName: model.name,
          types: response.data || [],
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

  return {
    data: {
      summary,
      ...aggregated,
    },
    isLoading,
    error: errored?.error instanceof Error ? errored.error : null,
  };
}
