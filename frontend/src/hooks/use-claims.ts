import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';
import type {
  Claim,
  ClaimConflictsResponse,
  ClaimListItem,
  ClaimPromoteRequest,
  ClaimPromoteResult,
  ClaimRejectResult,
  ClaimSupersedeResult,
  ClaimsFilters,
} from '@/lib/claims-types';

export const claimsKeys = {
  all: ['claims'] as const,
  list: (filters?: ClaimsFilters) => [...claimsKeys.all, 'list', filters] as const,
  detail: (id: string) => [...claimsKeys.all, 'detail', id] as const,
  conflicts: (id: string) => [...claimsKeys.all, 'conflicts', id] as const,
};

function buildParams(filters: ClaimsFilters | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;
  if (filters.project) params.append('project', filters.project);
  if (filters.scope) params.append('scope', filters.scope);
  if (filters.source_file) params.append('source_file', filters.source_file);
  if (filters.document) params.append('document', filters.document);
  if (filters.status) params.append('status', filters.status);
  if (filters.claim_type) params.append('claim_type', filters.claim_type);
  if (filters.min_confidence !== undefined) {
    params.append('min_confidence', String(filters.min_confidence));
  }
  return params;
}

export function useClaimsList(filters?: ClaimsFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: claimsKeys.list(filters),
    queryFn: async () => {
      const params = buildParams(filters);
      const url = `/types/claims/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<PaginatedResponse<ClaimListItem> | ClaimListItem[]>(url);
      const data = response.data;
      return Array.isArray(data) ? data : data.results;
    },
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useClaimDetail(claimId: string | null) {
  return useQuery({
    queryKey: claimsKeys.detail(claimId || ''),
    queryFn: async () => {
      const response = await apiClient.get<Claim>(`/types/claims/${claimId}/`);
      return response.data;
    },
    enabled: !!claimId,
    staleTime: 15_000,
  });
}

export function useClaimConflicts(claimId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: claimsKeys.conflicts(claimId || ''),
    queryFn: async () => {
      const response = await apiClient.get<ClaimConflictsResponse>(
        `/types/claims/${claimId}/conflicts/`,
      );
      return response.data;
    },
    enabled: !!claimId && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

interface PromoteVars {
  claimId: string;
  body?: ClaimPromoteRequest;
  dryRun?: boolean;
}

export function usePromoteClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, body, dryRun }: PromoteVars) => {
      const url = `/types/claims/${claimId}/promote/${dryRun ? '?dry_run=true' : ''}`;
      const response = await apiClient.post<ClaimPromoteResult>(url, body ?? {});
      return response.data;
    },
    onSuccess: (_data, { dryRun, claimId }) => {
      if (dryRun) return;
      queryClient.invalidateQueries({ queryKey: claimsKeys.all });
      queryClient.invalidateQueries({ queryKey: claimsKeys.detail(claimId) });
    },
  });
}

interface RejectVars {
  claimId: string;
  reason: string;
  dryRun?: boolean;
}

export function useRejectClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, reason, dryRun }: RejectVars) => {
      const url = `/types/claims/${claimId}/reject/${dryRun ? '?dry_run=true' : ''}`;
      const response = await apiClient.post<ClaimRejectResult>(url, { reason });
      return response.data;
    },
    onSuccess: (_data, { dryRun, claimId }) => {
      if (dryRun) return;
      queryClient.invalidateQueries({ queryKey: claimsKeys.all });
      queryClient.invalidateQueries({ queryKey: claimsKeys.detail(claimId) });
    },
  });
}

interface SupersedeVars {
  claimId: string;
  supersededByClaimId: string;
  dryRun?: boolean;
}

export function useSupersedeClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, supersededByClaimId, dryRun }: SupersedeVars) => {
      const url = `/types/claims/${claimId}/supersede/${dryRun ? '?dry_run=true' : ''}`;
      const response = await apiClient.post<ClaimSupersedeResult>(url, {
        superseded_by_claim_id: supersededByClaimId,
      });
      return response.data;
    },
    onSuccess: (_data, { dryRun, claimId }) => {
      if (dryRun) return;
      queryClient.invalidateQueries({ queryKey: claimsKeys.all });
      queryClient.invalidateQueries({ queryKey: claimsKeys.detail(claimId) });
    },
  });
}
