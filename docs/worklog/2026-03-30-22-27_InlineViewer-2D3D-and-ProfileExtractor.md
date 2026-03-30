# Session: InlineViewer 2D/3D Toggle + Profile Extractor Backend

## Summary
Executed the InlineViewer 2D/3D plan (Steps 2-6): replaced HUD/Model toggle with 2D/3D dimension toggle, kept solid/wireframe ViewControls, and fixed a critical bug where the ortho camera distance was hardcoded (100 units) causing mm-scale geometry to render as a top view instead of section profile. Also built the IfcProfileDef extraction backend — a new FastAPI service that extracts parametric 2D cross-section profiles from beams/columns with full outline generation for 9+ profile types.

## Changes

### Frontend — InlineViewer Redesign
- **`InlineViewer.tsx`**: Full rewrite. Replaced `ViewMode='hud'|'model'` with `ViewDimension='2d'|'3d'`. "See in Model" is now a separate view (not a toggle tab) with back button. Keyboard shortcuts: `2`/`3` for dimension, `S`/`W` for solid/wireframe, `Escape` to exit model view.
- **`HUDScene.tsx`**: Added proper section logic — finds longest bounding box axis, places clip plane at midpoint, positions ortho camera looking along that axis with Z-up. Fixed mm-scale geometry bug: camera distance, near/far planes, grid scale, and persp controls all now scale proportionally to geometry size.
- **`HUDOverlays.tsx`**: Added `ResetCameraButton` component. Kept `ViewControls` (solid/wireframe + reset). Updated exports.
- **i18n**: Added `inlineViewer.view2d/view3d/editLayers/noLayersDefined/addLayers` keys to en.json + nb.json.
- **Deleted**: `InstanceHUD.tsx`, `InstanceViewer.tsx` (both unused dead code, moved to trash).

### Backend — Profile Extractor
- **NEW `services/profile_extractor.py`**: Extracts IfcProfileDef from IFC elements. Traverses type objects (RepresentationMaps) and instance representations. Handles IfcExtrudedAreaSolid, IfcRevolvedAreaSolid, IfcBooleanResult, IfcMappedItem.
- **Profile types supported**: Rectangle, RectangleHollow, Circle, CircleHollow, IShape (HEB/HEA/IPE), LShape, TShape, CShape/UShape, Ellipse, ArbitraryClosedProfileDef (polyline), ArbitraryWithVoids.
- **NEW endpoint**: `GET /api/v1/ifc/{file_id}/profile/{guid}` — returns `ProfileData` with parametric params + 2D outline polyline.
- **NEW schema**: `ProfileData`, `ProfilePoint` in `models/schemas.py`.
- **Tested** on A4_RIB_B.ifc (structural model): HEB340 I-beam (13pt outline), RHS400x16 hollow rect (5pt + void), L150x15 angle, CHS355.6x16 circular hollow — all correct.

## Technical Details

### 2D Section View Logic
The section cut works by: (1) computing bounding box of centered geometry, (2) finding longest axis, (3) placing a THREE.Plane clip at origin perpendicular to that axis, (4) positioning ortho camera along that axis. Camera up = Z for X/Y longest axis, Y for Z longest axis. Frustum is sized to fit the cross-section dimensions with proper aspect ratio.

**Critical bug fixed**: `camDist` was hardcoded to 100. For mm-scale IFC geometry (e.g., a 5000mm beam), the camera was inside the object and far plane (500) didn't reach the clip plane. Fix: `camDist = maxDim * 2`, `far = maxDim * 5`. Same issue affected persp camera (far=500 too small for mm geometry).

### Profile Extraction Strategy
Profiles are found by traversing: Element → IsDefinedBy → IfcRelDefinesByType → IfcTypeObject → RepresentationMaps → MappedRepresentation → Items → IfcExtrudedAreaSolid → SweptArea → IfcProfileDef. Falls back to instance's own Representation if type path fails. Boolean CSG trees are recursed (depth-limited to 5).

## Next
- Test the 2D section view in browser (check console `[HUDScene] Section setup:` log)
- Frontend profile rendering: hook to fetch ProfileData, render outline as clean 2D lines in HUDScene when profile is available (fall back to clipped 3D mesh when no profile)
- LayerEditorPopup (Step 4 of original plan)
- Material layer auto-extraction from IfcMaterialLayerSet during parsing (thickness, ordering)

## Notes
- The 2D section still shows clipped 3D geometry — not clean profile lines yet. Profile rendering will replace this for elements that have IfcProfileDef.
- IFC file A4_RIB_B.ifc has 251 profile definitions across 8 profile types — good coverage for testing.
- In 2D wireframe mode, only edge lines show (no fill) — gives a clean technical drawing aesthetic.
- ArbitraryClosedProfileDef with IfcCompositeCurve segments (trimmed arcs) need proper tessellation for round corners. Current implementation handles polylines and indexed poly curves but approximates trimmed curves.
