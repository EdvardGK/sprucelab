# Session 028 - Bug Fixes and Reliability Improvements

**Date**: 2025-12-19
**Focus**: Fix IFC processing errors, add retry logic, improve viewer stability

## Issues Fixed

### 1. UUID→int64 Database Error in Type Assignments
**Problem**: Processing failed with "invalid input for query argument $1: UUID... (value out of int64 range)"

**Root Cause**: `TypeAssignment` Django model uses `BigAutoField` (auto-incrementing integer) for `id`, but FastAPI repository was passing UUIDs.

**Fix**: Updated `bulk_insert_type_assignments` in `ifc_repository.py` to omit the `id` column and let PostgreSQL auto-generate it:
```python
# Before (broken)
INSERT INTO type_assignments (id, entity_id, type_id) VALUES ($1, $2, $3)

# After (fixed)
INSERT INTO type_assignments (entity_id, type_id) VALUES ($1, $2)
```

### 2. IFC Service Port Mismatch
**Problem**: Frontend trying to connect to `localhost:8001` but FastAPI runs on `8100`

**Fix**: Updated `ifc-service-client.ts` default port from 8001 to 8100.

### 3. Connection Retry Logic
**Problem**: Single network failure causes immediate error to user

**Fix**: Added `fetchWithRetry` utility in `ifc-service-client.ts`:
- 3 retries with exponential backoff
- Jitter to prevent thundering herd
- Only retries on network errors (connection refused, timeout)

### 4. Viewer Initialization Race Condition
**Problem**: "No scene initialized!" error from ThatOpen Components

**Fixes**:
- Added try-catch around `world.scene?.three` access (ThatOpen getters throw instead of returning undefined)
- Added dimension check to wait for container to have valid size before initializing

### 5. Processing Error Not Cleared on Success
**Problem**: Old `processing_error` persisted after successful reprocessing

**Fix**: Added `processing_error=''` to the success path in `processing_orchestrator.py`.

### 6. Geometry Extraction for Aggregate Elements
**Problem**: IfcCurtainWall showed "Representation is NULL" error even though it has 68 instances

**Root Cause**: Aggregate elements (IfcCurtainWall, IfcStair, IfcRoof) don't have direct geometry - they decompose into child elements.

**Fix**: Updated `get_element_geometry` in `ifc_loader.py` to:
1. Try direct geometry first
2. Fall back to `IsDecomposedBy` children
3. Combine all child geometries into single mesh with proper vertex index offsetting

## Files Changed

### Backend
- `ifc-service/repositories/ifc_repository.py` - Fixed type_assignments insert
- `ifc-service/services/processing_orchestrator.py` - Clear error on success
- `ifc-service/services/ifc_loader.py` - Aggregate geometry extraction

### Frontend
- `lib/ifc-service-client.ts` - Port fix, retry logic, graceful null geometry
- `components/features/viewer/UnifiedBIMViewer.tsx` - Race condition fixes

## Testing
- Reprocessed model `3c6471ae` successfully (7,891 elements, 323K properties)
- Processed new model `d4641ab1` successfully (1,099 elements)
- Verified error cleared after reprocessing

## Best Practices Applied

| Error Type | Solution |
|------------|----------|
| Connection errors | Exponential backoff + jitter retry |
| Race conditions | Wait for dependencies, defensive try-catch |
| Library quirks | Wrap external APIs in try-catch |
| Schema mismatches | Check Django migrations for actual column types |
