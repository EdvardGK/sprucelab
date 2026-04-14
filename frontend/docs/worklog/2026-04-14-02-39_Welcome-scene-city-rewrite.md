# Session: Welcome scene city rewrite — opaque, zoned, river, iconic landmarks

## Summary
Rewrote `BlueprintCityScene.ts` from a transparent, randomly-placed city to an opaque, grid-aligned, landmark-driven composition with a 90°-turn river running an S through the middle and wrapping the east edge. Added modular construction animation (plinth → corner columns → floor decks → body cladding → cornice → parapet) and a day/night variant scaffold with Chrome DevTools MCP wired up for live iteration. The user's core direction crystallized through ~30 iterations: "composition needs an idea — few curated heroes, sparse supporting cast, no copy-paste repetition".

## Changes
- **Added Chrome DevTools MCP** (`claude mcp add chrome-devtools --scope user`) for browser-driven visual iteration. Required session restart to load schemas.
- **`.env.local`** — added `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_IFC_SERVICE_URL` (were missing, crashed dev mode because `supabase.ts` eagerly instantiates the client on module load).
- **`pages/Welcome.tsx`** — added a `DEV_PREVIEW` bypass gated on `import.meta.env.DEV && ?preview=1` that fakes `user` and `me` so the page renders without a real Supabase session. **This is a dev-only hack that needs to be reverted before shipping Phase 1 E2E.**
- **`components/welcome/BlueprintCityScene.ts`** — major rewrite, file grew from ~260 lines to ~1900 lines. All changes opaque-first (no `transparent: true` on any building material).
  - Day/night palette scaffold (`DAY_PALETTE`, `NIGHT_PALETTE`) with emissive-map support for night lit windows. Night branch still needs wiring via `?scene=night`.
  - `makeWindowColorTexture()` rewritten as pure repeating grid (4×5 windows, pilaster stripes, floor lines). `makeWindowEmissiveTexture(seed, palette)` generates per-building lit-window patterns for night via seeded `mulberry32` PRNG.
  - `buildGenericBuilding(w, d, h, mats, tracker, roofStyle, antennaMat)` — new modular builder. Each building is a `THREE.Group` with plinth + body + cornice + parapet + optional roof cap (`flat`/`pyramid`/`chamfered`/`slanted`/`diamond-cap`) + optional antenna. Also builds 4 corner columns + 2-3 floor decks as "scaffolding" used during construction animation.
  - `updateBuildingConstruction(modules, t)` — scale.y-based reveal phased 0.02 plinth → 0.12 columns → 0.22 decks → 0.5 body → 0.56 cornice/parapet → 0.6 roof → 0.64 antenna. Because materials are opaque, the body progressively occludes the frame as it grows. No opacity fade anywhere.
  - `placeZonedBuildings(occupied)` — grid-aligned (cells at `{-15,-9,-3,3,9,15}` both axes) zoned placement with tryPlace AABB clash check. Zones: CBD / Waterfront East / Civic / Waterfront West / Old Town / Residential.
  - **River** — polyline of axis-aligned segments with 90° turns. Waypoints: `[-18,12]→[0,12]→[0,0]→[-12,0]→[-12,-12]→[18,-12]→[18,18]`. Width 4 (vs street 0.7). Sampled into `occupied` with 1-unit clearance so buildings step back from banks.
  - **Park** — repositioned to NW corner 2×2 cells centered at `(-12,12)`, width 12. Stavkirke inside at SW corner of park.
  - **Opera House** — simplified to a single trapezoidal wedge (ExtrudeGeometry with low river-facing edge and tall back edge). Removed the floating fly-tower cube the user flagged. Placed at `(3,-9)` east waterfront.
  - **Barcode Project** — row now runs along Z axis (parallel to river, not perpendicular). Placed at `(15,6)`, 12 slabs.
  - **Willis Tower** — 4 stacked BoxGeometry stages (5×5→4×4→3×3→1.8×2.5) with twin antenna cylinders at the top. Placed at `(9,-3)`.
  - **Petronas Twin Towers** — two 2×2×18 shafts with 4-sided pyramidal caps and needle spires, plus a horizontal skybridge across the middle. Placed at `(9,9)`.
  - Construction slots simplified from position-rotating to fixed-position (each slot cycles in place). Position rotation was broken because geometry size can't change mid-cycle.
- **`.claude/plans/agile-mapping-pebble.md`** — 3-variant plan file (City Day / City Night / Valley-Kistefos), written and approved via plan mode. Scope: City Day + City Night in this session, Valley deferred.

## Technical Details
### Chrome DevTools iteration loop
chrome-devtools-mcp lets me `navigate_page → list_console_messages → take_screenshot → Read png`. About 4 tool calls per iteration. This was the difference between shipping and guessing — every visual decision got immediate feedback from the running dev server. `?preview=1` + `DEV_PREVIEW` bypass made `/welcome` renderable without auth. Viewport was stuck at 941×891 because the browser opened maximized and `resize_page` refused to work on maximized windows; screenshots at that viewport were still legible enough to iterate.

### Transparency → opaque reveal
Original code had every building `transparent: true, opacity: 0.93` with animated opacity fade for construction cycling. This produced see-through buildings that bled through each other in depth. Fix: all building materials opaque, construction reveal via `scale.y` from 0. Because the body is opaque and grows from its base upward, it progressively occludes the scaffolding frame inside it — no manual fade needed. This was the core architectural decision that made everything else clean.

### Grid alignment
Earlier placement used arbitrary offsets like `spacing * 1.2`, `spacing * 0.6` which landed between cell centers AND streets. Buildings sat on top of roads. User called it "mikado with the roads". Fix: all placements are integer multiples of 0.5×spacing, cell centers at `{-15,-9,-3,3,9,15}`, streets at `{-18,-12,-6,0,6,12,18}`. Clash check with CLEARANCE=0.5 catches any remaining overlaps.

### River as polyline not curve
First attempt used `CatmullRomCurve3` — elegant but impossible to align with the grid (cells would either clash or form gaps). Second attempt: axis-aligned segments with 90° turns. Each segment is a `PlaneGeometry` with segment-extending corner overlap (`+RIVER_WIDTH` on the perpendicular axis). Segment footprints pushed to `occupied` so `tryPlace` rejects conflicting cells automatically.

### Willis + Petronas technique
Both landmarks use the same approach: loop over an array of box stages, translate geometry, add edges via `addEdges(mesh, sharedEdgeMat)`. No new builders — just inline blocks inside the init function next to the existing Opera/Barcode/Stavkirke landmarks. Petronas gets pyramid caps via `ConeGeometry(r, h, 4).rotateY(Math.PI/4)` (same trick as the stavkirke tiered roofs).

## Next
1. **Revert `DEV_PREVIEW` hack in `Welcome.tsx`** before shipping. It's a dev-only bypass that would expose a fake user state in preview builds. Look for `DEV_PREVIEW`, `DEV_PREVIEW_USER`, `DEV_PREVIEW_ME` and the `useAuth()` destructuring that uses them.
2. **Pending user asks still in the backlog:**
   - ICONSIAM with terraces (Bangkok riverside, tiered setbacks)
   - CCTV HQ Beijing (loop/inverted-U shape, different from every angle)
   - Building with a vertical hole (Shanghai WFC trapezoid or Kingdom Centre)
   - Entry canopies on tall buildings (user: "skyscrapers might have some type of overbuilt entry, highrises too")
   - Old Town still feels generic — user flagged "no doors or entryways"
   - Spruce trees: roof variations (slanted, diamond-cap) and antennas are code-complete but barely used — only 2 buildings assigned roof styles
3. **City Night variant** — palette and emissive textures are wired but `?scene=night` isn't actually routed yet. `Welcome.tsx` doesn't read the `scene` query param or pass a variant to `initBlueprintCity`. Need to: (a) wire the param, (b) pass variant to init, (c) test night palette + lightning storm (night animation loop is already written).
4. **Valley variant (Kistefos)** — deferred from this session. See the plan file for the full brief (procedural heightmap, contour lines drawing in, carved river, Twist museum landmark, spruce forest weighted by terrain).
5. **Roof + antenna + entry polish** — `buildGenericBuilding` has the infrastructure but most buildings are still `flat` / no antenna / no entry. Also `diamond-cap` is half-implemented (the `roof` field points to only the lower mesh of the group).
6. Deferred creative backlog: weather/seasons, birch/cherry trees, lit storefronts at night.

## Notes
- **The user's design direction evolved live during the session.** Plan mode was invoked once ("stop and plan the scene"), which produced `/home/edkjo/.claude/plans/agile-mapping-pebble.md` with three variants. Reading that plan will save a lot of time next session.
- **Rapid-fire iteration is expensive** — the user sent ~40 messages in this session, each adding creative direction. Next session should pick a scope upfront (one variant, one feature area) and resist scope creep via the plan file.
- **The session pushed the auto-memory index past its 200-line limit** earlier — note the MEMORY.md warning. Consolidate after next session.
- **`.env.local` preview env vars are committed behavior now** — if the user runs the dev server locally without a fresh `vercel env pull`, they'll lose these again. The `.env.local` already has `VERCEL_OIDC_TOKEN` which suggests `vercel env pull` was the original population mechanism. Consider documenting this in CLAUDE.md.
- **Chrome DevTools MCP is now installed at user scope** — available in all future sessions, not just this one. Good tool, low overhead.
