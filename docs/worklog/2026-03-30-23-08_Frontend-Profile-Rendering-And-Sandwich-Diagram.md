# Session: Frontend Profile Rendering, Sandwich Diagram, and HUD Enhancements

## Summary
Built the complete frontend pipeline for 2D profile visualization in the InlineViewer HUD. Three rendering modes now exist for 2D view: clean profile outlines (beams/columns/pipes), sandwich layer diagrams (walls/slabs), and clipped 3D mesh fallback. Also added dimension annotations with mm measurements and XYZ axis indicators (BIM Z-up convention).

## Changes

### New Files
- **`frontend/src/hooks/useInstanceProfile.ts`** — React Query hook that fetches `ProfileData` from FastAPI `GET /ifc/{file_id}/profile/{guid}`, with in-memory cache for instant prev/next navigation.

### Modified Files
- **`frontend/src/lib/ifc-service-client.ts`** — Added `ProfilePoint`, `ProfileData` types and `getElementProfile()` function. Returns null for elements without extractable profiles (404/422).

- **`frontend/src/components/features/warehouse/instance-hud/HUDScene.tsx`** — Major additions:
  - **Profile outline rendering**: `buildProfileOutline()` creates `THREE.LineLoop` from outline points + `THREE.ShapeGeometry` fill with holes for hollow sections.
  - **Dimension annotations**: `createDimension()` draws extension lines, tick marks, and mm labels using canvas-texture sprites. `buildDimensionAnnotations()` generates per-profile-type dimensions (overall width/height + detail dims for I-shapes, hollow rects, circles, T-shapes, L-shapes, C-shapes).
  - **Sandwich layer diagram**: `buildSandwichDiagram()` draws stacked filled rectangles from `TypeDefinitionLayer` data with material name labels and per-layer thickness dimensions.
  - **XYZ axis indicator**: `buildAxisHelper()` shows BIM Z-up convention (BIM Z maps to Three.js Y for 3D, local XY for 2D profile plane).
  - **IFC→Three.js coordinate transform**: Vertex loading now maps IFC Z-up to Three.js Y-up: `(x, y, z) → (x, z, -y)`.
  - **2D view priority chain**: profile outline > sandwich diagram > clipped 3D mesh fallback.

- **`frontend/src/components/features/viewer/InlineViewer.tsx`** — Wired `useInstanceProfile` hook and `definitionLayers` prop. Passes both to HUDScene.

- **`frontend/src/components/features/warehouse/TypeBrowserListView.tsx`** — Passes `definitionLayers` to InlineViewer.
- **`frontend/src/components/features/warehouse/TypeMappingWorkspace.tsx`** — Passes `definitionLayers` to InlineViewer.
- **`frontend/src/components/features/warehouse/library/TypeLibraryView.tsx`** — Passes `definitionLayers` to InlineViewer.

## Technical Details

### 2D View Priority Chain
The HUD 2D mode checks data sources in priority order:
1. **Profile outline** (IfcProfileDef) — for columns, beams, ducts, pipes, members, rails. Clean 2D polyline from the backend profile extractor.
2. **Sandwich diagram** (TypeDefinitionLayer) — for walls, slabs, coverings. Stacked rectangles from manually-entered material layers.
3. **Clipped 3D mesh** — fallback for elements with neither profile nor layers.

### Coordinate Transform
IFC uses Z-up, Three.js uses Y-up. Fixed by transforming vertices at load time: `(x,y,z) → (x,z,-y)`. The axis indicator maps BIM labels accordingly: BIM X→Three.js X, BIM Y→Three.js Z, BIM Z→Three.js Y.

### Dimension Annotations
Canvas-texture sprites for text labels (resolution-independent, scale with scene). Dimension lines use standard technical drawing convention: extension lines from feature → dimension line between with tick marks → centered label. Scale proportional to profile/sandwich size.

## Next
- Test everything in browser (profile rendering, sandwich diagram, axis alignment, coordinate transform)
- Sandwich diagram needs real layer data to test — requires a wall type with `TypeDefinitionLayer` entries in the DB
- Profile rendering for ducts/pipes not yet confirmed working (backend profile extractor may need IfcCircleProfileDef handling verification for duct types)
- LayerEditorPopup — popup for editing TypeDefinitionLayer from 2D mode
- Material layer auto-extraction from IfcMaterialLayerSet during IFC parsing

## Notes
- User confirmed "cut" annotation line style works great for technical sections
- User clarified: walls show ONLY layer composition in 2D (not geometry section cuts) because walls have irregular shapes with cutouts
- Profile types include: columns, beams, ducts, pipes, members, rails (anything with IfcProfileDef)
- The `definitionLayers` prop is optional — callers that don't have type mapping data can omit it and the HUD degrades gracefully
- All changes compile clean (tsc + vite build verified)
