# Session: Viewer unification and filter overhaul

## Summary
Killed the duplicate `TypeInstanceViewer` (1048 lines of independent ThatOpen init) and folded its capability into `UnifiedBIMViewer` as an `isolation` prop. Swapped the renderer to `OBCF.PostproductionRenderer` and wired `OBCF.Outliner` so selection is a crisp cyan outline instead of the green color override. Stood up a Zustand-backed filter store with URL sync and a new faceted `ViewerFilterPanel` that replaces the left-edge `TypeToolbar` and the bottom `ViewerFilterHUD`. `IFCPropertiesPanel` is now canonical and supports multi-select aggregate view + close button. All five planned phases (A–E) shipped with type-check green throughout and zero new lint errors.

## Changes

### Phase A — foundation refactor (single viewer everywhere)
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` — added `IsolationConfig` + `isolation?` prop; new effect applies GUID isolation via `fragmentsManager.guidToFragmentIdMap` + `Hider`, with `wasIsolatedRef` to gate the restore branch so it only fires on null transitions; type/storey effects bail when isolation is active; registered orange `'current'` highlighter style for the isolation cursor.
- `frontend/src/components/features/viewer/InlineViewer.tsx` — replaced lazy `TypeInstanceViewer` import with lazy `UnifiedBIMViewer`; new `ShowModelViewer` helper passes `isolation={{ guids, mode, currentGuid, zoomOnChange }}`.
- `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx` — **deleted** (gio trash).

### Phase B — visual quality
- `UnifiedBIMViewer.tsx` — swapped `OBC.SimpleRenderer` → `OBCF.PostproductionRenderer`; `postproduction.setPasses({ ao, gamma, custom })` with `?ao=off` escape hatch; world type signature updated.
- Wired `OBCF.Outliner` with cyan selection material; mirrored the highlighter selection map into `outliner.add('selection', map)` on `onHighlight` and cleared on `onClear`. Highlighter `'selection'` style registered with `null` color so it stops painting meshes.
- Multi-select on shift/ctrl/meta — `highlight('selection', !multi, false)`.
- `F` keyboard shortcut overloaded: flips active section plane if one exists, else fits to view.

### Phase C — filter system overhaul
- `frontend/src/stores/useViewerFilterStore.ts` — new Zustand store with `persist` middleware; facets: `hiddenIfcClasses`, `storey`, `ns3451`, `verification`, `systems`, `hiddenModels`. `setScope` resets state on project change. `deriveTypeVisibility(allClasses, hidden)` helper for the existing `typeVisibility` viewer prop.
- `frontend/src/hooks/useViewerFilterUrl.ts` — syncs store ↔ `?f=<base64>` (URL-safe) via `history.replaceState`; hydrates once on mount.
- `frontend/src/components/features/viewer/ViewerFilterPanel.tsx` — new left-edge collapsible panel: IFC class section with show-all/hide-all + search + per-class chips; storey radio; **generic "Properties" placeholder** listing NS3451, MMI, LoadBearing, FireRating, Materials, IsExternal as peers; Verification placeholder. `ViewerFilterPanelTrigger` button for collapsed state.
- `UnifiedBIMViewer.tsx` — added `onStoreysDiscovered` callback so the panel can show storeys with counts.
- `frontend/src/pages/FederatedViewer.tsx` — dropped local `typeFilters` / `selectedStoreyId` state; reads `hiddenIfcClasses` + `storeyFilter` from the store; `useViewerFilterUrl()`; passes `typeVisibilityMap = deriveTypeVisibility(...)` and `storeyFilter` to the viewer; rendered `<ViewerFilterPanel>` in place of `TypeToolbar`. Active-filter chips and "remove filter" handler route through the store.

### Phase D — property panel consolidation
- `frontend/src/components/features/viewer/IFCPropertiesPanel.tsx` — added `aggregate?: ElementProperties[]` and `onClose?` props. New `AggregateSummary` (multi-select view with type breakdown + summed area/volume/length) and `PanelHeader` (title + optional close button + IFC4 badge).
- All three callsites migrated off `ElementPropertiesPanel`:
  - `UnifiedBIMViewer.tsx` (internal panel when `showPropertiesPanel`)
  - `frontend/src/pages/ModelWorkspace.tsx` (fullscreen viewer overlay)
  - `frontend/src/components/features/viewer/ViewerToolPanel.tsx` (Properties tab)
- `ElementPropertiesPanel.tsx` left as a type-only file (still exports `ElementProperties`); component export is unused.

### Phase E — HUD polish + cleanup
- Deleted: `ViewerTypeToolbar.tsx` (325 lines), `ViewerColorHUD.tsx` (281 lines), `ViewerToolbar.tsx` (192 lines).
- `CanvasOverlays.tsx` (534 → 367 lines) — removed `TypeToolbar` + `IFC_TYPE_CONFIG` + `TYPE_PRIORITY` + `MAX_VISIBLE_TYPES` + `TypeButton` + `TypeFilterInfo` interface + 6 IFC icon helpers (Wall/Slab/Door/Window/Column/Beam). Kept `WireframeIcon` (used by ViewerHUD) and `Eye` import (used elsewhere).

### Memory
- `~/.claude/projects/.../memory/feedback-property-filter-priorities.md` — new feedback memory: NS3451 is one property among many; viewer filters NS3451/MMI/LoadBearing/FireRating/Materials uniformly; classification stays in TypeMapper. Indexed in `MEMORY.md`.

## Technical details

**Isolation transition handling.** Naive isolation effect with `if (isolation) { isolate } else { restore }` runs the restore branch on every `typeInfo` update — clobbering the prev-refs that the type/storey effects rely on for delta tracking. Fix: `wasIsolatedRef` ref tracks whether the previous run was active; restore only fires on the active→inactive edge. Without this the type filter state was being reset on every model load.

**PostproductionRenderer + Outliner contract.** `Outliner.create(name, MeshBasicMaterial)` requires `PostproductionRenderer` (the source `getRenderer()` throws on `SimpleRenderer`). Phase B order matters: swap renderer, call `components.init()`, then enable post-processing, then create the Outliner. The Outliner's selection style runs as a custom-effects pass on top of the composer.

**Highlighter `add(name, null)`.** The Highlighter API accepts `THREE.Color | null` for the style color; passing `null` registers the style without painting meshes. This lets the selection logic (raycaster + selection map) keep working while the visual feedback comes entirely from the Outliner. Cleaner than transparent green.

**URL encoding.** Zustand persist + URL sync overlap. The persist middleware partializes facets to localStorage; `useViewerFilterUrl` subscribes to the store and writes a URL-safe base64 of the same facets to `?f=`. On mount, URL wins over localStorage (last-write semantics). `partialize` deliberately excludes `scope` so a shared link can't pin someone to the wrong project.

**Verified ThatOpen v2.4.12 surface before committing to design** by reading `node_modules/@thatopen/components-front/dist/namespace.d.ts`. Confirmed: `PostproductionRenderer`, `Outliner`, `EdgesPlane`, `LengthMeasurement`, `AreaMeasurement` all exist. **Ruled out: `ViewCube`** — does not exist in v2.4.12, neither in `components` nor `components-front`. The plan's orientation gizmo therefore needs to be a custom Three.js sub-scene (~150 lines), deferred this session.

**TypeInstanceViewer vs HUDScene confusion.** TypeInstanceViewer (deleted) was a full-model isolation viewer — same fragments as the federated viewer, just with `Hider` hiding non-type GUIDs. HUDScene (in `instance-hud/`, untouched) is the actual single-instance preview with 2D/3D toggle, solid/wireframe, profile drawing — driven by the backend `useInstanceGeometry` API, not the federated fragments. The user briefly worried I'd deleted the latter; clarified that the type-page experience (mesh, x-ray, 2D, profile) lives in HUDScene and is intact.

## Next
- Smoke-test in the browser: boot `just dev`, hit FederatedViewer (filter panel collapses, AO visible, outline on click, multi-select with shift, `F` fits, URL `?f=` round-trips), then the type page (default HUDScene preview + "Show in model" → isolation works, prev/next animates).
- Wire NS3451 / MMI / LoadBearing / FireRating / Materials filters once backend exposes `ifc_guids: string[]` on `/api/types/`. Build a generic `ClassificationRegistry` keyed by property, not a NS3451-specific path.
- Restore right-click context menu for "place section plane" on the type page (regression — was in TypeInstanceViewer, not in UnifiedBIMViewer). Low priority unless someone misses it.
- Custom orientation gizmo (~150 lines top-right Three.js sub-scene with click-to-snap-to-axis). Deferred — composes with PostproductionRenderer cleanly.
- `LengthMeasurement` + `AreaMeasurement` wiring with mode state machine in viewer. Deferred until perf-tested on federated loads.
- Backend follow-up: confirm or expose `ifc_guids: string[]` on type list endpoint to unblock the rest of Phase C.

## Notes
- Pre-existing lint errors in the file (mixed-spaces-and-tabs, `any` casts on world type) are unchanged — my work added zero net lint errors. CI gate (`yarn lint --max-warnings 0`) was already failing on this file before this session.
- The plan file lives at `~/.claude/plans/lets-shift-gears-the-goofy-rain.md` if it's useful to revisit phasing decisions.
- `ElementPropertiesPanel.tsx` is now a type-only file (component export unreferenced). Cleanest follow-up: move `ElementProperties` to a shared `types/viewer.ts`, then delete the file. Not urgent.
