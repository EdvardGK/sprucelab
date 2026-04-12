# Session: Viewer React Implementation — Wire Wireframe to App

## Summary
Implemented the iterated 3D viewer wireframe designs into production React components. The wireframe (03-3d-viewer.html) had been refined over previous sessions with a floating HUD toolbar, canvas status panel, filtered quantity grid, key properties, pset dropdown, material layers with EPD dots, and continuous/discrete element templates. This session translated all of that into working React. Also renamed "orphan types" to "unused types" across the backend — types without instances aren't orphaned, they're just unused.

## Changes
- **`ElementPropertiesPanel.tsx`** — Extended interface with `isExternal`, `loadBearing`, `fireRating`, `thermalTransmittance`, `representativeUnit`, enhanced materials (`qtyPerUnit`, `materialUnit`, `hasEpd`), and `productInfo` for discrete elements
- **`IFCPropertiesPanel.tsx`** — Complete rewrite (~500 lines). New: filtered qty grid with primary highlight per IFC class, key properties grid, pset dropdown (replaces stacked accordions), material layers with EPD status dots and qty-per-unit, discrete product card template. Auto-switches between continuous/discrete based on IFC class.
- **`CanvasOverlays.tsx`** — Complete rewrite (~450 lines). New: `ViewerHUD` (floating bottom-center toolbar with axes gizmo, section/measure/view mode/fit buttons), `CanvasStatusPanel` (floating bottom-right with filters, section planes, camera info in single glass-morphism frame). Removed `FilterHUD` and `CameraInfo`. Kept `TypeToolbar` and `SectionFloat`.
- **`FederatedViewer.tsx`** — Removed `ViewerToolbar` import, wired `ViewerHUD` + `CanvasStatusPanel`, moved tool/viewMode types to CanvasOverlays exports
- **`ViewerToolbar.tsx`** — Retired (still exists but no longer imported)
- **`en.json` / `nb.json`** — Added ~20 new i18n keys for properties panel, HUD, status panel
- **`normalize.py`** — Renamed `orphaned` → `unused`, `orphaned_count` → `unused_count` in `detect_type_bloat()` return dict
- **`ifc_parser.py`** — Comment: "No orphan types" → "No unused types"
- **`views.py`** — Docstring: "orphaned or unused types" → "unused type definitions loaded into the model"

## Technical Details
- **Quantity config per IFC class**: A `QTY_DEFAULTS` map defines which quantities to show and which gets the primary highlight (representative unit). Walls: area/length/height/thickness (primary=area). Slabs: area/volume/thickness. Beams/columns: length/profile area. Doors/windows: width/height. Discrete elements skip the qty grid entirely.
- **Key properties extraction**: Searches `element.isExternal` first, then falls back to scanning all psets for `IsExternal`, `LoadBearing`, `FireRating`, `ThermalTransmittance`. Color-coded: boolean yes=green, no=red, ratings/values=neutral.
- **Pset dropdown**: Auto-selects first `*Common` pset. Click opens menu, selecting swaps the visible pset. Outside-click closes menu.
- **Continuous vs discrete**: `isDiscreteElement()` checks `representativeUnit === 'count'`, `productInfo` existence, or IFC class membership in `DISCRETE_CLASSES` set.
- **ViewerTool/ViewMode types**: Moved from ViewerToolbar.tsx to CanvasOverlays.tsx since that's where they're used now. FederatedViewer imports from CanvasOverlays.
- Build passes cleanly with `yarn build`.

## Next
- Left panel redesign (PlatformPanel) — model dropdown + visibility bar + storey list + view mode toggle
- Propagate design tokens from wireframe to `globals.css` / `design-tokens.ts` / `tailwind.config.ts`
- Eliminate orphan chart/tag colors (`--chart-indigo`, `--chart-blue`, `--tag-blue`)
- Field module frontend rebuild with shadcn (wireframe 07)

## Notes
- `ViewerToolbar.tsx` file kept but not imported — can be deleted when confirmed unnecessary
- The `detect_type_bloat()` function in `normalize.py` has no callers yet — the rename is safe but the API dict keys changed from `orphaned`/`orphaned_count` to `unused`/`unused_count`
- Spatial "orphaned elements" (elements without spatial parents) terminology intentionally kept — that's a genuinely different concept
