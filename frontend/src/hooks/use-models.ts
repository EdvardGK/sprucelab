import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { Model, UploadModelRequest, PaginatedResponse } from '@/lib/api-types';

// Query keys
export const modelKeys = {
  all: ['models'] as const,
  lists: () => [...modelKeys.all, 'list'] as const,
  list: (projectId?: string) => [...modelKeys.lists(), { projectId }] as const,
  details: () => [...modelKeys.all, 'detail'] as const,
  detail: (id: string) => [...modelKeys.details(), id] as const,
  status: (id: string) => [...modelKeys.detail(id), 'status'] as const,
};

// Fetch models for a project
export function useModels(projectId?: string) {
  return useQuery({
    queryKey: modelKeys.list(projectId),
    queryFn: async () => {
      const url = projectId ? `/models/?project=${projectId}` : '/models/';
      const response = await apiClient.get<PaginatedResponse<Model>>(url);
      // Extract the results array from paginated response
      return response.data.results || [];
    },
  });
}

// Fetch single model
export function useModel(id: string) {
  return useQuery({
    queryKey: modelKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<Model>(`/models/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

// Fetch model status
export function useModelStatus(id: string) {
  return useQuery({
    queryKey: modelKeys.status(id),
    queryFn: async () => {
      const response = await apiClient.get<Partial<Model>>(`/models/${id}/status/`);
      return response.data;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll every 2 seconds if processing
      const data = query.state.data;
      if (data?.status === 'processing' || data?.status === 'uploading') {
        return 2000;
      }
      return false;
    },
  });
}

// Upload model mutation
export function useUploadModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UploadModelRequest) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('project_id', data.project_id);
      if (data.name) formData.append('name', data.name);
      // Note: version_number is auto-calculated by backend, not sent by frontend

      const response = await apiClient.post<{ model: Model; message: string }>('/models/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minutes for upload
      });
      // Backend returns { model: {...}, message: "..." }
      return response.data.model;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: modelKeys.list(data.project) });
    },
  });
}
