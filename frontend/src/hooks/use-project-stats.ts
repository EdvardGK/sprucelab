import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { ProjectStatistics } from '@/lib/api-types';

// Query keys
export const projectStatsKeys = {
  all: ['project-stats'] as const,
  detail: (projectId: string) => [...projectStatsKeys.all, projectId] as const,
};

// Fetch project statistics
export function useProjectStatistics(projectId: string) {
  return useQuery({
    queryKey: projectStatsKeys.detail(projectId),
    queryFn: async () => {
      const response = await apiClient.get<ProjectStatistics>(
        `/projects/${projectId}/statistics/`
      );
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}
