# Session 031: Types-Only Architecture & TypeBank

**Date**: 2025-12-30

## Summary

Major architectural simplification: stopped storing individual IFC entities in the database. Now only store types with instance counts. Processing time drops from 10-30 seconds to ~2 seconds. Also added TypeBank - a collaborative cross-model type labeling system.

## Commits

| Hash | Description |
|------|-------------|
| `84e1a27` | Simplify to types-only architecture for faster IFC processing |
| `cb88fa7` | Add TypeBank collaborative type labeling system |
| `60122e3` | Add fragments viewer with fullscreen mode to type mapper |
| `f8b93c0` | Fix N+1 query in type mapper (200+ queries → 3) |
| `a9e690e` | Fix AgentRegistrationSerializer queryset error |

## Types-Only Architecture

### Problem
- Storing 838 entities per model (777 are geometry-only noise)
- 143k+ property rows duplicating IFC data
- 10-30 second parse time for bulk inserts
- Redundant: viewer loads IFC directly via FastAPI anyway

### Solution
```
Upload IFC → Extract TYPES only (2 sec) → Store in TypeBank with counts
           ↓
     Viewer/Properties → Query IFC file directly via FastAPI
```

### Changes

**Parser** (`ifc-service/services/ifc_parser.py`):
- Added `TypesOnlyResult` dataclass
- Added `parse_types_only()` method - extracts types with instance counts via `IfcRelDefinesByType`
- Zero-instance types still captured (useful for tracking unused library types)

**Orchestrator** (`ifc-service/services/processing_orchestrator.py`):
- Added `process_model_types_only()` - skips entity/property/spatial inserts
- Only writes: materials, types (with instance_count), TypeBank links

**Model** (`apps/entities/models.py`):
- Added `instance_count` field to `IFCType`
- Replaces computed annotation from join table

**Frontend** (`UnifiedBIMViewer.tsx`):
- Removed Django property fallback
- FastAPI is now the only source for element properties

**Cleanup**:
- Created `clear_entity_data` management command
- Deleted 180k+ legacy rows (19k entities, 143k properties, 17k type assignments)
- Added deprecation notice to `IFCEntityViewSet`

### Performance

| Metric | Before | After |
|--------|--------|-------|
| Parse time | 10-30 sec | ~2 sec |
| DB rows/model | 1000s | ~100 types |
| Property source | Django fallback | FastAPI only |

## TypeBank System

Cross-model collaborative type classification.

### Models
- `TypeBankEntry` - Canonical type identity (ifc_class, type_name, predefined_type, material)
- `TypeBankObservation` - Where types appear + instance counts per model
- `TypeBankAlias` - Alternative names that map to same entry

### Features
- Auto-links during IFC processing
- API with filtering, search, Excel/JSON export
- Migration command from legacy TypeMapping data
- Instance count aggregation across models

## Database Migration

```bash
# Ran today:
python manage.py migrate entities  # 0017, 0018
python manage.py clear_entity_data --confirm  # Deleted 180k rows
```

Also updated `.env.local` with correct Supabase pooler credentials (port 6543).

## Next Steps

1. Test IFC upload with new types-only processing
2. Verify TypeBank linking works correctly
3. Add TypeBank UI for collaborative labeling
4. Consider adding on-demand property caching if FastAPI queries become slow

## Files Changed

| File | Changes |
|------|---------|
| `ifc-service/services/ifc_parser.py` | +138 lines - parse_types_only() |
| `ifc-service/services/processing_orchestrator.py` | +285 lines - types-only path |
| `ifc-service/repositories/ifc_repository.py` | TypeBank linking, instance_count |
| `apps/entities/models.py` | TypeBank models, instance_count field |
| `apps/entities/views.py` | TypeBank API, deprecation notice |
| `frontend/.../UnifiedBIMViewer.tsx` | Removed Django fallback |
| `apps/models/management/commands/clear_entity_data.py` | New cleanup command |
