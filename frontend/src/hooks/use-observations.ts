import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export type ObservationCategory =
  | 'text_block'
  | 'layer'
  | 'annotation'
  | 'title_block_field'
  | 'sheet_metadata'
  | 'file_metadata'
  | 'extraction_event'
  | 'other';

export interface Observation {
  id: string;
  source_file: string;
  extraction_run: string;
  sheet: string | null;
  scope: string | null;
  project: string | null;
  original_filename: string;
  category: ObservationCategory;
  key: string;
  content: string;
  page_index: number | null;
  bbox: { x_mm?: number | null; y_mm?: number | null; w_mm?: number | null; h_mm?: number | null };
  raw_data: Record<string, unknown>;
  extracted_at: string;
}

export interface ObservationFilters {
  source_file?: string;
  sheet?: string;
  extraction_run?: string;
  project?: string;
  category?: ObservationCategory[] | ObservationCategory;
  search?: string;
  page_index?: number;
}

export const observationsKeys = {
  all: ['observations'] as const,
  list: (filters: ObservationFilters) =>
    [...observationsKeys.all, 'list', filters] as const,
};

interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export function useObservations(filters: ObservationFilters, enabled = true) {
  return useQuery({
    queryKey: observationsKeys.list(filters),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.source_file) params.source_file = filters.source_file;
      if (filters.sheet) params.sheet = filters.sheet;
      if (filters.extraction_run) params.extraction_run = filters.extraction_run;
      if (filters.project) params.project = filters.project;
      if (filters.search) params.search = filters.search;
      if (filters.page_index !== undefined) params.page_index = String(filters.page_index);
      if (filters.category) {
        params.category = Array.isArray(filters.category)
          ? filters.category.join(',')
          : filters.category;
      }
      const response = await apiClient.get<PaginatedResponse<Observation> | Observation[]>(
        '/types/observations/',
        { params },
      );
      const data = response.data;
      return Array.isArray(data) ? data : data.results ?? [];
    },
    enabled,
    staleTime: 30_000,
  });
}
