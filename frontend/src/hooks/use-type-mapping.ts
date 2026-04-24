import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';
import {
  warehouseKeys,
  globalTypeLibraryKeys,
  type NS3451Code,
  type NS3451Hierarchy,
  type IFCType,
  type MappingSummary,
  type TypeMapping,
  type TypeInstancesResponse,
  type BulkUpdateMapping,
  type BulkUpdateResponse,
  type Material,
  type MaterialMapping,
  type DashboardMetrics,
  type ModelVerificationResult,
  type GlobalTypeLibraryEntry,
  type GlobalTypeLibrarySummary,
  type VerificationStatus,
  type VersionDiff,
} from './use-warehouse';

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

      const url = `/types/ns3451-codes/${params.toString() ? `?${params}` : ''}`;
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
        '/types/ns3451-codes/hierarchy/'
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
        `/types/types/?${params}`
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
        `/types/types/summary/?model=${modelId}`
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
        `/types/types/${typeId}/instances/?${params}`
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
        `/types/type-mappings/${mappingId}/`,
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
        '/types/type-mappings/',
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
        '/types/type-mappings/bulk-update/',
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
        `/types/materials/?${params}`
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
        `/types/materials/summary/?model=${modelId}`
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
        `/types/material-mappings/${mappingId}/`,
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
        '/types/material-mappings/',
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
// VERIFICATION ENGINE
// =============================================================================

/**
 * Run verification engine on all types for a model.
 * Updates TypeMapping.verification_status and verification_issues.
 */
export function useVerifyModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiClient.post<ModelVerificationResult>(
        `/types/types/verify/?model=${modelId}`
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate type queries to refresh verification_status badges
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
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
        `/types/types/dashboard-metrics/?${params}`
      );
      return response.data;
    },
    enabled: enabled && !!(projectId || modelId),
    staleTime: 30_000, // Refresh every 30 seconds
  });
}

// =============================================================================
// GLOBAL TYPE LIBRARY (Unified Type-Centric View)
// =============================================================================

interface UseGlobalTypeLibraryOptions {
  projectId?: string;
  modelId?: string;
  ifcClass?: string;
  verificationStatus?: VerificationStatus;
  mappingStatus?: string;
  hasMaterials?: boolean;
  search?: string;
  enabled?: boolean;
}

/**
 * Fetch global type library entries with filtering.
 */
export function useGlobalTypeLibrary(options: UseGlobalTypeLibraryOptions = {}) {
  const {
    projectId,
    modelId,
    ifcClass,
    verificationStatus,
    mappingStatus,
    hasMaterials,
    search,
    enabled = true,
  } = options;

  const filters: Record<string, string> = {};
  if (projectId) filters.project_id = projectId;
  if (modelId) filters.model_id = modelId;
  if (ifcClass) filters.ifc_class = ifcClass;
  if (verificationStatus) filters.verification_status = verificationStatus;
  if (mappingStatus) filters.mapping_status = mappingStatus;
  if (hasMaterials !== undefined) filters.has_materials = String(hasMaterials);
  if (search) filters.search = search;

  return useQuery({
    queryKey: globalTypeLibraryKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      const url = `/types/type-library/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<PaginatedResponse<GlobalTypeLibraryEntry>>(url);
      return response.data.results || [];
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch global type library dashboard summary.
 */
export function useGlobalTypeLibrarySummary(options: { projectId?: string; modelId?: string } = {}) {
  const { projectId, modelId } = options;

  const filters: Record<string, string> = {};
  if (projectId) filters.project_id = projectId;
  if (modelId) filters.model_id = modelId;

  return useQuery({
    queryKey: globalTypeLibraryKeys.summary(filters),
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      const url = `/types/type-library/unified-summary/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<GlobalTypeLibrarySummary>(url);
      return response.data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch empty types (types with 0 instances).
 */
export function useEmptyTypes(options: { projectId?: string; modelId?: string } = {}) {
  const { projectId, modelId } = options;

  const filters: Record<string, string> = {};
  if (projectId) filters.project_id = projectId;
  if (modelId) filters.model_id = modelId;

  return useQuery({
    queryKey: globalTypeLibraryKeys.emptyTypes(filters),
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      const url = `/types/type-library/empty-types/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<PaginatedResponse<GlobalTypeLibraryEntry>>(url);
      return response.data.results || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Verify a type (set verification_status = 'verified').
 */
export function useVerifyType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, notes }: { entryId: string; notes?: string }) => {
      const response = await apiClient.post<GlobalTypeLibraryEntry>(
        `/types/type-library/${entryId}/verify/`,
        notes ? { notes } : {}
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalTypeLibraryKeys.all });
    },
  });
}

/**
 * Flag a type (set verification_status = 'flagged').
 */
export function useFlagType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, flagReason }: { entryId: string; flagReason: string }) => {
      const response = await apiClient.post<GlobalTypeLibraryEntry>(
        `/types/type-library/${entryId}/flag/`,
        { flag_reason: flagReason }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalTypeLibraryKeys.all });
    },
  });
}

/**
 * Reset verification status to pending.
 */
export function useResetVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiClient.post<GlobalTypeLibraryEntry>(
        `/types/type-library/${entryId}/reset-verification/`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalTypeLibraryKeys.all });
    },
  });
}
