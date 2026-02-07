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

export interface TypeDefinitionLayer {
  id?: string;
  type_mapping?: string;
  layer_order: number;
  material_name: string;
  // Material classification (NS3457-8)
  ns3457_code: string | null;
  ns3457_name: string | null;
  // Quantity per type unit (recipe ratio)
  quantity_per_unit: number;
  material_unit: 'm2' | 'm' | 'm3' | 'kg' | 'pcs';
  // Visual thickness for sandwich diagram (optional)
  thickness_mm: number | null;
  // EPD/LCA reference
  epd_id: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
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
  // Type category (generalization level)
  type_category: 'generic' | 'specific' | 'product';
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  confidence: number | null;
  notes: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  created_at: string;
  updated_at: string;
  definition_layers?: TypeDefinitionLayer[];
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

// Dashboard Metrics Types
export interface ModelHealthMetrics {
  id: string;
  name: string;
  discipline: string | null;
  total_types: number;
  mapped: number;
  pending: number;
  ignored: number;
  review: number;
  followup: number;
  health_score: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface DisciplineMetrics {
  total: number;
  mapped: number;
  pending: number;
  health_score: number;
}

export interface DashboardMetrics {
  project_summary: {
    total_types: number;
    mapped: number;
    pending: number;
    ignored: number;
    review: number;
    followup: number;
    progress_percent: number;
    health_score: number;
    classification_percent: number;
    unit_percent: number;
    material_percent: number;
  };
  models: ModelHealthMetrics[];
  by_discipline: Record<string, DisciplineMetrics>;
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

  // Dashboard Metrics
  dashboardMetrics: (projectId?: string, modelId?: string) =>
    [...warehouseKeys.all, 'dashboard-metrics', { projectId, modelId }] as const,
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

      // Types endpoint returns unpaginated array (pagination disabled for mapping workflow)
      const response = await apiClient.get<IFCType[]>(
        `/entities/types/?${params}`
      );
      return response.data || [];
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
      // Invalidate types (includes typeInstances due to prefix matching) and mappings queries
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.typeMappings() });
      // Explicitly invalidate all typeInstances queries to ensure viewer updates
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'warehouse' &&
          query.queryKey[1] === 'types' &&
          query.queryKey[2] === 'instances'
      });
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

// =============================================================================
// EXCEL EXPORT/IMPORT
// =============================================================================

export interface ExcelImportSummary {
  total_rows: number;
  updated: number;
  created: number;
  skipped: number;
  error_count: number;
}

export interface ExcelImportError {
  row: number;
  type_guid: string;
  error: string;
}

export interface ExcelImportWarning {
  row: number;
  type_guid: string;
  warning: string;
}

export interface ExcelImportResult {
  success: boolean;
  summary: ExcelImportSummary;
  errors: ExcelImportError[];
  warnings: ExcelImportWarning[];
}

/**
 * Export types to Excel template for batch mapping.
 * Triggers file download.
 */
export function useExportTypesExcel() {
  return useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiClient.get(
        `/entities/types/export-excel/?model=${modelId}`,
        {
          responseType: 'blob',
        }
      );

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = `types_${modelId}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Create download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true, filename };
    },
  });
}

/**
 * Export types to Reduzer-compatible format for LCA import.
 * Triggers file download.
 *
 * @param includeUnmapped - If true, includes types without NS3451 mapping
 */
export function useExportTypesReduzer() {
  return useMutation({
    mutationFn: async ({
      modelId,
      includeUnmapped = false,
    }: {
      modelId: string;
      includeUnmapped?: boolean;
    }) => {
      const params = new URLSearchParams();
      params.append('model', modelId);
      if (includeUnmapped) {
        params.append('include_unmapped', 'true');
      }

      const response = await apiClient.get(
        `/entities/types/export-reduzer/?${params}`,
        {
          responseType: 'blob',
        }
      );

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = `reduzer_${modelId}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Create download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true, filename };
    },
  });
}

/**
 * Import type mappings from Excel file.
 */
export function useImportTypesExcel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ modelId, file }: { modelId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model_id', modelId);

      const response = await apiClient.post<ExcelImportResult>(
        '/entities/types/import-excel/',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate types queries to refresh the list
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.typeMappings() });
    },
  });
}

// =============================================================================
// DASHBOARD METRICS
// =============================================================================

interface UseDashboardMetricsOptions {
  projectId?: string;
  modelId?: string;
  enabled?: boolean;
}

/**
 * Fetch dashboard metrics for project-level health scores.
 * Returns aggregated metrics across all models in a project.
 */
export function useDashboardMetrics(options: UseDashboardMetricsOptions = {}) {
  const { projectId, modelId, enabled = true } = options;

  return useQuery({
    queryKey: warehouseKeys.dashboardMetrics(projectId, modelId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (modelId) params.append('model_id', modelId);

      const response = await apiClient.get<DashboardMetrics>(
        `/entities/types/dashboard-metrics/?${params}`
      );
      return response.data;
    },
    enabled: enabled && !!(projectId || modelId),
    staleTime: 30_000, // Refresh every 30 seconds
  });
}

// =============================================================================
// SEMANTIC TYPES (PA0802/IFC Normalization)
// =============================================================================

export type SemanticTypeCategory =
  | 'A-Structural'
  | 'D-Openings'
  | 'E-Cladding'
  | 'F-MEP'
  | 'Z-Generic';

export interface SemanticType {
  id: string;
  code: string;
  name_no: string;
  name_en: string;
  category: SemanticTypeCategory;
  canonical_ifc_class: string | null;
  is_active: boolean;
  type_bank_entry_count: number;
}

export interface SemanticTypeFull extends SemanticType {
  alternative_ifc_classes: string[];
  suggested_ns3451_codes: string[];
  name_patterns: string[];
  description: string | null;
  ifc_mappings: SemanticTypeIFCMapping[];
  created_at: string;
  updated_at: string;
}

export interface SemanticTypeIFCMapping {
  id: string;
  semantic_type: string;
  ifc_class: string;
  predefined_type: string | null;
  is_primary: boolean;
  is_common_misuse: boolean;
  confidence_hint: number | null;
  note: string | null;
}

export interface SemanticTypeSuggestion {
  code: string;
  name_en: string;
  source: 'ifc_class' | 'name_pattern' | 'predefined_type';
  confidence: number;
  is_primary: boolean;
  is_common_misuse: boolean;
  note: string | null;
}

export interface SemanticSummary {
  total: number;
  with_semantic_type: number;
  without_semantic_type: number;
  coverage_percent: number;
  by_source: Record<string, number>;
  by_semantic_type: Record<string, number>;
}

// TypeBank entry with semantic type fields
export interface TypeBankEntry {
  id: string;
  ifc_class: string;
  type_name: string;
  predefined_type: string | null;
  material: string | null;
  ns3451_code: string | null;
  ns3451_name: string | null;
  discipline: string | null;
  canonical_name: string | null;
  representative_unit: 'pcs' | 'm' | 'm2' | 'm3' | null;
  total_instance_count: number;
  source_model_count: number;
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review';
  confidence: number | null;
  observation_count: number;
  // Semantic type fields
  semantic_type: string | null;
  semantic_type_code: string | null;
  semantic_type_name: string | null;
  semantic_type_source: 'auto_ifc_class' | 'auto_name_pattern' | 'manual' | 'verified' | null;
  semantic_type_confidence: number | null;
}

export interface TypeBankEntryFull extends TypeBankEntry {
  description: string | null;
  pct_is_external: number | null;
  pct_load_bearing: number | null;
  pct_fire_rated: number | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  semantic_type_data: SemanticType | null;
  observations: TypeBankObservation[];
  aliases: TypeBankAlias[];
}

export interface TypeBankObservation {
  id: string;
  type_bank_entry: string;
  source_model: string;
  source_model_name: string;
  source_model_project: string;
  source_type: string;
  source_type_name: string;
  instance_count: number;
  pct_is_external: number | null;
  pct_load_bearing: number | null;
  pct_fire_rated: number | null;
  property_variations: Record<string, unknown> | null;
  observed_at: string;
}

export interface TypeBankAlias {
  id: string;
  canonical: string;
  alias_type_name: string;
  alias_ifc_class: string | null;
  alias_source: string | null;
  created_at: string;
}

export interface TypeBankSummary {
  total: number;
  mapped: number;
  pending: number;
  ignored: number;
  review: number;
  progress_percent: number;
  by_ifc_class: Record<string, number>;
  by_discipline: Record<string, number>;
}

// Semantic type query keys
export const semanticTypeKeys = {
  all: ['semantic-types'] as const,
  list: () => [...semanticTypeKeys.all, 'list'] as const,
  byCategory: () => [...semanticTypeKeys.all, 'by-category'] as const,
  forIfcClass: (ifcClass: string) => [...semanticTypeKeys.all, 'for-ifc-class', ifcClass] as const,
  detail: (id: string) => [...semanticTypeKeys.all, 'detail', id] as const,
};

// TypeBank query keys
export const typeBankKeys = {
  all: ['type-bank'] as const,
  list: (filters?: { ifc_class?: string; mapping_status?: string; search?: string }) =>
    [...typeBankKeys.all, 'list', filters] as const,
  detail: (id: string) => [...typeBankKeys.all, 'detail', id] as const,
  summary: () => [...typeBankKeys.all, 'summary'] as const,
  semanticSummary: () => [...typeBankKeys.all, 'semantic-summary'] as const,
  suggestions: (id: string) => [...typeBankKeys.all, 'suggestions', id] as const,
};

// =============================================================================
// SEMANTIC TYPE HOOKS
// =============================================================================

/**
 * Fetch all active semantic types.
 */
export function useSemanticTypes() {
  return useQuery({
    queryKey: semanticTypeKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<SemanticType[]>('/entities/semantic-types/');
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes (reference data)
  });
}

/**
 * Fetch semantic types grouped by category.
 */
export function useSemanticTypesByCategory() {
  return useQuery({
    queryKey: semanticTypeKeys.byCategory(),
    queryFn: async () => {
      const response = await apiClient.get<Record<SemanticTypeCategory, SemanticType[]>>(
        '/entities/semantic-types/by-category/'
      );
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch semantic types valid for a given IFC class.
 */
export function useSemanticTypesForIfcClass(ifcClass: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: semanticTypeKeys.forIfcClass(ifcClass),
    queryFn: async () => {
      const response = await apiClient.get<SemanticTypeSuggestion[]>(
        `/entities/semantic-types/for-ifc-class/?ifc_class=${encodeURIComponent(ifcClass)}`
      );
      return response.data;
    },
    enabled: enabled && !!ifcClass,
    staleTime: 10 * 60 * 1000,
  });
}

// =============================================================================
// TYPEBANK HOOKS
// =============================================================================

interface UseTypeBankEntriesOptions {
  ifc_class?: string;
  mapping_status?: string;
  search?: string;
  enabled?: boolean;
}

/**
 * Fetch TypeBank entries with optional filters.
 */
export function useTypeBankEntries(options: UseTypeBankEntriesOptions = {}) {
  const { ifc_class, mapping_status, search, enabled = true } = options;

  return useQuery({
    queryKey: typeBankKeys.list({ ifc_class, mapping_status, search }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (ifc_class) params.append('ifc_class', ifc_class);
      if (mapping_status) params.append('mapping_status', mapping_status);
      if (search) params.append('search', search);

      const response = await apiClient.get<PaginatedResponse<TypeBankEntry>>(
        `/entities/type-bank/?${params}`
      );
      return response.data.results || [];
    },
    enabled,
  });
}

/**
 * Fetch a single TypeBank entry with full details.
 */
export function useTypeBankEntry(id: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: typeBankKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<TypeBankEntryFull>(`/entities/type-bank/${id}/`);
      return response.data;
    },
    enabled: enabled && !!id,
  });
}

/**
 * Fetch TypeBank summary statistics.
 */
export function useTypeBankSummary() {
  return useQuery({
    queryKey: typeBankKeys.summary(),
    queryFn: async () => {
      const response = await apiClient.get<TypeBankSummary>('/entities/type-bank/summary/');
      return response.data;
    },
  });
}

/**
 * Fetch semantic type coverage summary.
 */
export function useSemanticSummary() {
  return useQuery({
    queryKey: typeBankKeys.semanticSummary(),
    queryFn: async () => {
      const response = await apiClient.get<SemanticSummary>('/entities/type-bank/semantic-summary/');
      return response.data;
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch semantic type suggestions for a TypeBank entry.
 */
export function useSemanticTypeSuggestions(entryId: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: typeBankKeys.suggestions(entryId),
    queryFn: async () => {
      const response = await apiClient.get<SemanticTypeSuggestion[]>(
        `/entities/type-bank/${entryId}/suggest-semantic-types/`
      );
      return response.data;
    },
    enabled: enabled && !!entryId,
  });
}

// =============================================================================
// TYPEBANK MUTATIONS
// =============================================================================

/**
 * Bulk auto-normalize TypeBank entries.
 */
export function useAutoNormalizeTypeBank() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { overwrite?: boolean; ifc_class?: string } = {}) => {
      const response = await apiClient.post<{ normalized: number; skipped: number }>(
        '/entities/type-bank/auto-normalize/',
        params
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: typeBankKeys.all });
    },
  });
}

interface SetSemanticTypeParams {
  entryId: string;
  semanticTypeCode: string;
}

/**
 * Manually set semantic type for a TypeBank entry.
 */
export function useSetSemanticType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, semanticTypeCode }: SetSemanticTypeParams) => {
      const response = await apiClient.post<{
        status: string;
        semantic_type_code: string;
        semantic_type_name: string;
      }>(`/entities/type-bank/${entryId}/set-semantic-type/`, {
        semantic_type_code: semanticTypeCode,
      });
      return response.data;
    },
    onSuccess: (_, { entryId }) => {
      queryClient.invalidateQueries({ queryKey: typeBankKeys.detail(entryId) });
      queryClient.invalidateQueries({ queryKey: typeBankKeys.list() });
      queryClient.invalidateQueries({ queryKey: typeBankKeys.semanticSummary() });
    },
  });
}

/**
 * Verify/confirm the current semantic type assignment.
 */
export function useVerifySemanticType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiClient.post<{
        status: string;
        semantic_type_code: string;
        semantic_type_name: string;
      }>(`/entities/type-bank/${entryId}/verify-semantic-type/`);
      return response.data;
    },
    onSuccess: (_, entryId) => {
      queryClient.invalidateQueries({ queryKey: typeBankKeys.detail(entryId) });
      queryClient.invalidateQueries({ queryKey: typeBankKeys.list() });
      queryClient.invalidateQueries({ queryKey: typeBankKeys.semanticSummary() });
    },
  });
}
