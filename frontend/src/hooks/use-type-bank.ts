import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';
import {
  typeBankKeys,
  semanticTypeKeys,
  type SemanticType,
  type SemanticTypeCategory,
  type SemanticTypeSuggestion,
  type SemanticSummary,
  type TypeBankEntry,
  type TypeBankEntryFull,
  type TypeBankSummary,
} from './use-warehouse';

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
      const response = await apiClient.get<SemanticType[]>('/types/semantic-types/');
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
        '/types/semantic-types/by-category/'
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
        `/types/semantic-types/for-ifc-class/?ifc_class=${encodeURIComponent(ifcClass)}`
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
        `/types/type-bank/?${params}`
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
      const response = await apiClient.get<TypeBankEntryFull>(`/types/type-bank/${id}/`);
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
      const response = await apiClient.get<TypeBankSummary>('/types/type-bank/summary/');
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
      const response = await apiClient.get<SemanticSummary>('/types/type-bank/semantic-summary/');
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
        `/types/type-bank/${entryId}/suggest-semantic-types/`
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
        '/types/type-bank/auto-normalize/',
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
      }>(`/types/type-bank/${entryId}/set-semantic-type/`, {
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
      }>(`/types/type-bank/${entryId}/verify-semantic-type/`);
      return response.data;
    },
    onSuccess: (_, entryId) => {
      queryClient.invalidateQueries({ queryKey: typeBankKeys.detail(entryId) });
      queryClient.invalidateQueries({ queryKey: typeBankKeys.list() });
      queryClient.invalidateQueries({ queryKey: typeBankKeys.semanticSummary() });
    },
  });
}
