import { useQuery } from '@tanstack/react-query';
import { useModel } from './use-models';
import {
  openFromUrl,
  getElementGeometry,
  getCachedFileId,
  type MeshGeometry,
} from '@/lib/ifc-service-client';

// In-memory geometry cache for instant prev/next navigation
const geometryCache = new Map<string, MeshGeometry | null>();

/**
 * Fetch tessellated mesh geometry for a single IFC instance.
 * Returns vertices + faces for plain Three.js rendering.
 * Caches results in memory for instant revisits.
 */
export function useInstanceGeometry(modelId: string, instanceGuid: string | null) {
  const { data: model } = useModel(modelId);

  return useQuery({
    queryKey: ['instance-geometry', modelId, instanceGuid],
    queryFn: async (): Promise<MeshGeometry | null> => {
      // Check in-memory cache first
      const cacheKey = `${modelId}:${instanceGuid}`;
      const cached = geometryCache.get(cacheKey);
      if (cached !== undefined) return cached;

      const fileUrl = model!.file_url!;

      let fileId = getCachedFileId(fileUrl);
      if (!fileId) {
        const result = await openFromUrl(fileUrl);
        fileId = result.file_id;
      }

      const geometry = await getElementGeometry(fileId, instanceGuid!);

      // Cache for instant revisits
      geometryCache.set(cacheKey, geometry);
      return geometry;
    },
    enabled: !!model?.file_url && !!instanceGuid,
    staleTime: Infinity, // Geometry doesn't change
    gcTime: Infinity,
    retry: false,
  });
}

/** Clear geometry cache (e.g., on model change) */
export function clearGeometryCache() {
  geometryCache.clear();
}
