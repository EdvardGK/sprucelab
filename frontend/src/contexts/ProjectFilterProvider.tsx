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
  type ColorBy,
  type FilterContext,
  type FilterContextSeed,
  type Mode,
  type NumericRange,
  type QualityFilter,
  type VerificationStatus,
} from '../lib/embed/types';

/**
 * Project-scoped filter provider — the single shared cross-filter state
 * every dashboard tile, the federated viewer, and embed-style consumers
 * read from. Mounted once at the project layout (`<ProjectShell />`) so
 * route changes inside a project don't remount the store.
 *
 * Structure mirrors `AuthContext.tsx`:
 *   - createContext + custom hook with not-mounted error
 *   - useReducer for explicit action shape (auditable, easy to log)
 *   - separate value/dispatch contexts so consumers don't re-render on
 *     dispatch identity changes
 */

// ── Action shape ──────────────────────────────────────────────────

type ArrayDimensionKey =
  | 'ifc_class'
  | 'excluded_ifc_class'
  | 'floor_code'
  | 'discipline'
  | 'materials'
  | 'type_id'
  | 'ns3451'
  | 'verification'
  | 'systems'
  | 'hidden_models'
  | 'selected_type_ids'
  | 'selected_global_ids';

type RangeDimensionKey = 'mmi';

type DimensionKey = ArrayDimensionKey | RangeDimensionKey;

type DimensionValue = string[] | VerificationStatus[] | NumericRange | undefined;

export type FilterAction =
  | { type: 'set_mode'; mode: Mode }
  | { type: 'set_selected_express_id'; express_id: number | null }
  | { type: 'set_dimension'; key: DimensionKey; value: DimensionValue }
  | { type: 'set_color_by'; value: ColorBy | null | undefined }
  | { type: 'merge_quality'; patch: Partial<QualityFilter> }
  | { type: 'replace'; next: FilterContext }
  | { type: 'clear_dimensions' };

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
      const patch = { [action.key]: action.value } as unknown as Partial<FilterContext>;
      return { ...rest, ...patch } as FilterContext;
    }

    case 'set_color_by': {
      if (action.value === undefined) {
        const { color_by: _drop, ...rest } = state;
        void _drop;
        return rest as FilterContext;
      }
      return { ...state, color_by: action.value };
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

interface ProjectFilterProviderProps {
  /** Required at construction; everything else is optional. */
  seed: FilterContextSeed;
  children: ReactNode;
}

export function ProjectFilterProvider({ seed, children }: ProjectFilterProviderProps) {
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
export function useProjectFilter(): FilterContext {
  const ctx = useContext(FilterValueContext);
  if (ctx === undefined) {
    throw new Error('useProjectFilter must be used within a ProjectFilterProvider');
  }
  return ctx;
}

/** Get the dispatcher. Throws if used outside the provider. */
export function useProjectFilterDispatch(): Dispatch<FilterAction> {
  const dispatch = useContext(FilterDispatchContext);
  if (dispatch === undefined) {
    throw new Error('useProjectFilterDispatch must be used within a ProjectFilterProvider');
  }
  return dispatch;
}

/**
 * Action creators bound to the current dispatcher. Saves consumers from
 * constructing action objects by hand.
 */
export function useProjectFilterActions() {
  const dispatch = useProjectFilterDispatch();

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
  const setExcludedIfcClass = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'excluded_ifc_class', value }),
    [dispatch],
  );
  const setFloorCode = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'floor_code', value }),
    [dispatch],
  );
  const setDiscipline = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'discipline', value }),
    [dispatch],
  );
  const setMaterials = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'materials', value }),
    [dispatch],
  );
  const setTypeId = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'type_id', value }),
    [dispatch],
  );
  const setNs3451 = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'ns3451', value }),
    [dispatch],
  );
  const setVerification = useCallback(
    (value: VerificationStatus[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'verification', value }),
    [dispatch],
  );
  const setSystems = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'systems', value }),
    [dispatch],
  );
  const setHiddenModels = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'hidden_models', value }),
    [dispatch],
  );
  const setSelectedTypeIds = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'selected_type_ids', value }),
    [dispatch],
  );
  const setSelectedGlobalIds = useCallback(
    (value: string[] | undefined) =>
      dispatch({ type: 'set_dimension', key: 'selected_global_ids', value }),
    [dispatch],
  );
  const setMmi = useCallback(
    (value: NumericRange | undefined) =>
      dispatch({ type: 'set_dimension', key: 'mmi', value }),
    [dispatch],
  );
  const setColorBy = useCallback(
    (value: ColorBy | null | undefined) => dispatch({ type: 'set_color_by', value }),
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
    () => ({
      setMode,
      setSelected,
      setIfcClass,
      setExcludedIfcClass,
      setFloorCode,
      setDiscipline,
      setMaterials,
      setTypeId,
      setNs3451,
      setVerification,
      setSystems,
      setHiddenModels,
      setSelectedTypeIds,
      setSelectedGlobalIds,
      setMmi,
      setColorBy,
      mergeQuality,
      clearDimensions,
      replace,
    }),
    [
      setMode,
      setSelected,
      setIfcClass,
      setExcludedIfcClass,
      setFloorCode,
      setDiscipline,
      setMaterials,
      setTypeId,
      setNs3451,
      setVerification,
      setSystems,
      setHiddenModels,
      setSelectedTypeIds,
      setSelectedGlobalIds,
      setMmi,
      setColorBy,
      mergeQuality,
      clearDimensions,
      replace,
    ],
  );
}

export { CURRENT_PROTOCOL_VERSION };
