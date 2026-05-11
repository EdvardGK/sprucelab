import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  CURRENT_PROTOCOL_VERSION,
  type FilterContext,
  type ProtocolVersion,
} from './types';

/**
 * DashboardFilterProvider — embed-surface filter store.
 *
 * Round 6 Track BB of the Forward-Deployed Embed track. Gates Embed PR 6
 * (ViewerTile wiring) by giving every tile a single subscription point
 * for the current `FilterContext`. Until now `EmbedDashboard` held the
 * filter in plain `useState` and passed it as a prop to (the still-dark)
 * `ViewerTile`; this provider centralizes the surface so any embed tile
 * can read/write filter without prop-drilling.
 *
 * Deliberate separation from the in-app filter store
 * (memory: `single-project-filter-store-bidirectional.md`):
 *   - This provider lives in `lib/embed/` next to the embed schema. It
 *     does NOT import `useProjectFilter` / the in-app Zustand store, and
 *     the in-app surface does not import this one. The two stores share
 *     the `FilterContext` shape but not the source.
 *   - URL coupling stays out of this layer. EmbedDashboard already owns
 *     its postMessage echo loop; URL sync (if ever wanted on the embed
 *     side) is a follow-up. Provider stays pure-state.
 *
 * What this exposes:
 *   - `filter` — the current `FilterContext`.
 *   - `setFilter(next)` — replace the entire filter (project_id and
 *     protocol_version are clamped to the provider's invariants so
 *     callers can't smuggle in stale versions).
 *   - `patchFilter(patch)` — shallow-merge a partial filter. The most
 *     common path: `set_filter` envelopes from the host arrive as
 *     `Partial<FilterContext>` and the provider merges them in.
 *
 * Protocol version handling:
 *   - The provider stamps `protocol_version` to whatever the seed
 *     declared (default: `CURRENT_PROTOCOL_VERSION`).
 *   - If a `patchFilter` or `setFilter` arrives with a mismatched
 *     `protocol_version`, the provider warns (DEV only) and overrides
 *     back to the provider's version. This matches the messaging-bus
 *     stance: drop/clamp instead of corrupt the store.
 */

interface DashboardFilterContextValue {
  filter: FilterContext;
  setFilter: (next: FilterContext) => void;
  patchFilter: (patch: Partial<FilterContext>) => void;
}

const DashboardFilterContext = createContext<DashboardFilterContextValue | undefined>(undefined);

export interface DashboardFilterProviderProps {
  /**
   * Initial filter context. Owned by the embed page (which fetches the
   * project_id from `/embed/capabilities/`). Re-mounting with a new
   * initial filter replaces the state — but the provider does NOT
   * track changes to this prop after mount; callers use `setFilter`.
   */
  initialFilter: FilterContext;
  /**
   * Optional change observer. Fired AFTER state updates land. The embed
   * page wires this to the postMessage `filter_changed` echo so the host
   * sees every state change. Provider stays decoupled from the bus.
   */
  onChange?: (next: FilterContext) => void;
  /**
   * Optional DEV-only warner for protocol mismatches. Defaults to
   * console.warn in DEV, silent in PROD.
   */
  onWarn?: (reason: string, detail: unknown) => void;
  children: ReactNode;
}

export function DashboardFilterProvider({
  initialFilter,
  onChange,
  onWarn,
  children,
}: DashboardFilterProviderProps) {
  const [filter, setFilterState] = useState<FilterContext>(initialFilter);

  // Pin the provider's protocol_version to whatever the seed declared.
  // Patches that arrive with a mismatched version get clamped back to
  // this value (and warned in DEV).
  const expectedProtocolVersion = useRef<ProtocolVersion>(
    initialFilter.protocol_version ?? CURRENT_PROTOCOL_VERSION,
  );

  // Keep `onChange` in a ref so callers can pass an inline closure without
  // re-creating the setFilter/patchFilter identities on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const onWarnRef = useRef(onWarn);
  useEffect(() => {
    onWarnRef.current = onWarn;
  }, [onWarn]);

  const warn = useCallback((reason: string, detail: unknown) => {
    if (onWarnRef.current) {
      onWarnRef.current(reason, detail);
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[embed/DashboardFilterProvider] ${reason}`, detail);
    }
  }, []);

  const clampProtocolVersion = useCallback(
    (candidate: FilterContext): FilterContext => {
      if (candidate.protocol_version !== expectedProtocolVersion.current) {
        warn('protocol_version_mismatch', {
          got: candidate.protocol_version,
          want: expectedProtocolVersion.current,
        });
        return { ...candidate, protocol_version: expectedProtocolVersion.current };
      }
      return candidate;
    },
    [warn],
  );

  const setFilter = useCallback(
    (next: FilterContext) => {
      setFilterState((prev) => {
        // Invariants: project_id never changes inside a single embed
        // session (the token is project-scoped). Anyone passing a
        // different project_id gets warned and clamped to the original.
        let candidate = next;
        if (candidate.project_id !== prev.project_id) {
          warn('project_id_mismatch', {
            got: candidate.project_id,
            want: prev.project_id,
          });
          candidate = { ...candidate, project_id: prev.project_id };
        }
        candidate = clampProtocolVersion(candidate);
        onChangeRef.current?.(candidate);
        return candidate;
      });
    },
    [warn, clampProtocolVersion],
  );

  const patchFilter = useCallback(
    (patch: Partial<FilterContext>) => {
      setFilterState((prev) => {
        const merged: FilterContext = { ...prev, ...patch };
        // Patches must never escape the invariants. project_id and
        // protocol_version always come from the provider, not the patch.
        if (patch.project_id !== undefined && patch.project_id !== prev.project_id) {
          warn('project_id_mismatch', {
            got: patch.project_id,
            want: prev.project_id,
          });
        }
        merged.project_id = prev.project_id;
        if (
          patch.protocol_version !== undefined &&
          patch.protocol_version !== expectedProtocolVersion.current
        ) {
          warn('protocol_version_mismatch', {
            got: patch.protocol_version,
            want: expectedProtocolVersion.current,
          });
        }
        merged.protocol_version = expectedProtocolVersion.current;
        onChangeRef.current?.(merged);
        return merged;
      });
    },
    [warn],
  );

  const value = useMemo<DashboardFilterContextValue>(
    () => ({ filter, setFilter, patchFilter }),
    [filter, setFilter, patchFilter],
  );

  return (
    <DashboardFilterContext.Provider value={value}>{children}</DashboardFilterContext.Provider>
  );
}

/** Internal export so the hook file can read the same context. */
export { DashboardFilterContext };
export type { DashboardFilterContextValue };
