import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { ModelAnalysis, PaginatedResponse } from '@/lib/api-types';

export const analysisKeys = {
  all: ['model-analysis'] as const,
  detail: (modelId: string) => [...analysisKeys.all, modelId] as const,
};

export function useModelAnalysis(modelId: string) {
  return useQuery({
    queryKey: analysisKeys.detail(modelId),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<ModelAnalysis>>(
        `/entities/model-analysis/?model=${modelId}`
      );
      return response.data.results[0] ?? null;
    },
    enabled: !!modelId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRunAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiClient.post<ModelAnalysis>(
        `/entities/model-analysis/run_analysis/`,
        { model_id: modelId }
      );
      return response.data;
    },
    onSuccess: (_data, modelId) => {
      queryClient.invalidateQueries({ queryKey: analysisKeys.detail(modelId) });
    },
  });
}
