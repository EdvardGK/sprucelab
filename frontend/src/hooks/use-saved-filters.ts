import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';
import type { FilterContext } from '@/lib/embed/types';

/**
 * React Query hooks for `/api/filters/saved/` (personal scope).
 *
 * v1 surface: list / create / update / delete. Library + Pin + Announcement
 * UI is deferred — those endpoints exist on the backend but no consumer here.
 */

export type SavedFilterScope = 'personal' | 'company' | 'project';

/** Payload shape mirrors the JSON the URL serializer (`useProjectFilterUrl`) emits. */
export type SavedFilterPayload = Partial<FilterContext> & Record<string, unknown>;

export interface SavedFilterListItem {
  id: string;
  scope: SavedFilterScope;
  owner_user: string | null;
  owner_company: string | null;
  owner_project: string | null;
  name: string;
  is_auto_derived: boolean;
  updated_at: string;
}

export interface SavedFilter extends SavedFilterListItem {
  description: string;
  payload: SavedFilterPayload;
  created_at: string;
  created_by: string | null;
}

export const savedFilterKeys = {
  all: ['saved-filters'] as const,
  list: (projectId: string | undefined) =>
    [...savedFilterKeys.all, 'list', projectId ?? null] as const,
  detail: (id: string) => [...savedFilterKeys.all, 'detail', id] as const,
};

/**
 * List personal-scope saved filters visible to the requester.
 *
 * `projectId` is sent as a query param for future server-side scoping; the
 * current backend ignores it, but the param round-trips so we don't have to
 * change the hook signature when that filter lands.
 */
export function useSavedFilters(projectId: string | undefined) {
  return useQuery({
    queryKey: savedFilterKeys.list(projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('scope', 'personal');
      if (projectId) params.append('project', projectId);
      const response = await apiClient.get<
        PaginatedResponse<SavedFilterListItem> | SavedFilterListItem[]
      >(`/filters/saved/?${params.toString()}`);
      const data = response.data;
      return Array.isArray(data) ? data : data.results;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

interface CreateSavedFilterVars {
  name: string;
  payload: SavedFilterPayload;
  /** Stored in the payload only — personal-scope filters cannot bind owner_project. */
  projectId: string;
  description?: string;
}

export function useCreateSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, payload, description }: CreateSavedFilterVars) => {
      const body = {
        name,
        scope: 'personal' as const,
        payload,
        description: description ?? '',
      };
      const response = await apiClient.post<SavedFilter>('/filters/saved/', body);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedFilterKeys.all });
    },
  });
}

interface UpdateSavedFilterVars {
  id: string;
  name?: string;
  payload?: SavedFilterPayload;
  description?: string;
}

export function useUpdateSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateSavedFilterVars) => {
      const response = await apiClient.patch<SavedFilter>(`/filters/saved/${id}/`, patch);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedFilterKeys.all });
    },
  });
}

export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/filters/saved/${id}/`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedFilterKeys.all });
    },
  });
}
