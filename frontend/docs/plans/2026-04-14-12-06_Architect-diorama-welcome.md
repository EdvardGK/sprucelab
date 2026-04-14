# Architect Diorama — Welcome Scene Redesign

**Date**: 2026-04-14
**Status**: In progress — foundation first, compose on top
**Relation**: New variant alongside `BlueprintCityScene.ts`. Current scene stays default.

---

## Why

The current welcome scene is a uniform 6×6 grid of equal cells with roads on every gridline. It reads as a lattice, not a composition. Feedback: *"A slab covered in a grid is not the same as every grid having a road and equal blocks. You go bento style and vary the sizes and shapes within the grid constraint. The slab needs to look like a piece of art."*

We're replacing the mental model with **architect diorama meets BIM / digital twin**.

## Target aesthetic

**Physical model language** (Koolhaas / SANAA / OMA study models):
- Monochrome cream/bone massing, single material, differentiated only by volume.
- Pale basswood / parchment slab — not grass + dirt.
- Water as frosted glass inlay, not dark blue river.
- Trees abstracted to low-poly cones.
- Single warm directional sun + cool sky hemi. Soft shadows are the hero.
- Background = parchment `#faf8f3` (matches Welcome page). No skydome.

**BIM / digital-twin signature**:
- **Hairline silhouette outlines** on every volume (`EdgesGeometry` + `LineSegments`). This is the single strongest "twin" cue.
- Subtle grid dots at parcel corners (datum markers).
- Discipline accents from Sprucelab's core palette used sparingly as hero callouts: Lavender (ARK), Lime (RIB), Forest (RIV), Navy (RIE). One tower in Lavender, one frame in Lime — not everything painted.
- One visible datum/level line on a hero building.
- Optional: one wireframed "digital twin" building mid-construction.

## Palette (final)

| Element | Color | Role |
|---|---|---|
| Background | `#faf8f3` | Parchment (CSS, show through) |
| Slab base | `#f5f0dd → #eee8d8` | Basswood |
| Paving / lanes | `#e9e9eb` Silver | Warm grey stone |
| Buildings (default) | `#f4efe1` | Cream massing |
| Water | Navy `#21263A` @ 15% + glass fresnel | Frosted inlay |
| Park / trees | `#157954` desaturated ~40% | Muted forest |
| Hero ARK | `#4a5280` Lavender | Discipline accent |
| Hero RIB | `#5a5c15` Lime | Discipline accent |
| Hero RIV | `#157954` Forest | Discipline accent |
| Hero RIE | `#21263A` Navy | Discipline accent |
| Outlines | `#21263A` hairline | BIM drawing edge |

All from Sprucelab's core 5 (Silver / Lavender / Lime / Forest / Navy). The welcome scene *is* the design system.

## Lighting rig

- `THREE.HemisphereLight(skyColor: #d8dee9, groundColor: #ede4c8, intensity: 0.45)` — cool sky / warm slab bounce.
- `THREE.DirectionalLight(#fff4d6, intensity: 0.9)` at `(-22, 40, 18)` — warm sun from SW-ish. Shadow-casting enabled.
- No ambient. Hemi handles the shadow side.
- Shadow map: 2048², PCFSoftShadowMap, bias -0.0005.

## Outline strategy

Phase 1 (foundation): `EdgesGeometry` per volume → `LineSegments` child, thin black material, rendered on top. Cheap, crisp, ships now.

Phase 2 (polish, optional): replace with a postprocess edge pass (SSAO + outline) for anti-aliased hairlines. Only if Phase 1 aliasing is visible and bothers us.

## Composition plan (bento, not grid)

Working on a ~42×42 slab. The grid is **rhythm** — 6-unit module, parcels span 1×1..3×3 with streets *between* modules, not on every gridline.

**Focal point**: waterfront plaza at the river's south bend. 2×3 paving stone with steps.

**Zones**:
- **Park** (NW) — single irregular 3×3 green mass with one diagonal path. Balances CBD visual weight.
- **CBD** (NE) — two mega-plots (2×2 each) for hero towers, separated by a pedestrian plaza, not a street. One boulevard along south edge.
- **Civic** (SE) — Opera on 2×2 parcel + 1×2 public square.
- **Old Town** (SW) — 8-10 small parcels, tight pedestrian lanes, no through-streets.
- **Residential ring** — long thin 1×5 strip of row-house parcels along west edge.

**Roads**: 1 boulevard + 2 secondary + Old Town lanes. Streets terminate at parcel edges.

**Ground materials**: basswood (slab), silver paving (plazas/roads), forest grass (park), navy glass (water), warm wood (boardwalk). Five material classes minimum.

## Implementation phases

### Phase A — Foundation (this pass)
- New file: `frontend/src/components/welcome/DioramaScene.ts`
- Slab rectangle (basswood), lighting rig, hairline outline helper, parchment bg, orbit camera, disposal tracker.
- **One test volume** (single cream box with outlines) to validate the aesthetic.
- Wired via `?scene=diorama` in `Welcome.tsx`. Default remains `BlueprintCity`.
- Goal: *the base aesthetic reads right* before any city composition. If Phase A looks wrong, we fix it before building parcels.

### Phase B — Parcel map
- Define parcel list as data: `{ x, z, w, d, kind }` where kind is `park | paving | water | wood | grass`.
- Render parcels as thin extruded slabs in their respective materials.
- No buildings yet. Validate the slab composition alone reads as art.

### Phase C — Massing
- Generate cream building volumes on parcels, low-poly + outlined.
- Bento variation: hero mega-plots, dense old-town cluster, waterfront promenade.

### Phase D — BIM signature
- One hero building with discipline-accent color.
- One wireframed "twin" building.
- Datum line on one hero.
- Grid dots at parcel corners.

### Phase E — Atmosphere
- Trees (forest cones).
- Scale details (if any).
- Final lighting tune.

## What we are NOT doing

- Not patching `BlueprintCityScene.ts`. It stays untouched.
- Not animating construction cycles in Phase A-C. That's a Phase E question.
- Not porting the existing grid/road infrastructure. New file, fresh composition.
- Not day/night variants until Phase E at earliest.

## Wiring

`Welcome.tsx` reads `new URLSearchParams(window.location.search).get('scene')`:
- `scene === 'diorama'` → `initDioramaScene(container)`
- otherwise → `initBlueprintCity(container)` (unchanged)

Preview: `/welcome?preview=1&scene=diorama` in dev.

## Open decisions (deferred)

- Does the river stay as a curving polyline or become a single straight reflecting pool? TBD after Phase A — will judge in context.
- One discipline accent or four? Start with one (Phase D), add more if it reads too monochrome.
- Wireframed twin building — yes, but in Phase D.

## Files touched this phase

- New: `frontend/src/components/welcome/DioramaScene.ts`
- New: `frontend/docs/plans/2026-04-14-12-06_Architect-diorama-welcome.md` (this file)
- Modified: `frontend/src/pages/Welcome.tsx` — add `?scene=diorama` query param routing (one useEffect branch).
