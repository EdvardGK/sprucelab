import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';

// =============================================================================
// TYPES
// =============================================================================

export interface NS3451Code {
  code: string;
  name: string;
  name_en: string | null;
  guidance: string | null;
  level: number;
  parent_code: string | null;
}

export interface TypeMapping {
  id: string;
  ifc_type: string;
  ns3451_code: string | null;
  ns3451: string | null;
  ns3451_name: string | null;
  product: string | null;
  representative_unit: 'pcs' | 'm' | 'm2' | 'm3' | null;
  discipline: string | null;
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  confidence: number | null;
  notes: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NS3451HierarchyNode {
  code: string;
  name: string;
  name_en: string | null;
  guidance: string | null;
  level: number;
  children: Record<string, NS3451HierarchyNode>;
}

export type NS3451Hierarchy = Record<string, NS3451HierarchyNode>;

export interface IFCType {
  id: string;
  model: string;
  type_guid: string | null;
  type_name: string;
  ifc_type: string;
  properties: Record<string, unknown> | null;
  mapping: TypeMapping | null;
  instance_count: number;
}

export interface MaterialMapping {
  id: string;
  material: string;
  standard_name: string | null;
  density_kg_m3: number | null;
  epd_reference: string | null;
  thermal_conductivity: number | null;
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review';
  notes: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  model: string;
  material_guid: string | null;
  name: string;
  category: string | null;
  properties: Record<string, unknown> | null;
  mapping: MaterialMapping | null;
  usage_count: number;
}

export interface MappingSummary {
  total: number;
  mapped: number;
  pending: number;
  ignored: number;
  review: number;
  progress_percent: number;
}

export interface BulkUpdateMapping {
  ifc_type_id: string;
  ns3451_code: string | null;
  mapping_status?: 'pending' | 'mapped' | 'ignored' | 'review';
}

export interface BulkUpdateResponse {
  created: number;
  updated: number;
  errors: Array<{ ifc_type_id: string; error: string }>;
}

export interface TypeInstance {
  id: string;
  ifc_guid: string;
  name: string | null;
  ifc_type: string;
  storey_id: string | null;
}

export interface TypeInstancesResponse {
  type_id: string;
  type_name: string;
  type_guid: string;
  ifc_type: string;
  model_id: string;
  total_count: number;
  offset: number;
  limit: number;
  instances: TypeInstance[];
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const warehouseKeys = {
  all: ['warehouse'] as const,

  // NS3451 Codes
  ns3451: () => [...warehouseKeys.all, 'ns3451'] as const,
  ns3451List: (filters?: { level?: number; parent_code?: string; search?: string }) =>
    [...warehouseKeys.ns3451(), 'list', filters] as const,
  ns3451Hierarchy: () => [...warehouseKeys.ns3451(), 'hierarchy'] as const,

  // IFC Types
  types: () => [...warehouseKeys.all, 'types'] as const,
  typesList: (modelId: string, filters?: { ifc_type?: string }) =>
    [...warehouseKeys.types(), 'list', modelId, filters] as const,
  typeDetail: (id: string) => [...warehouseKeys.types(), 'detail', id] as const,
  typesSummary: (modelId: string) => [...warehouseKeys.types(), 'summary', modelId] as const,
  typeInstances: (typeId: string, options?: { limit?: number; offset?: number }) =>
    [...warehouseKeys.types(), 'instances', typeId, options] as const,

  // Type Mappings
  typeMappings: () => [...warehouseKeys.all, 'type-mappings'] as const,
  typeMappingsList: (modelId: string) =>
    [...warehouseKeys.typeMappings(), 'list', modelId] as const,
  typeMappingDetail: (id: string) => [...warehouseKeys.typeMappings(), 'detail', id] as const,

  // Materials
  materials: () => [...warehouseKeys.all, 'materials'] as const,
  materialsList: (modelId: string, filters?: { category?: string }) =>
    [...warehouseKeys.materials(), 'list', modelId, filters] as const,
  materialDetail: (id: string) => [...warehouseKeys.materials(), 'detail', id] as const,
  materialsSummary: (modelId: string) => [...warehouseKeys.materials(), 'summary', modelId] as const,

  // Material Mappings
  materialMappings: () => [...warehouseKeys.all, 'material-mappings'] as const,
  materialMappingsList: (modelId: string) =>
    [...warehouseKeys.materialMappings(), 'list', modelId] as const,
};

// =============================================================================
// NS3451 CODES (Reference Data)
// =============================================================================

interface UseNS3451CodesOptions {
  level?: number;
  parent_code?: string;
  search?: string;
  enabled?: boolean;
}

export function useNS3451Codes(options: UseNS3451CodesOptions = {}) {
  const { level, parent_code, search, enabled = true } = options;

  return useQuery({
    queryKey: warehouseKeys.ns3451List({ level, parent_code, search }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (level !== undefined) params.append('level', String(level));
      if (parent_code) params.append('parent_code', parent_code);
      if (search) params.append('search', search);

      const url = `/entities/ns3451-codes/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<PaginatedResponse<NS3451Code>>(url);
      return response.data.results || [];
    },
    enabled,
    staleTime: 10 * 60 * 1000, // NS3451 codes rarely change, cache for 10 minutes
  });
}

/**
 * Fetch NS3451 codes as a nested hierarchy for cascading selectors.
 */
export function useNS3451Hierarchy() {
  return useQuery({
    queryKey: warehouseKeys.ns3451Hierarchy(),
    queryFn: async () => {
      const response = await apiClient.get<NS3451Hierarchy>(
        '/entities/ns3451-codes/hierarchy/'
      );
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // Hierarchy rarely changes, cache for 30 minutes
  });
}

// =============================================================================
// IFC TYPES
// =============================================================================

interface UseModelTypesOptions {
  ifc_type?: string;
  enabled?: boolean;
}

export function useModelTypes(modelId: string, options: UseModelTypesOptions = {}) {
  const { ifc_type, enabled = true } = options;

  return useQuery({
    queryKey: warehouseKeys.typesList(modelId, { ifc_type }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('model', modelId);
      if (ifc_type) params.append('ifc_type', ifc_type);

      const response = await apiClient.get<PaginatedResponse<IFCType>>(
        `/entities/types/?${params}`
      );
      return response.data.results || [];
    },
    enabled: !!modelId && enabled,
  });
}

export function useTypeMappingSummary(modelId: string) {
  return useQuery({
    queryKey: warehouseKeys.typesSummary(modelId),
    queryFn: async () => {
      const response = await apiClient.get<MappingSummary>(
        `/entities/types/summary/?model=${modelId}`
      );
      return response.data;
    },
    enabled: !!modelId,
  });
}

// =============================================================================
// TYPE INSTANCES (for Instance Viewer)
// =============================================================================

interface UseTypeInstancesOptions {
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function useTypeInstances(typeId: string | null, options: UseTypeInstancesOptions = {}) {
  const { limit = 100, offset = 0, enabled = true } = options;

  return useQuery({
    queryKey: warehouseKeys.typeInstances(typeId!, { limit, offset }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', String(limit));
      params.append('offset', String(offset));

      const response = await apiClient.get<TypeInstancesResponse>(
        `/entities/types/${typeId}/instances/?${params}`
      );
      return response.data;
    },
    enabled: !!typeId && enabled,
  });
}

// =============================================================================
// TYPE MAPPING MUTATIONS
// =============================================================================

interface UpdateTypeMappingParams {
  mappingId: string;
  ns3451_code?: string | null;
  mapping_status?: 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  representative_unit?: 'pcs' | 'm' | 'm2' | 'm3' | null;
  notes?: string;
}

export function useUpdateTypeMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mappingId, ...data }: UpdateTypeMappingParams) => {
      const response = await apiClient.patch<TypeMapping>(
        `/entities/type-mappings/${mappingId}/`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate types and mappings queries
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.typeMappings() });
    },
  });
}

interface CreateTypeMappingParams {
  ifc_type: string;
  ns3451_code?: string | null;
  mapping_status?: 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  representative_unit?: 'pcs' | 'm' | 'm2' | 'm3' | null;
  notes?: string;
}

export function useCreateTypeMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTypeMappingParams) => {
      const response = await apiClient.post<TypeMapping>(
        '/entities/type-mappings/',
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.typeMappings() });
    },
  });
}

export function useBulkUpdateTypeMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mappings: BulkUpdateMapping[]) => {
      const response = await apiClient.post<BulkUpdateResponse>(
        '/entities/type-mappings/bulk-update/',
        { mappings }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.typeMappings() });
    },
  });
}

// =============================================================================
// MATERIALS
// =============================================================================

interface UseModelMaterialsOptions {
  category?: string;
  enabled?: boolean;
}

export function useModelMaterials(modelId: string, options: UseModelMaterialsOptions = {}) {
  const { category, enabled = true } = options;

  return useQuery({
    queryKey: warehouseKeys.materialsList(modelId, { category }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('model', modelId);
      if (category) params.append('category', category);

      const response = await apiClient.get<PaginatedResponse<Material>>(
        `/entities/materials/?${params}`
      );
      return response.data.results || [];
    },
    enabled: !!modelId && enabled,
  });
}

export function useMaterialMappingSummary(modelId: string) {
  return useQuery({
    queryKey: warehouseKeys.materialsSummary(modelId),
    queryFn: async () => {
      const response = await apiClient.get<MappingSummary>(
        `/entities/materials/summary/?model=${modelId}`
      );
      return response.data;
    },
    enabled: !!modelId,
  });
}

// =============================================================================
// MATERIAL MAPPING MUTATIONS
// =============================================================================

interface UpdateMaterialMappingParams {
  mappingId: string;
  standard_name?: string | null;
  density_kg_m3?: number | null;
  epd_reference?: string | null;
  thermal_conductivity?: number | null;
  mapping_status?: 'pending' | 'mapped' | 'ignored' | 'review';
  notes?: string;
}

export function useUpdateMaterialMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mappingId, ...data }: UpdateMaterialMappingParams) => {
      const response = await apiClient.patch<MaterialMapping>(
        `/entities/material-mappings/${mappingId}/`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.materials() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.materialMappings() });
    },
  });
}

interface CreateMaterialMappingParams {
  material: string;
  standard_name?: string | null;
  density_kg_m3?: number | null;
  epd_reference?: string | null;
  mapping_status?: 'pending' | 'mapped' | 'ignored' | 'review';
  notes?: string;
}

export function useCreateMaterialMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMaterialMappingParams) => {
      const response = await apiClient.post<MaterialMapping>(
        '/entities/material-mappings/',
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.materials() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.materialMappings() });
    },
  });
}
