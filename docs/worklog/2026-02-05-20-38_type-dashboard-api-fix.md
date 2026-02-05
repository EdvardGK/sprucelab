# Session: Type Dashboard API Fix

## Summary

Fixed API/frontend field name mismatch that was causing Type Dashboard completeness bars to show 0%. The Type Dashboard component was already 95% complete - just needed field alignment between backend and frontend.

## Changes

### Backend (`apps/entities/views.py`)
- Renamed `classification_score` → `classification_percent`
- Renamed `unit_score` → `unit_percent`
- Renamed `material_score` → `material_percent`
- Renamed `total` → `total_types` in health score calculation
- Added `ignored`, `review`, `followup` to per-model breakdown

### Frontend (`hooks/use-warehouse.ts`)
- Updated `DashboardMetrics` interface to match API response
- Updated `ModelHealthMetrics` interface (added `followup`, removed unused `types_with_unit`/`types_with_materials`)

## Key Decisions

- **Types = IfcTypeObject only**: Confirmed architectural principle that only real IFC type objects should be stored as types. Current data follows this correctly (all 623 IFCTypes have `has_ifc_type_object=True`).

## Data Status

- **623 IFCTypes** exist with instance_count > 0
- **3 TypeMappings** exist (1 mapped, 2 ignored)
- **620 IFCTypes** have no TypeMapping (correctly counted as "pending")
- Health scores show 0% until types are classified

## Next Steps

1. **Test dashboard in browser** - Navigate to a project's BIMWorkbench to verify all components render correctly
2. **Start classifying types** - Use TypeLibraryPanel to classify some types and verify health scores update
3. **MVP Priority #2: Verification Engine** - Build FastAPI validator + ProjectConfig rule resolution
4. **MVP Priority #3: Sandwich View** - 2D material section diagram per type

## Files Changed

| File | Changes |
|------|---------|
| `backend/apps/entities/views.py` | Field renames, added missing fields to model breakdown |
| `frontend/src/hooks/use-warehouse.ts` | Updated TypeScript interfaces |
