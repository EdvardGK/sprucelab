import { useQuery } from '@tanstack/react-query';
import { useModel } from './use-models';
import {
  openFromUrl,
  getElementProfile,
  getCachedFileId,
  type ProfileData,
} from '@/lib/ifc-service-client';

// In-memory profile cache for instant prev/next navigation
const profileCache = new Map<string, ProfileData | null>();

/**
 * Fetch 2D cross-section profile (IfcProfileDef) for a single IFC instance.
 * Returns parametric params + closed polyline outline for rendering.
 * Returns null for elements without extractable profiles.
 */
export function useInstanceProfile(modelId: string, instanceGuid: string | null) {
  const { data: model } = useModel(modelId);

  return useQuery({
    queryKey: ['instance-profile', modelId, instanceGuid],
    queryFn: async (): Promise<ProfileData | null> => {
      const cacheKey = `${modelId}:${instanceGuid}`;
      const cached = profileCache.get(cacheKey);
      if (cached !== undefined) return cached;

      const fileUrl = model!.file_url!;

      let fileId = getCachedFileId(fileUrl);
      if (!fileId) {
        const result = await openFromUrl(fileUrl);
        fileId = result.file_id;
      }

      const profile = await getElementProfile(fileId, instanceGuid!);

      profileCache.set(cacheKey, profile);
      return profile;
    },
    enabled: !!model?.file_url && !!instanceGuid,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

export function clearProfileCache() {
  profileCache.clear();
}
