/**
 * Shared IFC-class color vocabulary for treemaps, KPI sparklines, table
 * row stripes, and any color-by-class surface.
 *
 * Backed by the gradient generator at `lib/colorMath.ts` — palette slots
 * are deterministic samples of a lime → forest → navy polyline in
 * OKLCH, subdivided via the van der Corput / bit-reversal sequence.
 * See `docs/wireframes/color-system.html` for the visual model.
 *
 * Assignment: classes are ranked by total instance count (dominant first;
 * ties broken alphabetically), then mapped to slots 0..N. Dominant
 * classes land on low slot numbers, which the bit-reversal places at
 * maximum perceptual separation — important for treemap readability
 * where the largest cells are read first.
 */

import { tokens } from '@/lib/design-tokens';

export function buildClassColorMap(
  types: Array<{ ifc_type: string; instance_count: number }>,
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
    map.set(ifcClass, tokens.dataPalette.slot(i));
  });
  return map;
}
