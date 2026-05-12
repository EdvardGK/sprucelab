/**
 * Shared IFC-class color vocabulary. Used by the treemap, the KPI
 * sparklines, the table row stripes, and any future color-by-class
 * surface. Sort the classes by instance count first so the dominant
 * class always renders in the brand-forest green and the rest
 * cascade through the Mindful Palettes No. 160 + ramp.
 */
export const CLASS_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

/**
 * Build a stable ifcClass→color map from a list of types. Classes are
 * ranked by total instance count, descending; ties broken by alpha.
 * Use the same map across treemap + sparklines + table to keep the
 * color vocabulary cohesive.
 */
export function buildClassColorMap(
  types: Array<{ ifc_type: string; instance_count: number }>
): Map<string, string> {
  const counts: Record<string, number> = {};
  for (const t of types) {
    counts[t.ifc_type] = (counts[t.ifc_type] || 0) + t.instance_count;
  }
  const ranked = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const map = new Map<string, string>();
  ranked.forEach(([ifcClass], i) => {
    map.set(ifcClass, CLASS_PALETTE[i % CLASS_PALETTE.length]);
  });
  return map;
}
