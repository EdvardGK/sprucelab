import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { ProcessingReport, PaginatedResponse } from '@/lib/api-types';

// Query keys
export const processingReportKeys = {
  all: ['processing-reports'] as const,
  lists: () => [...processingReportKeys.all, 'list'] as const,
  list: (filters?: ProcessingReportFilters) => [...processingReportKeys.lists(), filters] as const,
  details: () => [...processingReportKeys.all, 'detail'] as const,
  detail: (id: string) => [...processingReportKeys.details(), id] as const,
  byModel: (modelId: string) => [...processingReportKeys.all, 'model', modelId] as const,
};

export interface ProcessingReportFilters {
  model?: string;
  overall_status?: 'success' | 'partial' | 'failed';
  catastrophic_failure?: boolean;
  ordering?: string;
}

// Fetch all processing reports (with optional filters)
export function useProcessingReports(filters?: ProcessingReportFilters) {
  return useQuery({
    queryKey: processingReportKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters?.model) params.append('model', filters.model);
      if (filters?.overall_status) params.append('overall_status', filters.overall_status);
      if (filters?.catastrophic_failure !== undefined) {
        params.append('catastrophic_failure', String(filters.catastrophic_failure));
      }
      if (filters?.ordering) params.append('ordering', filters.ordering);

      const url = `/entities/processing-reports/${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<PaginatedResponse<ProcessingReport>>(url);

      // Extract the results array from paginated response
      return response.data.results || [];
    },
  });
}

// Fetch single processing report by ID
export function useProcessingReport(id: string) {
  return useQuery({
    queryKey: processingReportKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ProcessingReport>(`/entities/processing-reports/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

// Fetch processing reports for a specific model
export function useModelProcessingReports(modelId: string) {
  return useQuery({
    queryKey: processingReportKeys.byModel(modelId),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<ProcessingReport>>(
        `/entities/processing-reports/?model=${modelId}`
      );
      return response.data.results || [];
    },
    enabled: !!modelId,
  });
}
