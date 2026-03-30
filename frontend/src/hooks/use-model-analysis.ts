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
    // Poll every 5s while analysis hasn't arrived yet (auto-triggered on upload)
    // Stops polling once analysis data exists
    refetchInterval: (query) => {
      const data = query.state.data;
      // null = fetched but no analysis yet; undefined = hasn't fetched yet
      return data === null ? 5000 : false;
    },
  });
}

export function useRunAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiClient.post<ModelAnalysis>(
        `/entities/model-analysis/run/`,
        { model: modelId }
      );
      return response.data;
    },
    onSuccess: (_data, modelId) => {
      queryClient.invalidateQueries({ queryKey: analysisKeys.detail(modelId) });
    },
  });
}
