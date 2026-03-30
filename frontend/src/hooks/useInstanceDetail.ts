import { useQuery } from '@tanstack/react-query';
import { useModel } from './use-models';
import {
  openFromUrl,
  getElement,
  getCachedFileId,
  type ElementDetail,
} from '@/lib/ifc-service-client';

/**
 * Fetch detailed properties for a single IFC instance.
 * Handles FastAPI file loading (cached) and element detail fetching.
 */
export function useInstanceDetail(modelId: string, instanceGuid: string | null) {
  const { data: model } = useModel(modelId);

  return useQuery({
    queryKey: ['instance-detail', modelId, instanceGuid],
    queryFn: async (): Promise<ElementDetail> => {
      const fileUrl = model!.file_url!;

      // Get or create fileId (openFromUrl is idempotent/cached)
      let fileId = getCachedFileId(fileUrl);
      if (!fileId) {
        const result = await openFromUrl(fileUrl);
        fileId = result.file_id;
      }

      return getElement(fileId, instanceGuid!);
    },
    enabled: !!model?.file_url && !!instanceGuid,
    staleTime: 5 * 60 * 1000, // 5 min - instance data doesn't change
  });
}
