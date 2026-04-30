import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { ClaimIssue, ClaimIssuesResponse } from '@/lib/claim-issues-types';

export const claimIssuesKeys = {
  all: ['claim-issues'] as const,
  forType: (projectId: string | undefined, typeName: string | undefined) =>
    [...claimIssuesKeys.all, projectId ?? '', typeName ?? ''] as const,
};

export function useTypeClaimIssues(
  projectId: string | undefined,
  typeName: string | undefined | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: claimIssuesKeys.forType(projectId, typeName ?? undefined),
    queryFn: async (): Promise<ClaimIssue[]> => {
      const response = await apiClient.get<ClaimIssuesResponse>(
        '/types/types/claim-issues/',
        { params: { project: projectId, type_name: typeName } },
      );
      return response.data.results;
    },
    enabled: !!projectId && !!typeName && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}
