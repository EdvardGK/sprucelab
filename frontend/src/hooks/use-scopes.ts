import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface CanonicalFloor {
  code: string;
  name: string;
  elevation_m: number | null;
  aliases?: string[];
  _promoted_from_claim?: string;
  _promoted_at?: string;
}

export interface ProposedFloor {
  name: string;
  elevation_m: number | null;
  source_guid?: string | null;
}

export type FloorIssueSeverity = 'error' | 'warning' | 'info';

export interface FloorIssue {
  rule_id: string;
  rule_name: string;
  severity: FloorIssueSeverity;
  message: string;
}

export interface ScopeModelFloors {
  model_id: string;
  model_name: string;
  source_file_id: string | null;
  proposed_floors: ProposedFloor[];
  issues: FloorIssue[];
}

export interface ScopeFloorsResponse {
  scope_id: string;
  scope_name: string;
  storey_merge_tolerance_m: number;
  canonical_floors: CanonicalFloor[];
  models: ScopeModelFloors[];
}

export interface ProjectScopeListItem {
  id: string;
  project: string;
  parent: string | null;
  name: string;
  scope_type: string;
}

export const scopesKeys = {
  all: ['scopes'] as const,
  list: (projectId?: string) => [...scopesKeys.all, 'list', projectId] as const,
  detail: (id: string) => [...scopesKeys.all, 'detail', id] as const,
  floors: (id: string) => [...scopesKeys.all, 'floors', id] as const,
};

export function useProjectScopes(projectId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scopesKeys.list(projectId ?? undefined),
    queryFn: async () => {
      const response = await apiClient.get<{ results: ProjectScopeListItem[] } | ProjectScopeListItem[]>(
        `/projects/scopes/?project=${projectId}`,
      );
      const data = response.data;
      return Array.isArray(data) ? data : data.results;
    },
    enabled: !!projectId && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useScopeFloors(scopeId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scopesKeys.floors(scopeId || ''),
    queryFn: async () => {
      const response = await apiClient.get<ScopeFloorsResponse>(
        `/projects/scopes/${scopeId}/floors/`,
      );
      return response.data;
    },
    enabled: !!scopeId && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}
