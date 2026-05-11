import { useContext } from 'react';

import {
  DashboardFilterContext,
  type DashboardFilterContextValue,
} from './DashboardFilterProvider';

/**
 * Read the current embed `FilterContext` (+ mutators).
 *
 * Throws a helpful error if used outside a `DashboardFilterProvider` so
 * mis-mounted tiles fail loudly at first render instead of silently
 * rendering with `undefined`. Per the sprucelab "fail loudly" rule.
 *
 * Returns the same `{ filter, setFilter, patchFilter }` triple the
 * provider exposes; see `DashboardFilterProvider.tsx` for semantics
 * (protocol_version / project_id are clamped to the provider's
 * invariants; `onChange` fires after every successful update).
 *
 * Embed/in-app separation (memory:
 * `single-project-filter-store-bidirectional.md`):
 *   - This hook is for embed-surface consumers only. The in-app
 *     equivalent is `useProjectFilter` in
 *     `frontend/src/contexts/ProjectFilterProvider.tsx`. Neither hook
 *     imports the other.
 */
export function useFilterContext(): DashboardFilterContextValue {
  const ctx = useContext(DashboardFilterContext);
  if (ctx === undefined) {
    throw new Error(
      'useFilterContext must be used inside <DashboardFilterProvider>. ' +
        'EmbedDashboard mounts the provider once capabilities load; ensure the tile renders below it.',
    );
  }
  return ctx;
}

/**
 * Non-throwing variant — returns `null` when no provider is mounted.
 * Used by `ViewerTile` so it can fall back to its prop-driven API when
 * rendered standalone (e.g. in legacy harnesses, future Storybook).
 *
 * Most tiles should use `useFilterContext()` and trust the provider to
 * be present. This escape hatch exists ONLY for the prop-based
 * backward-compat path on `ViewerTile`.
 */
export function useOptionalFilterContext(): DashboardFilterContextValue | null {
  const ctx = useContext(DashboardFilterContext);
  return ctx ?? null;
}
