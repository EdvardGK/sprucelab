/**
 * Sync the project filter context to the URL `?d=<base64>` so views are
 * shareable.
 *
 * On mount: parse `?d=`, dispatch `replace` to hydrate the provider.
 * On state change: replace the search param via `history.replaceState`
 * (no nav).
 *
 * The legacy viewer-only URL channel (`?f=`, owned by `useViewerFilterUrl`
 * + Zustand `useViewerFilterStore`) coexists during PR 1.1 and is
 * deprecated in PR 1.2.
 *
 * Encoded payload omits the four invariants (`mode`, `project_id`,
 * `protocol_version`, `selected_express_id`) — those don't deeplink:
 *   - `project_id` rides on the route itself.
 *   - `protocol_version` is implied by the running app build.
 *   - `mode` and `selected_express_id` round-trip via the embed
 *     postMessage protocol envelopes, not the URL.
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

const URL_KEY = 'd';

type EncodedFilters = Partial<
  Omit<FilterContext, 'mode' | 'project_id' | 'protocol_version' | 'selected_express_id'>
>;

function encode(state: EncodedFilters): string {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decode(encoded: string): EncodedFilters | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as EncodedFilters) : null;
  } catch {
    return null;
  }
}

function projectToPayload(state: FilterContext): EncodedFilters {
  const payload: EncodedFilters = {};
  if (state.ifc_class !== undefined) payload.ifc_class = state.ifc_class;
  if (state.floor_code !== undefined) payload.floor_code = state.floor_code;
  if (state.discipline !== undefined) payload.discipline = state.discipline;
  if (state.mmi !== undefined) payload.mmi = state.mmi;
  if (state.materials !== undefined) payload.materials = state.materials;
  if (state.type_id !== undefined) payload.type_id = state.type_id;
  if (state.ns3451 !== undefined) payload.ns3451 = state.ns3451;
  if (state.verification !== undefined) payload.verification = state.verification;
  if (state.systems !== undefined) payload.systems = state.systems;
  if (state.selected_type_ids !== undefined) payload.selected_type_ids = state.selected_type_ids;
  if (state.selected_global_ids !== undefined)
    payload.selected_global_ids = state.selected_global_ids;
  if (state.color_by !== undefined) payload.color_by = state.color_by;
  if (state.quality !== undefined) payload.quality = state.quality;
  return payload;
}

function isEmpty(payload: EncodedFilters): boolean {
  return Object.keys(payload).length === 0;
}

export function useProjectFilterUrl(): void {
  const state = useProjectFilter();
  const { replace } = useProjectFilterActions();
  const hydratedRef = useRef(false);

  // Hydrate from URL on first mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === 'undefined') return;

    const sp = new URLSearchParams(window.location.search);
    const encoded = sp.get(URL_KEY);
    if (!encoded) return;

    const decoded = decode(encoded);
    if (!decoded) return;

    replace(
      createFilterContext({
        project_id: state.project_id,
        protocol_version: state.protocol_version ?? CURRENT_PROTOCOL_VERSION,
        mode: state.mode,
        selected_express_id: state.selected_express_id,
        ...decoded,
      }),
    );
    // Hydrate is intentionally a one-shot; deliberately not depending on
    // state/replace identity so we don't re-run when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push to URL on state change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydratedRef.current) return;

    const payload = projectToPayload(state);
    const sp = new URLSearchParams(window.location.search);
    if (isEmpty(payload)) {
      sp.delete(URL_KEY);
    } else {
      sp.set(URL_KEY, encode(payload));
    }
    const next = sp.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [state]);
}
