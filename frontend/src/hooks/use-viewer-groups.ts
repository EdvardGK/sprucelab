import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/lib/api-client';
import type {
  ViewerGroup,
  ViewerGroupListItem,
  ViewerModel,
  CreateViewerGroupRequest,
  UpdateViewerGroupRequest,
  CreateViewerModelRequest,
  UpdateViewerModelRequest,
} from '@/lib/api-types';

// Query keys
export const viewerGroupKeys = {
  all: ['viewer-groups'] as const,
  lists: () => [...viewerGroupKeys.all, 'list'] as const,
  list: (projectId?: string) => [...viewerGroupKeys.lists(), { projectId }] as const,
  details: () => [...viewerGroupKeys.all, 'detail'] as const,
  detail: (id: string) => [...viewerGroupKeys.details(), id] as const,
  models: (groupId?: string) => [...viewerGroupKeys.all, 'models', { groupId }] as const,
};

// Fetch all viewer groups for a project
export function useViewerGroups(projectId?: string) {
  return useQuery({
    queryKey: viewerGroupKeys.list(projectId),
    queryFn: async () => {
      const url = projectId ? `/viewers/groups/?project=${projectId}` : '/viewers/groups/';
      const response = await apiClient.get<{ results: ViewerGroupListItem[] }>(url);
      return response.data.results; // Extract the results array from paginated response
    },
    enabled: !!projectId,
  });
}

// Fetch single viewer group with models
export function useViewerGroup(id: string) {
  return useQuery({
    queryKey: viewerGroupKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ViewerGroup>(`/viewers/groups/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

// Fetch models for a group
export function useViewerModels(groupId?: string) {
  return useQuery({
    queryKey: viewerGroupKeys.models(groupId),
    queryFn: async () => {
      const url = groupId ? `/viewers/models/?group=${groupId}` : '/viewers/models/';
      const response = await apiClient.get<{ results: ViewerModel[] }>(url);
      return response.data.results; // Extract the results array from paginated response
    },
    enabled: !!groupId,
  });
}

// Create viewer group mutation
export function useCreateViewerGroup() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: CreateViewerGroupRequest) => {
      const response = await apiClient.post<ViewerGroup>('/viewers/groups/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.list(data.project) });
      // Navigate to viewer page for the new group
      navigate(`/projects/${data.project}/viewer/${data.id}`);
    },
  });
}

// Update viewer group mutation
export function useUpdateViewerGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateViewerGroupRequest }) => {
      const response = await apiClient.patch<ViewerGroup>(`/viewers/groups/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.list(data.project) });
    },
  });
}

// Delete viewer group mutation
export function useDeleteViewerGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/viewers/groups/${id}/`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.lists() });
    },
  });
}

// Create viewer model assignment mutation
export function useCreateViewerModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateViewerModelRequest) => {
      const response = await apiClient.post<ViewerModel>('/viewers/models/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.models(data.group) });
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.detail(data.group) });
    },
  });
}

// Update viewer model mutation
export function useUpdateViewerModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateViewerModelRequest }) => {
      const response = await apiClient.patch<ViewerModel>(`/viewers/models/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.models(data.group) });
    },
  });
}

// Delete viewer model assignment mutation
export function useDeleteViewerModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/viewers/models/${id}/`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.models() });
    },
  });
}

// Update viewer model coordination
export function useUpdateViewerModelCoordination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: {
        offset_x?: number;
        offset_y?: number;
        offset_z?: number;
        rotation?: number;
      }
    }) => {
      const response = await apiClient.patch<ViewerModel>(`/viewers/models/${id}/coordinate/`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.models() });
    },
  });
}

// Batch update viewer models
export function useBatchUpdateViewerModels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Array<{ id: string; [key: string]: any }>) => {
      const response = await apiClient.post('/viewers/models/batch-update/', { updates });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewerGroupKeys.models() });
    },
  });
}
