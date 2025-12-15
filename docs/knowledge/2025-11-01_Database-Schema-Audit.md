# Database Schema Audit - Before Cleanup

**Date**: 2025-11-01
**Purpose**: Document current schema before implementing lean metadata-only architecture

---

## Current Tables (15 total)

### Core Tables (Keep & Modify)
1. **projects** - Project management ✅
2. **models** - IFC file tracking ✅ (needs coordinate fields)
3. **ifc_entities** - Building elements ✅ (needs cleanup + quantity fields)
4. **property_sets** - Psets storage ✅
5. **spatial_hierarchy** - Building/Storey structure ✅
6. **scripts** - Script library ✅
7. **script_executions** - Execution history ✅

### Tables to Evaluate
8. **systems** - HVAC, Electrical systems ❓ (Keep for MEP?)
9. **system_memberships** - Element-system relationships ❓
10. **materials** - Material library ❓ (Keep for LCA?)
11. **material_assignments** - Element-material relationships ❓
12. **ifc_types** - Type objects ❓
13. **type_assignments** - Element-type relationships ❓

### Tables to Remove
14. **geometry** - Binary geometry storage ❌ (DROP ENTIRE TABLE)

### BEP Tables
15. **bep_configurations** + related - BEP system ❓ (Evaluate if used)

---

## IFCEntity Model - Current State

**Location**: `backend/apps/entities/models.py:9-64`

### Fields to KEEP:
```python
id = UUIDField(primary_key=True)
model = ForeignKey('models.Model')
ifc_guid = CharField(max_length=22)  # ✅ CRITICAL
ifc_type = CharField(max_length=100)  # ✅ CRITICAL
name = CharField(max_length=255)  # ✅ CRITICAL
description = TextField()
storey_id = UUIDField()
```

### Fields to REMOVE (Lines 35-52):
```python
❌ geometry_status = CharField(...)  # Layer 2 tracking - not needed
❌ has_geometry = BooleanField()  # Deprecated
❌ vertex_count = IntegerField()  # Deprecated
❌ triangle_count = IntegerField()  # Deprecated
❌ bbox_min_x/y/z = FloatField()  # Deprecated (6 fields)
❌ bbox_max_x/y/z = FloatField()  # Deprecated (6 fields)
```

### Fields to ADD:
```python
✅ area = FloatField(null=True)  # m² - Net floor area
✅ volume = FloatField(null=True)  # m³ - Net volume
✅ length = FloatField(null=True)  # m - Length (beams, pipes)
✅ height = FloatField(null=True)  # m - Height (rooms, buildings)
✅ perimeter = FloatField(null=True)  # m - Perimeter
```

---

## Geometry Model - DROP ENTIRELY

**Location**: `backend/apps/entities/models.py:212-248`

**Rationale**: Stores binary blobs (vertices_original, faces_original, vertices_simplified, faces_simplified) - not needed for metadata-driven architecture.

**Size Impact**: 50MB+ per model × 10 versions = 500MB+ saved

**Migration**:
```python
class Migration:
    operations = [
        migrations.DeleteModel(name='Geometry'),
    ]
```

---

## Model Class - Current State

**Location**: `backend/apps/models/models.py:9-133`

### Current Fields (Keep):
```python
✅ id, project, name, original_filename
✅ ifc_schema, file_url, file_size
✅ fragments_url, fragments_size_mb, fragments_generated_at  # ThatOpen support!
✅ status, parsing_status, geometry_status, validation_status
✅ version_number, parent_model, is_published
✅ element_count, storey_count, system_count
✅ task_id  # Celery task tracking
✅ created_at, updated_at
```

### Fields to ADD (Coordinate Systems):
```python
✅ gis_basepoint_x = FloatField(null=True)  # GIS coordinates
✅ gis_basepoint_y = FloatField(null=True)
✅ gis_basepoint_z = FloatField(null=True)
✅ gis_crs = CharField(max_length=50, null=True)  # e.g., "EPSG:25832"

✅ local_basepoint_x = FloatField(default=0)  # Local coordinates
✅ local_basepoint_y = FloatField(default=0)
✅ local_basepoint_z = FloatField(default=0)

✅ transformation_matrix = JSONField(null=True)  # 4x4 matrix for GIS ↔ Local
```

---

## PropertySet Model - Keep As-Is

**Location**: `backend/apps/entities/models.py:92-111`

**Status**: ✅ Perfect for our needs - stores Psets as individual properties

**Usage**: BEP validation, scripting, queries

---

## Systems/Materials/Types - Evaluate Later

**Decision**: Keep for now, evaluate based on actual usage:
- **Systems**: Useful for MEP coordination
- **Materials**: Useful for LCA workflows
- **Types**: Useful for standardization

**Rationale**: Not bloated (no binary data), potentially useful, low storage overhead.

---

## Summary of Changes

### Immediate Changes (Week 1):

**IFCEntity**:
- ❌ Remove 10 geometry-related fields
- ✅ Add 5 quantity fields
- Net change: -5 fields, cleaner schema

**Geometry Table**:
- ❌ Drop entire table
- Impact: ~500MB storage saved per 10 model versions

**Model**:
- ✅ Add 8 coordinate system fields
- Impact: Support GIS + Local coordinate display

**Total Migrations Needed**: 3
1. Remove geometry fields from IFCEntity
2. Add quantity fields to IFCEntity + coordinate fields to Model
3. Drop Geometry table

---

## Next Steps

1. Create migrations for changes above
2. Run migrations on development database
3. Update parse.py to extract quantities (not geometry)
4. Test with sample IFC file
5. Verify dashboard queries work with new schema

**Estimated Time**: 2-3 hours for migrations + testing
