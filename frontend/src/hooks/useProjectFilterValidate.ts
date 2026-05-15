/**
 * One-shot post-hydrate validator that drops stale filter dimensions whose
 * entire selected value-set misses the universe of values present in the
 * data the current surface has loaded.
 *
 * Companion to `useProjectFilterUrl`, which hydrates the shared filter
 * store from `?d=<base64>` at mount. The URL payload can outlive the
 * data it references (model deleted, types re-extracted, storey renamed)
 * — without validation the hydrated state silently hides every row and
 * the user sees an empty surface or the amber `<FilteredEmptyBanner>`.
 *
 * Per-dimension semantics:
 *   - If the universe for a dimension is `undefined`, the dimension is
 *     left untouched (this surface doesn't know what's valid).
 *   - If the universe is provided and the intersection with the selected
 *     values is empty, the dimension is dispatched as `undefined`
 *     (cleared). Partial overlap is preserved as-is — a multi-select
 *     with one stale value still does useful filtering through its
 *     remaining values.
 *
 * Fires once per provider lifetime (the provider keys on project_id, so
 * switching projects naturally remounts and re-validates).
 */
import { useEffect, useRef } from 'react';
import {
  useProjectFilter,
  useProjectFilterDispatch,
  type FilterAction,
} from '@/contexts/ProjectFilterProvider';

export interface FilterUniverse {
  ifc_class?: Iterable<string>;
  excluded_ifc_class?: Iterable<string>;
  floor_code?: Iterable<string>;
  type_guid?: Iterable<string>;
  discipline?: Iterable<string>;
  materials?: Iterable<string>;
  ns3451?: Iterable<string>;
  systems?: Iterable<string>;
  type_id?: Iterable<string>;
}

type ValidatableKey = keyof FilterUniverse;

const KEYS: readonly ValidatableKey[] = [
  'ifc_class',
  'excluded_ifc_class',
  'floor_code',
  'type_guid',
  'discipline',
  'materials',
  'ns3451',
  'systems',
  'type_id',
];

function toSet(values: Iterable<string> | undefined): Set<string> | null {
  if (!values) return null;
  return values instanceof Set ? values : new Set(values);
}

export interface UseProjectFilterValidateOptions {
  /**
   * Defer validation until the upstream data has loaded. Default `true`,
   * so callers can pass `false` while their queries are pending and the
   * hook will hold off until they flip the flag.
   */
  ready?: boolean;
}

export function useProjectFilterValidate(
  universe: FilterUniverse | null | undefined,
  options: UseProjectFilterValidateOptions = {},
): void {
  const { ready = true } = options;
  const state = useProjectFilter();
  const dispatch = useProjectFilterDispatch();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!ready) return;
    if (!universe) return;

    const dispatches: FilterAction[] = [];
    for (const key of KEYS) {
      const selected = state[key] as string[] | undefined;
      if (!selected || selected.length === 0) continue;
      const valid = toSet(universe[key]);
      if (valid === null) continue;
      const hasOverlap = selected.some((v) => valid.has(v));
      if (!hasOverlap) {
        dispatches.push({ type: 'set_dimension', key, value: undefined });
      }
    }

    ranRef.current = true;
    if (dispatches.length === 0) return;
    for (const action of dispatches) dispatch(action);
    // The ref guards the one-shot; depending on `state` would re-fire as
    // the user interacts post-validation. `universe` and `ready` flip
    // are the meaningful inputs — every render passes the same `state`
    // we want to inspect at the moment of validation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, universe, dispatch]);
}
