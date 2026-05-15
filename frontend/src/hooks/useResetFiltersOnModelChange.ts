import { useEffect, useRef } from 'react';

import { useProjectFilterActions } from '@/contexts/ProjectFilterProvider';

const URL_KEY = 'd';

/**
 * Clears all cross-filter dimensions when the active modelId transitions.
 *
 * Triggers on first mount too — a filter authored against model A (storey
 * GUIDs, type_guid, NS3451 with model-A scope) is stale when the user
 * lands on model B. The one carve-out is the `?d=` URL deeplink: the
 * `useProjectFilterUrl` hook in `<ProjectShell />` hydrates filters from
 * the URL once, and we must not wipe its work on the same mount.
 *
 * Pass the current modelId. Null / undefined values are ignored — the
 * effect only fires once we have a settled id.
 */
export function useResetFiltersOnModelChange(
  modelId: string | null | undefined,
): void {
  const { clearDimensions } = useProjectFilterActions();
  const prevModelIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prev = prevModelIdRef.current;

    if (!modelId) return;

    const isFirstRun = prev === undefined;
    prevModelIdRef.current = modelId;

    if (!isFirstRun && prev === modelId) return;

    if (isFirstRun && typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.has(URL_KEY)) return;
    }

    clearDimensions();
  }, [modelId, clearDimensions]);
}
