# Session: Dashboard Enhancement Sprint

## Summary
Major dashboard upgrade across 5 features: KPI card redesign (label-as-header, big numbers, type-to-instance ratio), donut color differentiation from treemap, 3D viewer element coloring by IFC class (treemap colors carry into viewer), footprint/heatmap toggle view (canvas 2D), and viewport height fix. Backend spatial extraction added to type_analysis() with migration. All changes compile clean.

## Changes
- **`frontend/src/pages/ModelWorkspace.tsx`**: All 5 features. KPI cards redesigned (label top, number center, sub-metric bottom). Quality card now has proxy-typed, removed empty types (shown on Types KPI). New `ViewerCardHeader` with 3D/footprint toggle. New `FootprintView` canvas component (heatmap dots colored by IFC class, bounding box outline with dimensions, origin crosshair, north arrow). `classColorMap` computed from treemap ordering and shared with viewer + footprint. Dashboard height constrained to `calc(100vh-9rem)` with flex-1 sizing.
- **`frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`**: New `classColorMap` prop. useEffect colors fragment meshes by IFC class using `fragment.setColor()` or material clone fallback.
- **`frontend/src/lib/api-types.ts`**: Added `spatial_data` to `ModelAnalysis` interface.
- **`backend/lib/ifc_toolkit/analyze.py`**: Added spatial extraction to `type_analysis()` — samples up to 2000 element positions via `get_world_xy()`, computes bounding box, returns as `spatial_data` in model_analysis dict.
- **`backend/apps/entities/models.py`**: Added `spatial_data` JSONField to ModelAnalysis.
- **`backend/apps/entities/services/analysis_ingestion.py`**: Passes spatial_data through to DB.
- **`backend/apps/entities/serializers.py`**: Added spatial_data to serializer fields.
- **Migration**: `0032_add_spatial_data` created and applied.
- **`DONUT_COLORS`**: Changed to blue/purple/gray palette (indigo/violet/slate) to avoid confusion with treemap colors in 3D viewer.

## Technical Details
- **FragmentIdMap** is a plain object `{ [fragmentID: string]: Set<number> }`, not a Map — use `Object.entries()` not `.forEach()`.
- **ThatOpen Fragment coloring**: `fragment.setColor(color, [...expressIds])` for per-instance coloring. Fallback clones material and sets color directly.
- **classColorMap** uses both `"IfcWall"` and `"Wall"` keys because treemap strips "Ifc" prefix but viewer typeInfo uses full names.
- **Spatial extraction**: Uses `get_world_xy()` from placement.py (reads translation column from 4x4 placement matrix). Samples to 2000 max for performance. No geometry processing needed.
- **Canvas footprint**: Uses devicePixelRatio for sharp rendering, transforms IFC XY to canvas coords with Y-flip. Unit conversion reads analysis.units for length unit symbol.

## Next
- Test all features in browser at `/models/{id}` — nothing has been browser-tested yet
- Existing models need re-analysis to get spatial_data (footprint shows "No spatial data" until then)
- Build BEP storey compliance check for Storeys KPI sub-metric
- Extract IfcSpace area (GrossFloorArea from Qto psets) for Spaces KPI sub-metric
- Test viewer coloring with both fragments and IFC loading paths

## Notes
- Storeys sub shows "—" / "BEP compliance" — waiting on BEP compliance check implementation
- Spaces sub shows "—" / "m2" — waiting on space area extraction from IFC
- User explicitly rejected mock data and fallback metrics — these must show real data or nothing
- Pre-existing TS errors in BEP components (MMITableMaker etc) — not touched, not our concern
