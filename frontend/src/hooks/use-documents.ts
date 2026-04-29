import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';
import type {
  DocumentDetail,
  DocumentListItem,
  DocumentsFilters,
} from '@/lib/claims-types';

export const documentsKeys = {
  all: ['documents'] as const,
  list: (filters?: DocumentsFilters) => [...documentsKeys.all, 'list', filters] as const,
  detail: (id: string) => [...documentsKeys.all, 'detail', id] as const,
  content: (id: string, as: 'markdown' | 'json') =>
    [...documentsKeys.all, 'content', id, as] as const,
};

function buildParams(filters: DocumentsFilters | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;
  if (filters.project) params.append('project', filters.project);
  if (filters.scope) params.append('scope', filters.scope);
  if (filters.source_file) params.append('source_file', filters.source_file);
  if (filters.format) params.append('format', filters.format);
  if (filters.extraction_method) params.append('extraction_method', filters.extraction_method);
  return params;
}

export function useDocumentsList(filters?: DocumentsFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: documentsKeys.list(filters),
    queryFn: async () => {
      const params = buildParams(filters);
      const url = `/types/documents/${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<PaginatedResponse<DocumentListItem> | DocumentListItem[]>(url);
      const data = response.data;
      return Array.isArray(data) ? data : data.results;
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useDocumentDetail(documentId: string | null) {
  return useQuery({
    queryKey: documentsKeys.detail(documentId || ''),
    queryFn: async () => {
      const response = await apiClient.get<DocumentDetail>(`/types/documents/${documentId}/`);
      return response.data;
    },
    enabled: !!documentId,
    staleTime: 30_000,
  });
}

export function useDocumentContent(
  documentId: string | null,
  as: 'markdown' | 'json' = 'markdown',
) {
  return useQuery({
    queryKey: documentsKeys.content(documentId || '', as),
    queryFn: async () => {
      const response = await apiClient.get<Record<string, unknown>>(
        `/types/documents/${documentId}/content/?as=${as}`,
      );
      return response.data;
    },
    enabled: !!documentId,
    staleTime: 60_000,
  });
}
