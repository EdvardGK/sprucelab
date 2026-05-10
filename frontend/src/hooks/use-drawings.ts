// React Query hooks for the Phase 5 drawing layer.
// Mirrors `use-documents.ts` for read hooks, plus mutations for upload/register/delete.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';

export type DrawingFormat = 'dwg' | 'dxf' | 'pdf' | 'svg';

export interface DrawingSheetListItem {
  id: string;
  source_file: string;
  scope: string | null;
  page_index: number;
  sheet_number: string;
  sheet_name: string;
  width_mm: number | null;
  height_mm: number | null;
  scale: string;
  title_block_data: Record<string, unknown>;
}

export interface DrawingSheetDetail extends DrawingSheetListItem {
  extraction_run: string;
  raw_metadata: Record<string, unknown>;
}

export interface DrawingsFilters {
  project?: string;
  scope?: string;
  source_file?: string;
  is_drawing?: boolean;
}

export interface DrawingRegistrationPayload {
  ref1: { paper_x: number; paper_y: number; grid_u: string; grid_v: string };
  ref2: { paper_x: number; paper_y: number; grid_u: string; grid_v: string };
  grid_source_run: string;
}

export interface DrawingRegistrationResult {
  id: string;
  drawing_sheet: string;
  ref1_paper_x: number;
  ref1_paper_y: number;
  ref1_grid_u: string;
  ref1_grid_v: string;
  ref2_paper_x: number;
  ref2_paper_y: number;
  ref2_grid_u: string;
  ref2_grid_v: string;
  transform_matrix: number[][];
  grid_source_run: string | null;
  created_at: string;
}

export const drawingsKeys = {
  all: ['drawings'] as const,
  list: (filters?: DrawingsFilters) => [...drawingsKeys.all, 'list', filters] as const,
  detail: (id: string) => [...drawingsKeys.all, 'detail', id] as const,
};

function buildParams(filters: DrawingsFilters | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;
  if (filters.project) params.append('project', filters.project);
  if (filters.scope) params.append('scope', filters.scope);
  if (filters.source_file) params.append('source_file', filters.source_file);
  if (typeof filters.is_drawing === 'boolean') {
    params.append('is_drawing', filters.is_drawing ? 'true' : 'false');
  }
  return params;
}

export function useDrawingsList(
  projectId: string | null | undefined,
  filters?: Omit<DrawingsFilters, 'project'>,
  options?: { enabled?: boolean },
) {
  const merged: DrawingsFilters | undefined = projectId
    ? { ...filters, project: projectId }
    : undefined;
  return useQuery({
    queryKey: drawingsKeys.list(merged),
    queryFn: async () => {
      const params = buildParams(merged);
      const url = `/types/drawings/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<
        PaginatedResponse<DrawingSheetListItem> | DrawingSheetListItem[]
      >(url);
      const data = response.data;
      return Array.isArray(data) ? data : data.results;
    },
    enabled: (options?.enabled ?? true) && !!projectId,
    staleTime: 30_000,
  });
}

export function useDrawingDetail(drawingId: string | null) {
  return useQuery({
    queryKey: drawingsKeys.detail(drawingId || ''),
    queryFn: async () => {
      const response = await apiClient.get<DrawingSheetDetail>(`/types/drawings/${drawingId}/`);
      return response.data;
    },
    enabled: !!drawingId,
    staleTime: 30_000,
  });
}

// Upload a drawing file via the universal SourceFile endpoint.
// `format` on SourceFile is auto-detected by extension server-side; the
// caller supplies project + file. We surface upload progress for the UI.
export interface UploadDrawingArgs {
  projectId: string;
  file: File;
  onProgress?: (percent: number) => void;
}

export function useUploadDrawing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, file, onProgress }: UploadDrawingArgs) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);
      const response = await apiClient.post('/files/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return;
          onProgress(Math.round((event.loaded * 100) / event.total));
        },
      });
      return response.data as { id: string; project: string; format: string };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: drawingsKeys.list({ project: variables.projectId }),
      });
      queryClient.invalidateQueries({ queryKey: drawingsKeys.all });
    },
  });
}

export function useRegisterDrawing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      drawingId,
      payload,
    }: {
      drawingId: string;
      payload: DrawingRegistrationPayload;
    }) => {
      const response = await apiClient.post<DrawingRegistrationResult>(
        `/types/drawings/${drawingId}/register`,
        payload,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: drawingsKeys.detail(variables.drawingId) });
      queryClient.invalidateQueries({ queryKey: drawingsKeys.all });
    },
  });
}

// Delete the underlying SourceFile (cascades to DrawingSheet).
// We accept the source_file id because DrawingSheetViewSet is read-only.
export function useDeleteDrawing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceFileId }: { sourceFileId: string; projectId: string }) => {
      await apiClient.delete(`/files/${sourceFileId}/`);
      return { sourceFileId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: drawingsKeys.list({ project: variables.projectId }),
      });
      queryClient.invalidateQueries({ queryKey: drawingsKeys.all });
    },
  });
}
