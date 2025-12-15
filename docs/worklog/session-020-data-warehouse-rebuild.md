# Session 020: Data Warehouse Architecture Rebuild

**Date**: 2024-12-08
**Focus**: Clean rebuild of BIM data warehouse after database wipe

## Context

User deleted the entire Sprucelab database due to fundamental architectural issues:
- Backend was too slow
- Geometry data was being pushed to DB (wrong approach)
- Processing was blocking on heavy geometry extraction
- Bugs and misunderstandings had "poisoned the code"

Key insight from type-mapper prototype: **Stream data directly from IFC, don't store geometry in DB**.

## Key Decisions

### Core Principle
**IFC is the source of truth. Stream on demand. DB stores mappings only.**

### What NOT to do (lessons learned)
1. Don't store geometry in database
2. Don't block on heavy geometry extraction
3. Don't couple viewer to database geometry
4. Don't make users wait for processing to complete

### New Architecture
```
Upload IFC → Store in Supabase Storage → Fast Index (< 30s)
                                              ↓
                                    Types, Materials extracted
                                    (NO geometry processing)
                                              ↓
                                    On-demand: Stream from IFC
```

## Changes Made

### 1. Architecture Document
Created `/docs/knowledge/DATA_WAREHOUSE_ARCHITECTURE.md`:
- Simplified data flow diagram
- Database schema (metadata only)
- API endpoint designs
- Implementation phases
- Migration plan

### 2. Warehouse Models
Added to `/backend/apps/entities/models.py`:

```python
# Cross-project product database
ProductLibrary:
    name, category, manufacturer, product_code
    description, epd_data (JSON)

# User mapping of IFC type to standards
TypeMapping:
    ifc_type (OneToOne)
    ns3451_code, product (FK)
    mapping_status, confidence, notes
    mapped_by, mapped_at

# User mapping of material to standards
MaterialMapping:
    material (OneToOne)
    standard_name, density_kg_m3
    epd_reference, thermal_conductivity
    mapping_status, notes

# Composite layer composition (sandwich editor)
TypeLayer:
    ifc_type (FK), layer_order
    material (FK), material_name
    thickness_mm, is_structural, is_ventilated
```

### 3. Warehouse Tab in BIM Workbench
Updated `/frontend/src/pages/BIMWorkbench.tsx`:

- Added "Warehouse" as first/default tab
- Sub-tabs:
  - **Type Library**: KPI cards, type table, NS-3451 mapping
  - **Material Library**: Material properties, density, EPD
  - **Product Library**: Cross-project product database
  - **Mapping Progress**: Progress bars, export buttons

## Files Modified

| File | Change |
|------|--------|
| `docs/knowledge/DATA_WAREHOUSE_ARCHITECTURE.md` | Created - architecture plan |
| `backend/apps/entities/models.py` | Added 4 warehouse models |
| `frontend/src/pages/BIMWorkbench.tsx` | Added Warehouse tab + sub-tabs |

## Next Steps

### Immediate (to complete this work)
1. Run migrations:
   ```bash
   cd backend
   python manage.py makemigrations entities
   python manage.py migrate
   ```

2. Create API endpoints for warehouse:
   - `GET /api/warehouse/types/` - List types with mapping status
   - `PATCH /api/warehouse/types/{id}/` - Update type mapping
   - `GET /api/warehouse/materials/` - List materials
   - `GET /api/warehouse/products/` - Product library

3. Connect frontend to API

### Future phases
- Simplify parse service (types/materials only, no geometry)
- IFC streaming endpoints (read elements on-demand)
- Simple mesh preview generation
- Sandwich layer editor UI

## Related Work

- Type-mapper prototype: `/home/edkjo/dev/type-mapper/`
  - Started as separate project, functionality now integrated into Sprucelab
  - Can be archived or used as reference

- IFC Workbench library: `/home/edkjo/dev/ifc-workbench/`
  - Fast parsing guide relevant for streaming approach

## Technical Notes

### Why stream from IFC instead of caching in DB?

1. **IFC files are already a database** - querying with ifcopenshell is fast
2. **Geometry is expensive** - calculating mesh data takes 10-100x longer than reading metadata
3. **Users need fast feedback** - upload should feel instant, not take minutes
4. **Flexibility** - streaming allows filtering, pagination, lazy loading

### Viewer strategy

For now: Simple mesh preview (like type-mapper prototype)
Later: Add Speckle or ThatOpen for full 3D viewing

The key insight is that a full BIM viewer is a separate concern from data warehouse/coordination tools.
