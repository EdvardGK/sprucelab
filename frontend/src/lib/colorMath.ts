/**
 * Color math for the Sprucelab data palette.
 *
 * Two-stage model (matches docs/wireframes/color-system.html):
 *   stage 1 (generator)  — bit-reversal subdivision of a polyline through
 *                          OKLCH color space (lime → forest → navy).
 *                          Every `paletteSlot(n)` is deterministic; slot N
 *                          always returns the same color across reloads,
 *                          projects, and machines.
 *   stage 2 (assignment) — the caller (e.g. `buildClassColorMap` in
 *                          warehouse-v2/classColors.ts) decides which
 *                          class gets which slot.
 *
 * Status / signal / callout colors live OUTSIDE this gradient's bounding
 * box so they can never be confused with a class swatch. Those are
 * declared as CSS variables in the global stylesheet, not generated here.
 */

export type OKLCH = readonly [L: number, C: number, H: number];

/**
 * Triangle (polyline) gradient vertices. Adding more vertices extends
 * the perceptual range linearly. Three feels like the right ceiling
 * for distinguishable shades without the eye losing the through-line.
 */
export const PALETTE_VERTICES: readonly OKLCH[] = [
  [0.85, 0.2, 130],   // lime         — structural anchor
  [0.45, 0.13, 155],  // forest green — mass
  [0.22, 0.05, 260],  // dark navy    — tail
];

export function oklchString([L, C, H]: OKLCH): string {
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path hue interpolation on the 0–360 circle. */
function lerpHue(a: number, b: number, t: number): number {
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const result = a + delta * t;
  return ((result % 360) + 360) % 360;
}

/**
 * Sample the polyline at t ∈ [0, 1]. Out-of-range t is clamped.
 */
export function sampleTriangle(
  t: number,
  vertices: readonly OKLCH[] = PALETTE_VERTICES,
): OKLCH {
  const segs = vertices.length - 1;
  const clamped = Math.max(0, Math.min(1, t));
  const idx = Math.min(Math.floor(clamped * segs), segs - 1);
  const segT = clamped * segs - idx;
  const a = vertices[idx];
  const b = vertices[idx + 1];
  return [
    lerp(a[0], b[0], segT),
    lerp(a[1], b[1], segT),
    lerpHue(a[2], b[2], segT),
  ];
}

/**
 * Van der Corput / bit-reversal sequence, base 2.
 *   bitReverse(0) = 0
 *   bitReverse(1) = 0.5
 *   bitReverse(2) = 0.25
 *   bitReverse(3) = 0.75
 *   bitReverse(4) = 0.125
 *   ...
 *
 * Each new sample falls into the largest empty interval. For any N
 * the first N values are maximally distributed across [0, 1].
 */
export function bitReverse(i: number): number {
  let result = 0;
  let base = 0.5;
  let n = i >>> 0;
  while (n > 0) {
    if (n & 1) result += base;
    base /= 2;
    n >>>= 1;
  }
  return result;
}

/**
 * Predictable palette slot. Slot N always returns the same OKLCH color
 * string. Adjacent ranks are perceptually distant by construction
 * (slot 0 = lime end, slot 1 = forest, slot 2 = mid-lime, slot 3 = mid-navy…).
 */
export function paletteSlot(slot: number): string {
  return oklchString(sampleTriangle(bitReverse(slot)));
}
