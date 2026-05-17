# Session: v3 cross-filter — four bugs fixed in one session

## Summary
Treemap → viewer cross-filter has been broken for weeks. Today's session diagnosed and fixed four distinct bugs stacked on top of one another, the last one only visible via live chrome-devtools fiber traversal. Also produced two minimal-IFC probe models for testing (`shapes_probe.ifc`, `ghost_probe.ifc`) that mapped the fragments-converter geometry-coverage gap (web-ifc handles `IfcExtrudedAreaSolid` with rectangle / arbitrary closed profiles; drops CSG primitives, `IfcRevolvedAreaSolid`, and `IfcLShapeProfileDef`).

## Changes

### Four-stage fix to the treemap → viewer cross-filter

1. **`6584bef`** — `UnifiedBIMViewer.tsx:2486+`: the `isolation`-prop effect's "isolate" branch only used the v2 `OBC.FragmentsManager.guidToFragmentIdMap()`. For v3-loaded models (the default since 2026-05-10) that map is always empty → `hasMatches=false` → no-op. Added a v3 path mirroring the floor-filter pattern: collect every localId in `typeInfo` for the model, `setVisible(allIds, false)`, then `getLocalIdsByGuids(isolation.guids)` → `setVisible(matched, true)`. Restore branch added analogously.

2. **`ea1959f`** — `UnifiedBIMViewer.tsx:365+`: the `[modelIds.join(',')]` reset effect cleared JS refs but didn't dispose Three.js groups or v3 `FragmentsModel`s. Navigating cube_matrix → shapes_probe stacked both models in the scene. Fix removes groups from the scene, disposes v2 + v3 per-model handles, disposes the v3 `FragmentsModels` worker (forcing a clean rebuild), resets `typeInfo` / `storeyInfo` / delta-tracking refs.

3. **`86d6756`** — `UnifiedBIMViewer.tsx:2186+`: `typeInfo` keys come from `v3Model.getCategories()` in UPPERCASE (`IFCWALL`), but `typeVisibility` is keyed by `deriveTypeVisibility` in PascalCase (`IfcWall`). Lookup returned undefined → defaulted to visible → no flips. Built an uppercase mirror at the top of the effect for tolerant lookup; applied the same to the snapshot loop. Confirmed via `__reactContainer` fiber traversal that the prop reaches the viewer correctly.

4. **`6df92df`** — `UnifiedBIMViewer.tsx:2238+`: even after (3) fixed the visibility decision, the canvas stayed blank. Live chrome-devtools inspection showed `v3Model.getVisible()` returned `[false, true, false, false, false]` (Member-only correctly), but the canvas pixel buffer was all-zero RGBA. The `MeshCullerRenderer` keeps a separate visibility snapshot — `setVisible` updated the worker, `fragments.update()` refreshed tiles/LOD, but the culler kept asking the renderer for the pre-filter set. Added `cullerRef.current.needsUpdate = true` after every v3 `Promise.allSettled` in the typeVisibility effect AND both branches of the isolation effect.

### Test fixtures
- `tests/ghost_probe.ifc` (via `/tmp/make_ghost_probe_ifc.py`) — 14 IFC classes, identical `IfcExtrudedAreaSolid` + RectangleProfile representation each. Confirmed `IfcOpeningElement` is blocklisted at fragments-conversion time.
- `tests/shapes_probe.ifc` (via `/tmp/make_shapes_probe_ifc.py`) — 14 classes × distinct shapes × distinct colors. Used CSG primitives (`IfcBlock`, `IfcSphere`, `IfcRightCircularCylinder`, `IfcRightCircularCone`, `IfcRectangularPyramid`), revolved solids (`IfcRevolvedAreaSolid` torus + hemisphere), `IfcLShapeProfileDef`, and rect/star/cross arbitrary-closed profiles. **Result:** only `IfcExtrudedAreaSolid` + rectangle/arbitrary-closed profiles render correctly. CSG primitives and revolved solids are invisible. L-shape extrusion renders only the bare profile rectangle (= the "ghost" objects in real models).

### docs/dev.md punch-list
- "Source-of-filter highlights, never self-filters" — PowerBI rule. Click on a treemap tile highlights the source but the treemap itself stays whole. Currently the treemap self-filters too.
- "Extractor must surface every class the viewer can render" — `IfcAnnotation` renders in viewer but isn't in the treemap (extractor filters it). Either include in extraction or hide in viewer.
- Ghost-objects diagnostic ladder + the rolled-up coverage matrix.
- Removed an ifcfast-scoped "instance drill-down" item that bled in from the wrong session.

## Technical Details

**Live chrome-devtools debugging was decisive.** Static code reading + offline reasoning kept producing "this should work" conclusions. Attaching to the user's actual Chrome instance via `mcp__chrome-devtools__*`, then:
- Confirming the deployed `UnifiedBIMViewer-DR18OSve.js` chunk contained my fix (matched `toUpperCase()` count between local build + live).
- Walking the React fiber tree to find the typeInfo Map, dumping its keys (which proved UPPERCASE), and verifying the actual `typeVisibility` prop was wired correctly (PascalCase).
- Reading `v3Model.getVisible()` directly to prove the worker state was correct.
- Sampling the canvas pixel buffer with `getImageData` to prove the canvas was literally all zeros despite "Member visible" in the worker.
That last step proved the bug was in the renderer-side culler, not the visibility decision logic. Manual `v3.update()` via fiber kicked it visible — the smoking gun.

**`v3Model.getCategories()` returns way more than physical elements.** typeInfo for `shapes_probe` includes `IFCPROJECT`, `IFCUNITASSIGNMENT`, `IFCSIUNIT`, `IFCBUILDINGSTOREY`, `IFCSPACE`, `IFCBUILDING`, `IFCSITE` — even though these aren't visible products. They're harmless (no v3Refs match localIds with renderable geometry) but worth knowing.

**Probe geometry strategy.** Each test element placed at a distinct x position (0, 3, 6, …) with a unique color so absence of a shape in the viewer fingerprints the failing class. Critical because the v3 worker silently drops unsupported representations — no error console, no warning, just no render.

## Next

1. **Verify the culler-dirty fix on prod** when the new bundle deploys (monitor armed). Test on `shapes_probe.ifc` first (sandbox project), then a real model (G55_RIB).
2. **Source-of-filter highlight rule** — when the user clicks a treemap tile, the tile gets active styling but the treemap itself stays whole. Currently `filteredTypes` is used by the treemap, causing self-filter.
3. **Fragments-converter coverage refactor** — biggest open item. Replace web-ifc on the backend with `ifcopenshell.geom.iterator` → triangle meshes → build fragments from meshes. Eliminates the entire CSG / revolved / L-shape gap in one shot. Aligns with the CLAUDE.md "always use iterator" rule.
4. **Extractor surfaces IfcAnnotation + IfcSpace at the type level** so the treemap matches what's visible.
5. **Annotations / proposals primitive** still the spine work that gates LCA, material substitution, instance overrides.

## Observations during verification (post-fix)

After the culler-dirty fix landed, the user verified on the live site and flagged three new items now logged in `docs/dev.md`:

1. **Cross-filter is one-way only.** Treemap → viewer works (and now reliably). Viewer → treemap / KPIs / charts does NOT. `UnifiedBIMViewer.onSelectionChange` exists; needs wiring into `useProjectFilterActions` so a viewer click drives the rest of the dashboard.
2. **Viewer requires click-inside before filters apply.** Filter state updates dashboard tiles immediately, but the canvas often doesn't repaint until the user clicks inside the viewer or moves the camera. Strongest when switching rapidly between filters. The render loop appears to be camera-event-driven; need an explicit render kick after `cullerRef.needsUpdate = true`.
3. **Info panel duplicates instance-level data.** Model + type viewer info panels are largely identical and skew toward IfcEntity property bag. Strategy: distinct payload per interaction level — class (distribution / histograms), type (classification + material layers + reuse), instance (geometry-specific + Psets + annotations). All accessible from BOTH viewer interaction and data-dashboard interaction.

## Notes

- `docs/dev.md` punch list is in good shape after today's edits. Next session lands there per the canonical-tracker rule.
- The verbatim feedback stream from 2026-05-16 (`docs/plans/2026-05-16_user-feedback-stream-finish-line.md`) remains the source of truth for "what the user actually said".
- Chrome DevTools MCP is now a documented debugging path: fiber traversal → typeInfo Map dump → v3Model state probe → canvas pixel sample. Useful for any future "the data says it works but the screen disagrees" bug.
- Vercel's chunk hashing is content-based: `index-*.js` may flip without `UnifiedBIMViewer-*.js` flipping if main-chunk content changed. Always verify the relevant chunk hash, not just the index hash.
- ifcopenshell.api.geometry.add_block_representation does NOT exist in 0.8.3; build geometry via raw `create_entity` for full control over which IFC classes / representation types appear. Useful for clean-room probes.
