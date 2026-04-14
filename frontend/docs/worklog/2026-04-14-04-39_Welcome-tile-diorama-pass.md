# Session: Welcome scene — tile diorama pass

## Summary
Shipped the "one-tile art piece" rework of the `/welcome` blueprint city. Ground
is now a proper extruded slab with grass on top, brown earth on the side walls,
and the river carved through as a single merged polygon (no internal seam walls
at corners). Roads became thick black boxes flanked by raised sidewalks that
properly interrupt at intersections instead of crossing through them. Empty
grid cells now host grid-aligned spruce clusters, and the blueprint grid
overlay is gone.

## Changes
All work in `frontend/src/components/welcome/BlueprintCityScene.ts` (one file,
~300 lines of delta in the scene-init block).

- **Construction-slot reassignment** (first fix of session): pulled `(3,15)`,
  `(9,3)`, `(-3,-15)`, `(-9,-9)` out of `placeZonedBuildings` so they no longer
  collide with Barcode / park. Construction slots now sit one-per-quadrant at
  those freed cells with heights matched to each zone.
- **Tile extent** — replaced the 240×240 ground plane with an extruded slab at
  `TILE_HALF = blockExtent = 21`. Tight edges, no overhang; trees clamp to the
  cell interior.
- **Merged river polygon** — added `riverOutlinePolygon(halfWidth)` that walks
  the polyline's right-side walls forward then left-side walls backward, so
  both the ground hole and the boardwalk ring are a single clean closed
  polygon instead of 11 edge-adjacent AABB holes. This kills the "internal
  walls at segment joints" artifact.
- **Narrow river corridor** — `RIVER_WIDTH = 1.4` (from 4) with a `0.3`
  boardwalk ring on each side, total corridor 2.0 — matches the offset-gridline
  gap between cells so nothing bleeds into building tiles.
- **Two-material ground slab** — `[grassMat, earthMat]`. Group 0 (top/bottom
  caps) is grass green `0x7ca364`; group 1 (outer walls AND the river hole's
  interior walls) is earth brown `0x5a3f27`. Looking down through the river
  hole you see brown banks descending to the water.
- **Translucent navy river** — `MeshStandardMaterial` with `transparent: true`,
  `opacity: 0.78`, `color: 0x1e3a5f`. Recessed `0.12` below the slab top,
  `0.55` deep. Rendered as disjoint BoxGeometry per river rect (not a merged
  box — internal faces never visible so seams don't matter).
- **Boardwalk ring** — extruded from `Shape(boardwalkOuterPolygon, hole=river
  polygon)`, translated up by `BOARDWALK_HEIGHT=0.1` so the wood deck sits
  raised above grass. Color `0x8b5e3c`.
- **Roads = thick raised boxes**, `STREET_WIDTH=1.4`, `ROAD_HEIGHT=0.06`,
  color `0x14141a`. Sidewalks are separate boxes at `SIDEWALK_HEIGHT=0.12`
  (curb effect — taller than road), `SIDEWALK_WIDTH=0.3`, color `0xbfb19a`.
- **Intersection cutting** — two-phase road/sidewalk drawing. Phase 1:
  precompute `horizontalRoads: Map<z, Interval[]>` and `verticalRoads:
  Map<x, Interval[]>` via `complementIntervals(horizontalCutsFor(z), ...)`.
  Phase 2: road boxes drawn from those intervals, continuous across
  intersections. Phase 3: for each road sub-segment, draw sidewalks as
  sub-intervals cut by the STREET WIDTH (not corridor width) of any
  perpendicular road whose drawn interval contains the sidewalk's parallel
  coordinate. This leaves 0.3×0.3 sidewalk corner patches at every
  intersection while skipping the part of the sidewalk that would cross the
  perpendicular road.
- **Grid overlay removed** entirely (GridHelper creation + dispose block).
- **Spruce cells** — removed 4 cells from zone specs to leave them empty:
  `(-15,-15)` and `(-9,-15)` from Old Town, `(3,-15)` from Waterfront East,
  `(-15,3)` from Residential. Plus `(15,-15)` was already unclaimed. Tree
  placement now iterates `CELL_CENTERS = [-15,-9,-3,3,9,15]²`, checks each
  cell against `occupied` (a cell is claimed if any occupied rect contains
  the cell center), and spawns `TREES_PER_CELL=6` spruce on a 6-point
  sub-grid with small jitter inside a `CELL_HALF_INTERIOR=2.3` clamp so
  they don't bleed onto sidewalks.
- **Replaced `treeCount=30` random-jitter loop** with the per-cell grid loop.
  `spawnSpruce(tx, tz, scaleSeed)` extracted as a helper.

## Technical Details

### Why a single merged river polygon mattered
The first attempt punched 11 disjoint AABB holes into the ground Shape (6 axis
segments clipped inward at internal corners + 5 corner squares at the
waypoints). The rects are edge-adjacent so they visually cover the river
correctly, but `ExtrudeGeometry` generates a separate interior wall for EACH
hole, which means every waypoint produced a thin vertical seam inside the
water channel. The merged polygon walks the offset curve of the polyline
(right side forward, left side backward, meeting at miter points for each
axis-aligned corner), giving one continuous hole → one continuous interior
wall.

Winding: my traced polygon is CCW (positive signed area via shoelace). Three's
`ExtrudeGeometry` wants CW for holes when the outer shape is CCW, so I reverse
the polygon before passing to `Path`. Both the ground hole and the boardwalk's
river hole use the reversed version.

### Sidewalk cross-cut algorithm
The key insight: sidewalks should be cut at the PERPENDICULAR ROAD's width
(not its full corridor). The perpendicular road's own sidewalks will cover
the corner 0.3×0.3 square independently, so if we only cut the horizontal
sidewalk at `[X - HALF_ROAD, X + HALF_ROAD]`, the sidewalk's own corner piece
at `x ∈ [HALF_ROAD, HALF_ROAD + SIDEWALK_WIDTH]` survives — and that exactly
coincides with the perpendicular sidewalk's corner piece. Two overlapping
0.3×0.3 patches at each corner, same material, same height, no visible
z-fight.

I also cut sidewalks by the river/park corridors using `horizontalCutsFor`
so sidewalks never hang over the boardwalk or park interior.

### ExtrudeGeometry two-material trick
`new THREE.Mesh(geometry, [matA, matB])`. `ExtrudeGeometry` emits two groups
in a fixed order: index 0 = front/back caps, index 1 = side walls (and that
side-wall group covers BOTH the outer perimeter AND every hole's interior
walls). So one mesh, two materials, grass top and brown banks for free.
Bottom cap is also grass but it faces down and is never visible.

### Cell-occupancy check for tree placement
After all landmarks, construction slots, and `placeZonedBuildings` have
registered their footprints in `occupied`, a cell `(cx, cz)` is "claimed"
iff some occupied rect strictly contains the cell center:
`|o.x - cx| < o.w/2 && |o.z - cz| < o.d/2`. The park passes this check for
its 4 cells (center inside the 12×12 park rect), the river doesn't (waypoints
lie on street lines between cells), so tree placement naturally skips park
cells and populates only genuine empty cells.

## Next
- **Verify translucent river reads correctly at camera orbit** — in the final
  screenshot the river was still hard to spot at the static preview angle.
  Might need stronger color saturation (bump to `0x1a4580` or similar) or a
  slightly deeper recess so the channel shows more clearly when the orbit
  sweeps past it.
- **Revert `DEV_PREVIEW` auth bypass in `Welcome.tsx`** before shipping
  anything to prod. `import.meta.env.DEV` gates it, but it's still ugly.
- **Phase 1 E2E auth run-through** is still the real gate for this welcome-
  scene work going live — until that's signed off, all of this is behind
  `?preview=1`.
- **Maybe widen road corridor slightly / shrink building footprints** — at
  `STREET_WIDTH=1.4` + `SIDEWALK_WIDTH=0.3*2` = 2.0 exactly fills the 2-unit
  gap between 4.0-wide buildings. Buildings at 4.2 (a few of the specs) stick
  0.1 into the sidewalk. Acceptable but could be cleaned up by normalizing
  all building widths to ≤3.8.

## Notes
- The blueprint grid helper was load-bearing for NOTHING — removing it
  cleaned up the scene without any side effects. Dispose block shrank nicely.
- The `occupied` array grew organically; it's now the single source of truth
  for both building placement AND tree placement. If we ever do the full
  `CityGrid` tile-classification refactor, this array should be the first
  thing replaced.
- Rule-of-thumb from this session: when punching holes in an ExtrudeGeometry,
  always merge into one polygon. Multiple disjoint rects are almost always
  wrong because the interior walls give away the seams. Merging via right-
  forward/left-backward trace works cleanly for axis-aligned 90° polylines.
- Session pacing: user kept iterating on the tile aesthetic (river offset,
  colors, sidewalks, trees) in rapid small messages. Each change was a
  clean localized edit because the scene-init block is structurally
  partitioned by `// ---` headers. Worth preserving that structure as the
  scene grows.
