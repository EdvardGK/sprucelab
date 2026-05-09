/**
 * Persist the project filter context to localStorage so a returning user
 * lands on the same filter selection without sharing a URL.
 *
 * Pattern mirrors `useProjectFilterUrl`: hydrate-once-on-mount +
 * subscribe-to-changes. Mounted alongside the URL hook in
 * `<ProjectShell />`. Mount order matters — URL hook runs after this
 * hook, so a `?d=` payload wins over localStorage on hydrate (URLs are
 * shareable; localStorage is per-machine).
 *
 * Persisted facets: every dimension except the four invariants
 * (`mode`, `project_id`, `protocol_version`, `selected_express_id`) and
 * the ephemeral selection / lens facets (`selected_type_ids`,
 * `selected_global_ids`, `color_by`) — those are per-session UI, not
 * persistable.
 *
 * Defensive cleanup: removes the legacy Zustand `sprucelab-viewer-filter-v2`
 * key on first mount so returning users don't carry stale exclusion-model
 * state that no consumer reads anymore.
 */

import { useEffect, useRef } from 'react';
import {
  CURRENT_PROTOCOL_VERSION,
  createFilterContext,
  type FilterContext,
} from '@/lib/embed/types';
import {
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';

const STORAGE_KEY = 'sprucelab-filter-v3';
const LEGACY_KEY = 'sprucelab-viewer-filter-v2';

type PersistedFilters = Partial<
  Omit<
    FilterContext,
    | 'mode'
    | 'project_id'
    | 'protocol_version'
    | 'selected_express_id'
    | 'selected_type_ids'
    | 'selected_global_ids'
    | 'color_by'
  >
>;

function projectToPersisted(state: FilterContext): PersistedFilters {
  const payload: PersistedFilters = {};
  if (state.ifc_class !== undefined) payload.ifc_class = state.ifc_class;
  if (state.excluded_ifc_class !== undefined)
    payload.excluded_ifc_class = state.excluded_ifc_class;
  if (state.floor_code !== undefined) payload.floor_code = state.floor_code;
  if (state.discipline !== undefined) payload.discipline = state.discipline;
  if (state.mmi !== undefined) payload.mmi = state.mmi;
  if (state.materials !== undefined) payload.materials = state.materials;
  if (state.type_id !== undefined) payload.type_id = state.type_id;
  if (state.ns3451 !== undefined) payload.ns3451 = state.ns3451;
  if (state.verification !== undefined) payload.verification = state.verification;
  if (state.systems !== undefined) payload.systems = state.systems;
  if (state.hidden_models !== undefined) payload.hidden_models = state.hidden_models;
  if (state.quality !== undefined) payload.quality = state.quality;
  return payload;
}

function isEmpty(payload: PersistedFilters): boolean {
  return Object.keys(payload).length === 0;
}

export function useProjectFilterPersist(): void {
  const state = useProjectFilter();
  const { replace } = useProjectFilterActions();
  const hydratedRef = useRef(false);

  // Hydrate from localStorage on first mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === 'undefined') return;

    // Defensive cleanup of the legacy Zustand store key. One-shot.
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore quota / privacy-mode failures
    }

    let parsed: PersistedFilters | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const decoded = JSON.parse(raw);
        if (decoded && typeof decoded === 'object') {
          parsed = decoded as PersistedFilters;
        }
      }
    } catch {
      parsed = null;
    }

    if (!parsed || isEmpty(parsed)) return;

    replace(
      createFilterContext({
        project_id: state.project_id,
        protocol_version: state.protocol_version ?? CURRENT_PROTOCOL_VERSION,
        mode: state.mode,
        selected_express_id: state.selected_express_id,
        ...parsed,
      }),
    );
    // One-shot hydrate; not depending on state/replace identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push to localStorage on state change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydratedRef.current) return;

    const payload = projectToPersisted(state);
    try {
      if (isEmpty(payload)) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // ignore quota / privacy-mode failures
    }
  }, [state]);
}
