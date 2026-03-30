# Session: InlineViewer HUD & Viewer Consolidation

## Summary
Fixed the "no types found" regression (root cause: unmigrated verification engine fields causing ProgrammingError on all type queries), then built the Instance HUD - an Iron Man-inspired lightweight instance inspector using plain Three.js instead of the heavy ThatOpen pipeline. Consolidated the viewer architecture from 5 separate viewer components down to 2: a full-page `UnifiedBIMViewer` and a new `InlineViewer` with HUD/Model mode toggle.

## Changes
- **Migration applied**: `entities.0031_verification_engine_fields` - added `verification_issues` JSONField + `verified_engine_at` to TypeMapping. This was the root cause of the "no types found" regression (every query to `/api/entities/types/` threw ProgrammingError).
- **Missing i18n keys fixed**: Added `typeLibrary.singleModel`, `projectWide`, `openWorkbench`, `classifySelected`, `selectTypeToPreview`, `projectWideComingSoon` to both en.json and nb.json.
- **New hooks**: `useInstanceDetail.ts` (fetches element properties/quantities from FastAPI), `useInstanceGeometry.ts` (fetches tessellated mesh with in-memory cache for instant prev/next).
- **New HUD components**: `instance-hud/HUDScene.tsx` (plain Three.js renderer, solid/wireframe toggle, ~200 lines), `instance-hud/HUDOverlays.tsx` (glassmorphic overlay panels - identity, quantities, location, nav, ~280 lines), `instance-hud/InstanceHUD.tsx` (composition component, ~180 lines).
- **New InlineViewer**: `viewer/InlineViewer.tsx` - single inline viewer with HUD/Model mode toggle. HUD mode uses lightweight Three.js (10KB per element), Model mode lazy-loads full ThatOpen TypeInstanceViewer.
- **Updated consumers**: `TypeLibraryView.tsx` and `TypeMappingWorkspace.tsx` now use `InlineViewer` instead of separate viewer components.
- **Deleted dead code**: `TypeLibraryPanel.tsx` (confirmed orphaned, not imported anywhere).

## Technical Details
**Why plain Three.js for HUD**: The existing TypeInstanceViewer loads the full IFC model (~100MB) via ThatOpen Components + web-ifc WASM, then uses Hider to isolate instances. This is slow (5-30s) and the Hider filtering has race conditions. The HUD approach calls FastAPI's existing `getElementGeometry(fileId, guid)` endpoint which returns pre-tessellated vertices+faces for a single element (~10KB), rendered in a vanilla Three.js scene with OrbitControls. Data loads in <500ms, geometry in 1-2s.

**Viewer consolidation**: Previously had 5 viewer-like components (UnifiedBIMViewer, TypeInstanceViewer, InstanceHUD, HUDScene, InstanceViewer wrapper). Consolidated to 2 public-facing viewers: `UnifiedBIMViewer` (full-page, multi-model) and `InlineViewer` (inline, HUD/Model toggle). The HUD sub-components (HUDScene, HUDOverlays) are internal to InlineViewer.

**FastAPI service**: Needed to install missing Python packages (fastapi, uvicorn, asyncpg) in the conda env to run `ifc-service` locally on port 8100. Not previously run in local dev.

## Next
- Test the InlineViewer in browser - HUD mode rendering, Model mode lazy-loading
- Fix the data balance in HUD (user feedback: 3D space too big, data too small)
- Test verification endpoint: `POST /api/types/verify/?model={id}`
- B3: Dashboard Enhancement - wire verification results into UI

## Notes
- FastAPI service runs on port 8100: `cd backend/ifc-service && uvicorn main:app --port 8100`
- The InlineViewer's Model mode still uses TypeInstanceViewer which has the broken Hider filtering - this is a known issue but acceptable since HUD mode is the default
- InstanceHUD.tsx is now unused (replaced by InlineViewer which inlines the same logic) - could be deleted in cleanup
- Geometry cache in useInstanceGeometry.ts is per-session in-memory Map - cleared on page refresh
