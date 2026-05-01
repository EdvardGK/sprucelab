/**
 * Viewer filter store
 *
 * Single source of truth for what's visible in the BIM viewer:
 *   IFC class · storey · NS3451 · verification status · system · model
 *
 * Facets AND together (intersection). Empty facet = no constraint.
 *
 * The store is ephemeral per-project — `scope` is the active project id, and
 * switching scopes resets state. State persists to localStorage AND syncs to
 * the URL via `useViewerFilterUrl` so links are shareable.
 *
 * The viewer component reads facets and applies via OBC.Hider; this store does
 * not know about Three.js. Facet-to-FragmentIdMap translation lives in
 * `core/applyFilters.ts` (Phase C-2, when NS3451 is wired).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type VerificationStatus = 'verified' | 'flagged' | 'pending' | 'auto';

export interface ViewerFilterState {
  // Scope key — switching projects clears facets. Set on viewer mount.
  scope: string | null;

  // Facets. Empty = "no constraint on this axis".
  hiddenIfcClasses: string[];          // IFC classes to hide (others show)
  // Floor selection. Stores either a canonical Scope.canonical_floors[].code
  // when canonical floors exist for the project, or a raw IFC storey name
  // otherwise. UnifiedBIMViewer accepts an optional alias map to resolve
  // codes to per-model storey names; without that map the value is matched
  // against discovered storey names directly.
  floor_code: string | null;
  ns3451: string[];                    // NS3451 codes to keep
  verification: VerificationStatus[];  // statuses to keep (empty = all)
  systems: string[];                   // system names to keep
  hiddenModels: string[];              // model ids to hide (federated only)

  // Actions
  setScope: (scope: string | null) => void;
  toggleIfcClass: (cls: string) => void;
  setHiddenIfcClasses: (classes: string[]) => void;
  showAllIfcClasses: () => void;
  hideAllIfcClasses: (allKnownClasses: string[]) => void;
  setFloorCode: (code: string | null) => void;
  setNs3451: (codes: string[]) => void;
  setVerification: (statuses: VerificationStatus[]) => void;
  setSystems: (systems: string[]) => void;
  toggleModelHidden: (modelId: string) => void;
  setHiddenModels: (modelIds: string[]) => void;
  reset: () => void;
}

const initial = {
  scope: null,
  hiddenIfcClasses: [] as string[],
  floor_code: null as string | null,
  ns3451: [] as string[],
  verification: [] as VerificationStatus[],
  systems: [] as string[],
  hiddenModels: [] as string[],
};

export const useViewerFilterStore = create<ViewerFilterState>()(
  persist(
    (set) => ({
      ...initial,

      setScope: (scope) => set((s) => (s.scope === scope ? s : { ...initial, scope })),

      toggleIfcClass: (cls) =>
        set((s) => ({
          hiddenIfcClasses: s.hiddenIfcClasses.includes(cls)
            ? s.hiddenIfcClasses.filter((c) => c !== cls)
            : [...s.hiddenIfcClasses, cls],
        })),

      setHiddenIfcClasses: (classes) => set({ hiddenIfcClasses: classes }),

      showAllIfcClasses: () => set({ hiddenIfcClasses: [] }),
      hideAllIfcClasses: (all) => set({ hiddenIfcClasses: all }),

      setFloorCode: (code) => set({ floor_code: code }),
      setNs3451: (codes) => set({ ns3451: codes }),
      setVerification: (statuses) => set({ verification: statuses }),
      setSystems: (systems) => set({ systems }),

      toggleModelHidden: (modelId) =>
        set((s) => ({
          hiddenModels: s.hiddenModels.includes(modelId)
            ? s.hiddenModels.filter((m) => m !== modelId)
            : [...s.hiddenModels, modelId],
        })),

      setHiddenModels: (modelIds) => set({ hiddenModels: modelIds }),

      reset: () => set((s) => ({ ...initial, scope: s.scope })),
    }),
    {
      // v2: schema rename of `storey` -> `floor_code`. Bumping the persist
      // key drops stale localStorage so a returning user with a v1 selection
      // doesn't rehydrate into the renamed field as undefined.
      name: 'sprucelab-viewer-filter-v2',
      storage: createJSONStorage(() => localStorage),
      // Persist facets but not the scope (it's set per-mount).
      partialize: (s) => ({
        hiddenIfcClasses: s.hiddenIfcClasses,
        floor_code: s.floor_code,
        ns3451: s.ns3451,
        verification: s.verification,
        systems: s.systems,
        hiddenModels: s.hiddenModels,
      }),
    },
  ),
);

// Convenience: current visible-classes derivation given a list of all known
// classes. Returns the typeVisibility map UnifiedBIMViewer expects.
export function deriveTypeVisibility(
  allClasses: string[],
  hiddenIfcClasses: string[],
): Record<string, boolean> {
  const hidden = new Set(hiddenIfcClasses);
  const map: Record<string, boolean> = {};
  for (const cls of allClasses) map[cls] = !hidden.has(cls);
  return map;
}
