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

// Geometry types
export interface ModelGeometry {
  entity_id: string;
  ifc_guid: string;
  ifc_type: string;
  name: string;
  vertices: number[]; // Flat array [x,y,z, x,y,z, ...]
  faces: number[]; // Flat array of indices
  vertex_count: number;
  triangle_count: number;
}

export interface GeometryResponse {
  model_id: string;
  model_name: string;
  geometry_count: number;
  geometries: ModelGeometry[];
}

// Fetch model geometry
export function useModelGeometry(modelId: string) {
  return useQuery({
    queryKey: [...modelKeys.detail(modelId), 'geometry'],
    queryFn: async () => {
      const response = await apiClient.get<GeometryResponse>(`/models/${modelId}/geometry/`);
      return response.data;
    },
    enabled: !!modelId,
    staleTime: 5 * 60 * 1000, // Geometry doesn't change often, cache for 5 minutes
  });
}

// Delete preview types
export interface DeletePreviewChildVersion {
  id: string;
  version: number;
  name: string;
  status: string;
  is_published: boolean;
  element_count: number;
}

export interface DeletePreview {
  model: {
    id: string;
    name: string;
    version: number;
    status: string;
    is_published: boolean;
    element_count: number;
    file_size: number;
    file_size_mb: number;
    created_at: string;
  };
  child_versions: {
    count: number;
    versions: DeletePreviewChildVersion[];
  };
  impact: {
    total_models_deleted: number;
    total_entities_deleted: number;
    total_file_size_deleted: number;
    total_file_size_deleted_mb: number;
  };
  warnings: string[];
  can_delete: boolean;
  deletion_note: string;
}

// Fetch delete preview
export function useDeletePreview(modelId: string, enabled: boolean = false) {
  return useQuery({
    queryKey: [...modelKeys.detail(modelId), 'delete_preview'],
    queryFn: async () => {
      const response = await apiClient.get<DeletePreview>(`/models/${modelId}/delete_preview/`);
      return response.data;
    },
    enabled: !!modelId && enabled,
  });
}

// Delete model mutation
export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiClient.delete<{
        message: string;
        deleted_model: {
          id: string;
          name: string;
          version: number;
          project: string;
          is_published: boolean;
          child_versions_deleted: number;
        };
        deleted_files: string[];
        total_models_deleted: number;
      }>(`/models/${modelId}/`);
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate all model lists (we don't know which project it belonged to)
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() });
      // Remove the specific model from cache
      queryClient.removeQueries({ queryKey: modelKeys.detail(data.deleted_model.id) });
    },
  });
}
