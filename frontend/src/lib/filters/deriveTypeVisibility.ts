/**
 * Derive a boolean visibility map for IFC classes using the
 * inclusion-model (`ifc_class[]`) plus exclusion-model
 * (`excluded_ifc_class[]`) facets owned by `ProjectFilterProvider`.
 *
 * Semantics (capture-doc Item 014, locked):
 *   - Empty / undefined `included` ⇒ all classes pass.
 *   - Non-empty `included` ⇒ only those classes pass.
 *   - `excluded` is then subtracted regardless of inclusion state, so
 *     right-click "hide this class" works even when no inclusion filter
 *     is set.
 *
 * Returns a `Record<string, boolean>` matching the `typeVisibility` prop
 * shape `UnifiedBIMViewer` already consumes.
 */
export function deriveTypeVisibility(
  allClasses: string[],
  included: string[] | undefined,
  excluded: string[] | undefined,
): Record<string, boolean> {
  const includeSet =
    included && included.length > 0 ? new Set(included) : null;
  const excludeSet = excluded && excluded.length > 0 ? new Set(excluded) : null;
  const map: Record<string, boolean> = {};
  for (const cls of allClasses) {
    const passesInclusion = includeSet === null || includeSet.has(cls);
    const passesExclusion = excludeSet === null || !excludeSet.has(cls);
    map[cls] = passesInclusion && passesExclusion;
  }
  return map;
}
