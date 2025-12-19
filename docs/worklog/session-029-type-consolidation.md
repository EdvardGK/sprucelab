# Session 029: Type Consolidation Feature

**Date:** 2025-12-19
**Focus:** Type consolidation for cleaner type mapping, bulk mapping endpoint

## Summary

Implemented type consolidation feature to address the issue of duplicate type entries in the mapping UI. IFC models often have multiple types with the same name but different GUIDs, making manual mapping tedious. This session adds:

1. **Consolidated Types Endpoint** - Groups types by `(ifc_type, type_name)` signature
2. **Bulk Mapping Endpoint** - Maps all duplicate GUIDs at once
3. **ML-Style Type Signatures** - Includes key properties for better type identification

## Problem

The type mapping UI showed 974 raw types, but many were duplicates:
- Example: "Rectangular Mullion:40x100mm Tre" appeared 272 times with different GUIDs
- User couldn't reasonably map 100+ duplicate types individually
- Need to build a "type bank" for mapping crappy IFC models

## Solution

### Consolidated Types Endpoint

`GET /api/entities/types/consolidated/?model={id}`

Groups types by signature and returns:
- `ifc_type`: IFC class (IfcWallType, IfcColumnType, etc.)
- `type_name`: Type name from IFC
- `guid_count`: Number of unique type GUIDs with this signature
- `instance_count`: Total instances across all types
- `representative_id`: First type ID for detailed queries
- `mapping`: Current mapping status (if any)
- **Key Properties** (ML-style signature):
  - `is_external`: External/Internal classification
  - `loadbearing`: Load-bearing status
  - `fire_rating`: Fire resistance rating
  - `reference`: Type reference
  - `materials`: List of materials used

**Result:** 974 raw types → 357 consolidated types (63% reduction)

### Bulk Mapping Endpoint

`POST /api/entities/types/map-consolidated/`

Request body:
```json
{
  "model_id": "uuid",
  "ifc_type": "IfcColumnType",
  "type_name": "CFRS 150x150x10",
  "ns3451_code": "321",
  "mapping_status": "mapped"
}
```

Creates/updates TypeMapping for ALL types matching the signature at once.

**Test result:** Successfully mapped 37 duplicate "CFRS 150x150x10" types in one request.

## Technical Notes

### Property Extraction

Key properties are extracted from entity PropertySets (not stored on types directly):
- Query PropertySet where entity is assigned to the type
- Use most common value when multiple values exist (Counter.most_common)

### PostgreSQL UUID Limitation

Initial implementation used `Min('id')` for representative_id, but PostgreSQL doesn't support MIN() on UUID fields. Fixed by querying first type separately with `.first()`.

### Performance

Current consolidated endpoint takes ~40s due to N+1 queries for property extraction. Marked for future optimization (batch property queries, caching).

## Files Changed

- `backend/apps/entities/views.py` - Added consolidated + map-consolidated endpoints
- `backend/ifc-service/config.py` - Fixed port from 8001 to 8100

## Future Work

- Optimize consolidated endpoint performance
- Add NS3457-8 component codes support
- Frontend UI for consolidated type view
