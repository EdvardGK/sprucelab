import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type {
  ExtractionRun,
  ExtractionRunListItem,
  ExtractionRunStatus,
  PaginatedResponse,
  SourceFileListItem,
} from '@/lib/api-types';

export const extractionKeys = {
  all: ['extractions'] as const,
  lists: () => [...extractionKeys.all, 'list'] as const,
  list: (filters?: ExtractionFilters) => [...extractionKeys.lists(), filters] as const,
  details: () => [...extractionKeys.all, 'detail'] as const,
  detail: (id: string) => [...extractionKeys.details(), id] as const,
  bySourceFile: (sourceFileId: string) =>
    [...extractionKeys.all, 'source-file', sourceFileId] as const,
};

export interface ExtractionFilters {
  source_file?: string;
  status?: ExtractionRunStatus;
}

/** Hydrated row carrying the SourceFile metadata the dev table needs. */
export interface ExtractionRunRow extends ExtractionRunListItem {
  source_file_name: string | null;
  project_name: string | null;
  format: string | null;
  file_size: number | null;
}

async function fetchSourceFileIndex(): Promise<Map<string, SourceFileListItem>> {
  const response = await apiClient.get<PaginatedResponse<SourceFileListItem> | SourceFileListItem[]>(
    '/files/'
  );
  const data = response.data;
  const items = Array.isArray(data) ? data : data.results || [];
  return new Map(items.map((sf) => [sf.id, sf]));
}

function hydrate(
  run: ExtractionRunListItem,
  index: Map<string, SourceFileListItem>
): ExtractionRunRow {
  const sf = index.get(run.source_file);
  return {
    ...run,
    source_file_name: sf?.original_filename ?? null,
    project_name: sf?.project_name ?? null,
    format: sf?.format ?? null,
    file_size: sf?.file_size ?? null,
  };
}

/** List extraction runs (with SourceFile metadata folded in for the table). */
export function useExtractions(filters?: ExtractionFilters) {
  return useQuery({
    queryKey: extractionKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.source_file) params.append('source_file', filters.source_file);
      if (filters?.status) params.append('status', filters.status);

      const url = `/files/extractions/${params.toString() ? `?${params.toString()}` : ''}`;
      const [runsResponse, index] = await Promise.all([
        apiClient.get<PaginatedResponse<ExtractionRunListItem> | ExtractionRunListItem[]>(url),
        fetchSourceFileIndex(),
      ]);
      const data = runsResponse.data;
      const runs = Array.isArray(data) ? data : data.results || [];
      return runs.map((r) => hydrate(r, index));
    },
  });
}

/** Detail view (full quality_report + log_entries). */
export function useExtraction(id: string) {
  return useQuery({
    queryKey: extractionKeys.detail(id),
    queryFn: async () => {
      const [runResponse, index] = await Promise.all([
        apiClient.get<ExtractionRun>(`/files/extractions/${id}/`),
        fetchSourceFileIndex(),
      ]);
      const run = runResponse.data;
      const sf = index.get(run.source_file);
      return {
        ...run,
        source_file_name: sf?.original_filename ?? null,
        project_name: sf?.project_name ?? null,
        format: sf?.format ?? null,
        file_size: sf?.file_size ?? null,
      };
    },
    enabled: !!id,
  });
}

/** All extraction runs for a single SourceFile. */
export function useSourceFileExtractions(sourceFileId: string) {
  return useQuery({
    queryKey: extractionKeys.bySourceFile(sourceFileId),
    queryFn: async () => {
      const response = await apiClient.get<ExtractionRunListItem[]>(
        `/files/${sourceFileId}/extractions/`
      );
      return response.data;
    },
    enabled: !!sourceFileId,
  });
}
