import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  CURRENT_PROTOCOL_VERSION,
  createFilterContext,
  type FilterContext,
  type FilterContextSeed,
  type Mode,
  type QualityFilter,
} from '../lib/embed/types';

/**
 * Dashboard filter provider — the single shared cross-filter state every
 * embed-style tile (charts, tables, ViewerTile) reads from.
 *
 * Distinct from `useViewerFilterStore` (Zustand): that store is the
 * viewer's viz-level facets (hidden classes, model toggles, OBC.Hider
 * input). DashboardFilterProvider is the dashboard-level cross-filter
 * surface — a superset that the viewer subscribes to in PR #5.
 *
 * Structure mirrors `AuthContext.tsx`:
 *   - createContext + custom hook with not-mounted error
 *   - useReducer for explicit action shape (auditable, easy to log)
 *   - separate value/dispatch context surfaces so consumers don't
 *     re-render on dispatch identity changes
 *
 * Wiring into `/embed/:dashboard` route + postMessage handshake lands in
 * PR #4. URL synchronization lands when the first tile renders (PR #6).
 * In this PR the provider exists but is not mounted in the app tree.
 */

// ── Action shape ──────────────────────────────────────────────────

export type FilterAction =
  | { type: 'set_mode'; mode: Mode }
  | { type: 'set_selected_express_id'; express_id: number | null }
  | { type: 'set_dimension'; key: DimensionKey; value: DimensionValue }
  | { type: 'merge_quality'; patch: Partial<QualityFilter> }
  | { type: 'replace'; next: FilterContext }
  | { type: 'clear_dimensions' };

type DimensionKey = 'ifc_class' | 'floor_code' | 'discipline' | 'materials' | 'type_id' | 'mmi';
type DimensionValue = string[] | { min: number | null; max: number | null } | undefined;

// ── Reducer ───────────────────────────────────────────────────────

function reducer(state: FilterContext, action: FilterAction): FilterContext {
  switch (action.type) {
    case 'set_mode':
      return { ...state, mode: action.mode };

    case 'set_selected_express_id':
      return { ...state, selected_express_id: action.express_id };

    case 'set_dimension': {
      const { [action.key]: _omit, ...rest } = state;
      void _omit;
      if (action.value === undefined) {
        return rest as FilterContext;
      }
      // The action type guarantees `value`'s shape matches `key`'s
      // declared type; cast through unknown at the JSON-shape boundary.
      const patch = { [action.key]: action.value } as unknown as Partial<FilterContext>;
      return { ...rest, ...patch } as FilterContext;
    }

    case 'merge_quality': {
      const merged: QualityFilter = { ...(state.quality ?? {}), ...action.patch };
      const cleaned: QualityFilter = {};
      (Object.keys(merged) as Array<keyof QualityFilter>).forEach((k) => {
        if (merged[k]) cleaned[k] = true;
      });
      if (Object.keys(cleaned).length > 0) {
        return { ...state, quality: cleaned };
      }
      const { quality: _drop, ...rest } = state;
      void _drop;
      return rest as FilterContext;
    }

    case 'replace':
      return action.next;

    case 'clear_dimensions':
      return {
        mode: state.mode,
        project_id: state.project_id,
        protocol_version: state.protocol_version,
        selected_express_id: state.selected_express_id,
      };

    default: {
      const _exhaustive: never = action;
      return state;
      void _exhaustive;
    }
  }
}

// ── Contexts ──────────────────────────────────────────────────────

const FilterValueContext = createContext<FilterContext | undefined>(undefined);
const FilterDispatchContext = createContext<Dispatch<FilterAction> | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────

interface DashboardFilterProviderProps {
  /** Required at construction; everything else is optional. */
  seed: FilterContextSeed;
  children: ReactNode;
}

export function DashboardFilterProvider({ seed, children }: DashboardFilterProviderProps) {
  const initial = useMemo(() => createFilterContext(seed), [seed]);
  const [state, dispatch] = useReducer(reducer, initial);

  return (
    <FilterValueContext.Provider value={state}>
      <FilterDispatchContext.Provider value={dispatch}>{children}</FilterDispatchContext.Provider>
    </FilterValueContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────

/** Read the current filter context. Throws if used outside the provider. */
export function useFilter(): FilterContext {
  const ctx = useContext(FilterValueContext);
  if (ctx === undefined) {
    throw new Error('useFilter must be used within a DashboardFilterProvider');
  }
  return ctx;
}

/** Get the dispatcher. Throws if used outside the provider. */
export function useFilterDispatch(): Dispatch<FilterAction> {
  const dispatch = useContext(FilterDispatchContext);
  if (dispatch === undefined) {
    throw new Error('useFilterDispatch must be used within a DashboardFilterProvider');
  }
  return dispatch;
}

/**
 * Convenience: action creators bound to the current dispatcher. Saves
 * tile authors from constructing action objects by hand.
 */
export function useFilterActions() {
  const dispatch = useFilterDispatch();

  const setMode = useCallback(
    (mode: Mode) => dispatch({ type: 'set_mode', mode }),
    [dispatch],
  );
  const setSelected = useCallback(
    (express_id: number | null) => dispatch({ type: 'set_selected_express_id', express_id }),
    [dispatch],
  );
  const setIfcClass = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'ifc_class', value }),
    [dispatch],
  );
  const setFloorCode = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'floor_code', value }),
    [dispatch],
  );
  const mergeQuality = useCallback(
    (patch: Partial<QualityFilter>) => dispatch({ type: 'merge_quality', patch }),
    [dispatch],
  );
  const clearDimensions = useCallback(
    () => dispatch({ type: 'clear_dimensions' }),
    [dispatch],
  );
  const replace = useCallback(
    (next: FilterContext) => dispatch({ type: 'replace', next }),
    [dispatch],
  );

  return useMemo(
    () => ({ setMode, setSelected, setIfcClass, setFloorCode, mergeQuality, clearDimensions, replace }),
    [setMode, setSelected, setIfcClass, setFloorCode, mergeQuality, clearDimensions, replace],
  );
}

// Re-export the protocol version for convenience.
export { CURRENT_PROTOCOL_VERSION };
