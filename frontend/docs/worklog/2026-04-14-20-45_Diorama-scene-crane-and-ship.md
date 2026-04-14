# Session: Welcome diorama — crane, pyramid stack, glass roofs, shipped

## Summary
Long iteration session that took the welcome-page DioramaScene from a Phase A
foundation (slab + hairline outlines + flat parcels) to a detailed architect
diorama with a full building factory, a Willis-style stepped tower, an
Oasia-inspired red-mesh tower, a continuous black gate spanning two cells, and
an animated yellow tower crane stacking black boxes onto the civic hall roof.
Composition was worked out first in a blueprint SVG and 3D scaffold in `/tmp`,
then ported into the real scene file and iterated with rapid reload-and-review
via Chrome DevTools MCP. Squashed to a single `[session]` commit and pushed
straight to `origin/main` at the end.

## Changes
- `frontend/src/components/welcome/DioramaScene.ts` — full rewrite to ~2000
  lines. Adds: `buildModularMass` building factory (plinth / body / cornice /
  parapet + iron-red scaffolding), `updateConstructionPhase` phased reveal
  tied to a 0.2× `ANIM_SPEED`, `planTower` / `planWillisTower` / `planOasia`
  / `planMuseum` / `planMarketHall` / `planCivicHall` / `planStaveChurch` /
  `planBlackGate`, low-rise subdivision with seeded animation + roof
  features (green roofs, NYC-style water towers), spruce grove, foliage,
  sailboat, Norwegian-flag tower crane, pyramid-stacking animation, slab
  split into 3 pieces around the river L cut
- `/tmp/diorama-blueprint.html` (SVG plan) and `/tmp/diorama-scaffold.html`
  (Three.js block study) — iterated as planning artifacts, not shipped
- `frontend/docs/plans/2026-04-14-12-06_Architect-diorama-welcome.md` (already
  on disk from prior session, kept as the scene's intent doc)
- Pushed `[session]` commit `418fbf8` → rebased onto `origin/main` → shipped
  as `0ba1479`

## Technical Details
**Trolley kinematics were the crucial correctness fix.** Initial version
moved the box linearly from pickup to drop in world XZ while the jib rotated
independently, which reads as a crane lifting something "in front of" its jib.
Real tower cranes move the hook vertically, while the trolley slides along the
jib's length and the top rotates around the mast. Final formulation is
`box.x = cranePos.x + trolleyR * cos(jibAngle); box.z = cranePos.z -
trolleyR * sin(jibAngle)` — both `trolleyR` and `jibAngle` interpolate from
pickup to destination during the rotation phase, with the cable locked
vertical from jib-end down to box. Destination angle and radius are computed
per cycle from the stack-slot world position.

**Slab section cut for the river.** The river now extends from `y = -SLAB_THICKNESS`
up to `y = 0.15`, and the slab is built as three explicit boxes (West,
NE, South) around the river L so the river geometry drops into the gap and
renders in section at the slab edges. Ground-level infrastructure (water,
roads, bridges, grid) uses a `toWFull` helper that skips the `BLOCK_SHRINK`
factor, so it stays aligned to plan coords even though building footprints are
shrunk to create street gaps. Global `renderer.clippingPlanes` at slab bottom
means rising landmarks and construction-phase buildings emerge from nothing
rather than peeking under the slab.

**Extrude hole misadventure.** ExtrudeGeometry with a Shape + Path hole
repeatedly produced missing cap faces for the black gate and civic courtyard.
Earcut normalizes winding so the winding flip didn't help. Lifting the hole off
the boundary didn't help either. The fix was to abandon extrude for those:
civic hall became 4 separate box walls forming a rectangular ring, and the
black gate became 3 meshes (two pillars + lintel) in a group.

**Jib-sweep collision.** First pickup angle put the jib sweep through the
black gate. Moved pickup to due-north of the crane in Botanical Gardens park,
so the jib sweeps N → NE → E through empty air space only.

**Pyramid stack pattern.** 10 boxes per pyramid (4-3-2-1), stacked on top of
civic hall's west wall (nearest edge to the crane), starting from the wall's
south end (closest) and extending north. Capped at 2 pyramids via modulo
wrap-around so the stack doesn't grow unbounded.

## Next
- Verify the Vercel deploy reaches production on `sprucelab.io` and the
  `?scene=diorama&preview=1` route renders the full scene cleanly
- Iterate any remaining issues on camera framing (welcome card still covers
  ~55% of viewport) — maybe bias the diorama group eastward so more of the
  composition sits in the uncovered half
- Add a wireframed "digital twin" building per the Phase D plan (one hero
  building rendered as edges only, to sell the BIM signature)

## Notes
- Chrome DevTools MCP was invaluable — reload-and-screenshot loop in seconds.
  Keep using it for any subsequent welcome-scene work.
- The `BLOCK_SHRINK = 0.833` constant + `toW`/`toWFull` split is the
  load-bearing abstraction for the scene. Buildings shrink to create implicit
  street gaps while ground infrastructure stays at full cell width. If a
  future session adds more infrastructure (light rails, parking, etc.) it
  should go through `toWFull`.
- `[auto]` sync on every Edit is very noisy for a long session like this —
  180 auto-commits today. Squashing at session end keeps main history clean.
