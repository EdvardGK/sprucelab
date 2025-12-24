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

// Version warning from upload response
export interface VersionWarning {
  type: 'older_file' | 'same_timestamp';
  message: string;
  current_version_timestamp: string;
  uploaded_file_timestamp: string;
}

// Upload response type
export interface UploadResponse {
  model: Model;
  message: string;
  version_warning?: VersionWarning;
  quick_stats?: {
    ifc_schema: string;
    total_elements: number;
    storey_count: number;
    type_count: number;
    material_count: number;
    top_entity_types: Array<{ type: string; count: number }>;
    storey_names: string[];
    stats_duration_ms: number;
  };
  task_id?: string;
}

// Upload model mutation (legacy - uploads through Django)
export function useUploadModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UploadModelRequest): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('project_id', data.project);
      if (data.name) formData.append('name', data.name);
      // Note: version_number is auto-calculated by backend, not sent by frontend

      const response = await apiClient.post<UploadResponse>('/models/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minutes for upload
      });
      // Return full response including version_warning
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: modelKeys.list(data.model.project) });
    },
  });
}

// Direct upload types
export interface UploadUrlResponse {
  upload_url: string;
  file_path: string;
  file_url: string;
  expires_in: number;
}

export interface ConfirmUploadRequest {
  project_id: string;
  file_path: string;
  file_url: string;
  filename: string;
  file_size: number;
  name?: string;
}

// Get presigned URL for direct Supabase upload
export async function getUploadUrl(projectId: string, filename: string): Promise<UploadUrlResponse> {
  const response = await apiClient.post<UploadUrlResponse>('/models/get-upload-url/', {
    project_id: projectId,
    filename,
  });
  return response.data;
}

// Confirm upload after direct upload to Supabase
export async function confirmUpload(data: ConfirmUploadRequest): Promise<UploadResponse> {
  const response = await apiClient.post<UploadResponse>('/models/confirm-upload/', data);
  return response.data;
}

// Hook for confirming upload with query invalidation
export function useConfirmUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: confirmUpload,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: modelKeys.list(data.model.project) });
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
