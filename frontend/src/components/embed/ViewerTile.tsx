/**
 * ViewerTile — embed-side scaffold around `UnifiedBIMViewer`.
 *
 * PR 5 of the Forward-Deployed Embed track (`docs/plans/2026-05-03-21-15…`).
 * Spike: `docs/research/2026-05-10-22-37_Viewer-Highlight-Mode-Spike.md`.
 *
 * What this component does today (scaffold, not yet mounted in any route):
 *   - Reads the embed-side `FilterContext` (shape from `@/lib/embed/types`).
 *   - Calls `/api/embed/instances/` via the embed-scoped axios client to
 *     resolve the current filter to a set of `type_ids` + an instance
 *     count. The resolver does NOT yet return GUIDs (see PR 5 follow-up
 *     in the spike doc § 6), so isolation is left null when no GUID
 *     surface is available. That keeps the viewer rendering everything
 *     and the tile honest about its current scope.
 *   - Renders `<UnifiedBIMViewer>` with embed-friendly defaults
 *     (no properties panel, no model info chrome, no controls,
 *     no auto-fit). The host page owns layout.
 *
 * What this component does NOT do (PR 6+):
 *   - It does NOT mount in any route. The embed shell (`EmbedDashboard`)
 *     wires it in PR 6 once a `DashboardFilterProvider` lands; today the
 *     embed page only echoes the filter as JSON.
 *   - It does NOT mutate the filter on click (PR 5 is read-only). PR 7
 *     wires `onSelectionChange` to `postSelectionChanged` on the
 *     messaging bus.
 *   - It does NOT yet drive `IsolationConfig` from real GUIDs — the
 *     `/api/embed/instances/` endpoint returns `type_ids` only. The
 *     viewer's GUID-keyed isolation surface needs a resolver extension
 *     (PR 6 follow-up) before it can paint matching instances. The
 *     render-mode plumbing on `UnifiedBIMViewer` is in place
 *     (`renderMode: 'highlight'` + `accentColor`) so PR 6 only needs to
 *     supply the GUID array.
 *
 * Filter source contract (memory: single-project-filter-store-bidirectional):
 *   - Reads from the embed-side filter shape (`FilterContext`).
 *   - Never imports `useProjectFilter` / the Zustand store the in-app
 *     viewer uses today. Embed and in-app filter stores are intentionally
 *     non-importing of each other.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AxiosInstance } from 'axios';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  UnifiedBIMViewer,
  type IsolationConfig,
} from '@/components/features/viewer/UnifiedBIMViewer';
import type { FilterContext } from '@/lib/embed/types';
import type { EmbedInstancesResponse } from '@/lib/embed/embed-api-client';
import { useOptionalFilterContext } from '@/lib/embed/useFilterContext';

export interface ViewerTileProps {
  /** Project the embed token is scoped to. Comes from `/embed/capabilities/`. */
  projectId: string;
  /**
   * Model to load. PR 5 supports a single model; PR 6 will broaden to
   * federated groups (the existing `UnifiedBIMViewer` already supports
   * `modelIds[]`).
   */
  modelId: string;
  /**
   * Filter context override. Optional — when rendered inside a
   * `DashboardFilterProvider` (the normal embed path), the tile prefers
   * the provider via `useOptionalFilterContext()`. The prop remains for
   * backward compatibility and standalone harnesses (e.g. legacy tests,
   * future Storybook). If both are present, the provider wins.
   *
   * Exactly one source is required: either render this tile inside a
   * `DashboardFilterProvider`, or pass `filterContext` as a prop.
   */
  filterContext?: FilterContext;
  /**
   * Embed-scoped axios client (carries the `Embed <token>` header). Owned
   * by the host page (`EmbedDashboard`) so the token lifecycle is
   * centralized. ViewerTile never creates its own client.
   */
  apiClient: AxiosInstance;
  /** Optional accent color for highlight mode. Defaults to viewer's blue-500. */
  accentColor?: string;
  className?: string;
}

/**
 * Query key factory — `filterContext` is included in full so React Query
 * naturally collapses 50-Hz filter mashes into a single in-flight request
 * (per the embed robustness contract, no extra debouncer needed).
 */
const viewerTileKeys = {
  all: ['embed', 'viewer-tile'] as const,
  instances: (projectId: string, filter: FilterContext) =>
    [...viewerTileKeys.all, 'instances', projectId, filter] as const,
};

/**
 * Translate an embed `FilterContext` into the query params the
 * `/api/embed/instances/` endpoint speaks. Keep this conversion local —
 * the endpoint contract is small and additive (PR 3) and we don't want a
 * cross-import with the in-app filter store.
 */
function buildInstanceQueryParams(filter: FilterContext): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.type_id && filter.type_id.length > 0) {
    params.type_id = filter.type_id.join(',');
  }
  if (filter.floor_code && filter.floor_code.length > 0) {
    // Resolver supports a single floor today; pass the first one.
    params.floor_code = filter.floor_code[0];
  }
  return params;
}

export function ViewerTile({
  projectId,
  modelId,
  filterContext: filterContextProp,
  apiClient,
  accentColor,
  className,
}: ViewerTileProps) {
  const { t } = useTranslation();

  // Provider wins over prop when both are present. This is the normal
  // embed path (EmbedDashboard mounts `DashboardFilterProvider`); the
  // prop is the standalone/test fallback.
  const providerCtx = useOptionalFilterContext();
  const filterContext = providerCtx?.filter ?? filterContextProp;
  if (!filterContext) {
    throw new Error(
      'ViewerTile requires either a `filterContext` prop or a parent <DashboardFilterProvider>.',
    );
  }

  // Resolve the filter to a type_ids set via the embed instances endpoint.
  // `keepPreviousData` (default in v5) means rapid filter changes don't
  // flash a loading state on the tile.
  const instancesQuery = useQuery({
    queryKey: viewerTileKeys.instances(projectId, filterContext),
    queryFn: async () => {
      const params = buildInstanceQueryParams(filterContext);
      const { data } = await apiClient.get<EmbedInstancesResponse>(
        '/embed/instances/',
        { params },
      );
      return data;
    },
    // Stale immediately — the filter context already participates in the
    // query key, so any change refetches.
    staleTime: 0,
  });

  // Build IsolationConfig. The current `/embed/instances/` response shape
  // (PR 3) does not include GUIDs — only `type_ids[]`. Until the resolver
  // is extended in a follow-up PR, we keep isolation null and the viewer
  // renders everything. The renderMode/accentColor wiring on
  // `UnifiedBIMViewer` is in place so the future PR only needs to swap the
  // `guids` array.
  const isolation = useMemo<IsolationConfig | null>(() => {
    if (!instancesQuery.data) return null;
    if (instancesQuery.data.type_count === 0) return null;
    // TODO(PR 6): extend resolver to return `global_ids[]` and feed them
    // here. The renderMode/accentColor surface below is already wired on
    // `UnifiedBIMViewer.IsolationConfig`.
    return null;
  }, [instancesQuery.data]);

  // Honest fallthrough: until isolation can be populated, ensure the
  // accentColor we'd use is computed (so the variable isn't dead-code).
  // This becomes load-bearing when PR 6 wires the guid array.
  const resolvedAccentColor = accentColor;

  return (
    <ErrorBoundary
      fallback={
        <div
          className={className}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(0.5rem, 1.5vw, 1rem)',
            background: '#111827',
            color: '#e5e7eb',
            fontSize: 'clamp(0.625rem, 1.2vw, 0.75rem)',
          }}
        >
          {t('embed.viewerTile.unavailable')}
        </div>
      }
    >
      <div
        className={className}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
        }}
        data-testid="embed-viewer-tile"
        data-filter-mode={filterContext.mode}
      >
        <UnifiedBIMViewer
          modelId={modelId}
          isolation={isolation}
          showPropertiesPanel={false}
          showModelInfo={false}
          showControls={false}
          showFilterHUD={false}
          autoFitToView={false}
          enableSectionPlanes={false}
        />
        {/*
          When PR 6 swaps isolation in, the accentColor below threads
          through to the viewer's highlight-mode branch:
            isolation={{
              guids: resolvedGuids,
              mode: 'all',
              renderMode: filterContext.mode === 'highlight' ? 'highlight' : 'isolate',
              accentColor: resolvedAccentColor,
            }}
        */}
        {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
        <span hidden data-accent-color={resolvedAccentColor ?? ''} />
      </div>
    </ErrorBoundary>
  );
}
