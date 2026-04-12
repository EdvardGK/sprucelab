# Session: Federated Viewer Performance Overhaul — Phase A

## Summary
Full performance investigation of the federated BIM viewer after user reported lag and `requestAnimationFrame handler took Nms` violations on 4-discipline loads. Ruled out GPU hardware issue (even a 3080 Ti laptop was laggy — because Chrome was on integrated GPU, but even after forcing dGPU the lag persisted, proving it was engineering not capability). Through a plan-mode design process with heavy iteration on product principles, then executed Phase A of a phased perf plan: telemetry wiring, load-path deduplication, `OBC.Cullers` / `MeshCullerRenderer`, static `matrixAutoUpdate=false`, and delta-based Hider updates with `FragmentIdMap` stored directly in state. User reports viewer is "incredibly smooth now" in the Vercel preview after Phase A deployed. Single follow-up fix landed: culler pixel-size threshold was too aggressive at 80px, causing "ghosted and incomplete" appearance on BIM models with small elements — dropped to 5px.

## Changes

### Frontend
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` (major rewrite of load + visibility logic):
  - **A5 telemetry**: dev-only `renderer.info` polling + `PerformanceObserver` on `longtask` entries, gated on `import.meta.env.DEV`, cleanup wired in the init useEffect return.
  - **A4 dedup**: extracted `finalizeLoadedGroup(group, modelData, modelId, loadMethod)` helper; both the fragments branch and the IFC fallback branch now call it. ~160 lines of duplicated Classifier + fire-and-forget + loadedModel bookkeeping collapsed to one place.
  - **A1 Culler**: `components.get(OBC.Cullers).create(world)`, every fragment mesh registered inside `finalizeLoadedGroup` via `culler.add(fragment.mesh)`. Threshold started at 80px, adjusted to 5px after user reported ghosting on small BIM elements.
  - **A2 static matrices**: after `scene.three.add(group)`, one `group.updateMatrixWorld(true)` pass then `group.traverse(...)` setting `matrixAutoUpdate = false` and `matrixWorldAutoUpdate = false` on all Mesh/InstancedMesh descendants. Fragments never move after load.
  - **A3 delta Hider**: `typeInfo` state shape changed from `{ guids: string[], count }` to `{ map: FragmentIdMap, count }`. Stores the Classifier's `entity.map` directly, no GUID round-trip. New `prevTypeVisibilityRef` captures the last applied visibility. Type-visibility useEffect now diffs prev vs next, calls `hider.set(true, unionMap)` and `hider.set(false, unionMap)` only on flipped types. Wrapped in `requestAnimationFrame` for single-frame debounce. New `unionFragmentIdMaps` module helper.
  - ClassColor useEffect updated to use `data.map` directly (no `guidToFragmentIdMap` round-trip).
- No frontend changes needed for A6 — investigation showed `modelVisibility` is already stable (only changes on explicit `setModelVisibility` calls) and the only caller passing `classColorMap` (`ModelWorkspace.tsx:247`) already memoizes it.

### Plan document
- Wrote comprehensive plan at `~/.claude/plans/federated-tinkering-riddle.md` through plan mode with three Explore agents (frontend audit, backend pipeline audit, ThatOpen library feature audit) and one Plan agent. Plan was iterated three times based on user feedback:
  - v1: had PostproductionRenderer/Outliner/Measurement as Phase C "showcase" features
  - v2: user said "viewer is a tool not the main character" → trimmed to just selection legibility
  - v3: user said "not reinventing doesn't mean featureless, we need great clipping/filtering/isolation" → rewrote Phase C around data-driven viewing operations
  - v4: user said "no clash detection ≠ sloppy geometry" → removed LOD/simplification language, kept culling
- Final Phase C scope: color coding (by class/discipline/classification/verification), stacked filtering, isolation, rule-based selection (verification engine meets viewer), keep existing section planes as-is. Explicitly skipped: PostproductionRenderer, Outliner, Measurement, Plans, Viewpoints.

## Technical Details

### The GPU red herring
User reported lag on both a Linux desktop and a Windows Blade 15 with RTX 3080 Ti — and the Blade felt *worse* than the desktop, which is diagnostic. I first pursued hybrid-GPU routing (confirmed via `chrome://gpu` dump that Chrome was on Intel Iris Xe, not the 3080 Ti). Forcing dGPU via NVIDIA Control Panel didn't help. User pushed back: "Dalux, Solibri, Blender all run smoothly on the same hardware — this is engineering, not capability." They were right. The actual bottlenecks were all software:
1. `ifcService.getElements(limit:10000)` eagerly fetched 40k element JSON objects per federated load just to populate a type filter dropdown
2. `OBCF.Highlighter` hover raycasts on every mousemove against all fragments
3. `FederatedViewer` inline prop literals (`Object.fromEntries(...)`) creating new references every render, firing the viewer's expensive `useEffect` dependencies
4. No `OBC.Cullers` — canonical ThatOpen BIM perf pattern completely absent
5. No `matrixAutoUpdate=false` on static fragments
6. `Hider.set(false)` + `Hider.set(true, map)` full-scene traversal on every type toggle

Phase 1 + Phase 2 handled 1-3. Phase A handled 4-6 plus telemetry and dedup.

### Delta-based Hider
The old visibility effect rebuilt `visibleGuids[]` (tens of thousands of strings) on every toggle, converted back to `FragmentIdMap` via `fragmentsManager.guidToFragmentIdMap`, then did `hider.set(false)` followed by `hider.set(true, map)` — two full scene traversals on every checkbox click. The new version:
1. Stores `entity.map` directly from `classifier.list.entities[name].map` — zero conversion
2. Maintains `prevTypeVisibilityRef` with the last-applied visibility snapshot
3. On change, diffs prev vs current and separates flipped types into `flippedOn[]` and `flippedOff[]` arrays of their `FragmentIdMap`s
4. Unions each direction into one map via a new `unionFragmentIdMaps` helper
5. Calls `hider.set(true/false, unionMap)` at most once per direction
6. Wraps the whole body in `requestAnimationFrame` so rapid Show-All/Hide-All clicks coalesce into one hider op
7. A second small useEffect prunes the prev ref when types disappear (e.g. model unload)

Initial load case: prev is empty, so every type is treated as "flipped from undefined to current" — union all visible types once and call `hider.set(true, unionMap)`. One call instead of N per-type conversions.

### Culler threshold
`MeshCullerRenderer.config.threshold` is "pixels a geometry must occupy on screen to be considered seen" — higher = more aggressive culling. Default is 100. I initially set 80 thinking "slightly more aggressive" but it's the opposite — 80 still hides anything smaller than 80 pixels. On BIM models with fixtures, fasteners, small pipes, pull handles, switches, etc., 80px culls a ton of legitimate geometry, making the model look ghosted. Dropped to 5 so only truly sub-pixel elements get size-culled. The real perf win of the culler is frustum culling (geometry outside the camera's view frustum is skipped entirely), which is independent of threshold.

## Next

1. **Phase A verification remaining**: user needs to hard-refresh the Vercel preview after the culler threshold fix rebuilds. Confirm the model renders completely + the viewer remains smooth. If so, Phase A is fully done.
2. **Phase B: Reliability** (planned, not started) — kill the IFC fallback entirely, eager fragment generation on upload, speed up `convert-to-fragments.mjs` (2-5 min → <90s target via persistent Node worker + pipelined phases + `UV_THREADPOOL_SIZE=8`), retry/reconciliation logic, aggressive Supabase `Cache-Control: immutable` headers, browser IndexedDB fragment cache.
3. **Phase C: Data-driven viewing operations** (planned, not started) — color coding by class/discipline/classification-status/verification-status, stacked filtering (class + discipline + storey), isolation (one-click "show only this"), rule-based selection (click a verification rule failure → highlight the failing elements in 3D). All via existing ThatOpen APIs and delta-based Hider from Phase A3.

## Notes

- Vite dev server on localhost:5173 has been running throughout the session with HMR; all Phase A edits are live on it.
- Vercel preview URL serves production builds of the `dev` branch. Bundle hash changed from `BCbo1VCa` before Phase A to a new hash after push (user confirmed "incredibly smooth" on the post-Phase-A build).
- The user's three framing messages during plan mode were essential course corrections:
  1. "The viewer is not the main character — the data is" — initially I over-trimmed and proposed a featureless viewer
  2. "Not the main character ≠ shouldn't have great clippers/filtering" — I over-corrected, had to re-expand Phase C to include proper data-driven viewing operations
  3. "No clash detection ≠ sloppy geometry" — I had implied aggressive LOD/simplification was OK, user correctly said no
- The `convert-to-fragments.mjs` script uses the older `@thatopen/components.IfcLoader.load()` + `fragments.export()` pattern. Current ThatOpen tutorials have moved to `@thatopen/fragments.IfcImporter` with a worker.mjs. Worth comparing perf in Phase B3 if the simpler speedups don't hit the 90s target.
- `FragmentMesh` extends `THREE.InstancedMesh` — confirmed via `.d.ts`. Culler accepts both via its `add(mesh: Mesh | InstancedMesh)` signature.
- Plan file: `/home/edkjo/.claude/plans/federated-tinkering-riddle.md` — contains the full 4-phase plan with file:line references. Worth keeping around for Phase B/C/D.
