# Data Warehouse Architecture - Clean Rebuild

**Date**: 2024-12-08
**Status**: Implementation Plan

## Core Principle

**IFC is the source of truth. Stream on demand. DB stores mappings only.**

## What Went Wrong Before

1. **Geometry in DB** - Tried to extract and store mesh data
2. **Heavy processing** - Blocked on geometry extraction
3. **Tight coupling** - Viewer depended on DB geometry
4. **Slow feedback** - Users waited for processing to complete

## New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER UPLOADS IFC                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE STORAGE                              │
│                   (IFC file stored as-is)                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FAST INDEX (< 30 seconds)                      │
│  Extract from IFC:                                               │
│  - File metadata (schema, element count)                         │
│  - Type definitions (IfcWallType, etc.)                         │
│  - Material definitions                                          │
│  - Spatial structure (storeys)                                   │
│  NO GEOMETRY - just metadata                                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE (METADATA ONLY)                    │
│                                                                  │
│  Model          - File reference, schema, counts                 │
│  IFCType        - Type definitions extracted from IFC            │
│  Material       - Material definitions from IFC                  │
│  TypeMapping    - User annotations (NS-3451 code, product ID)    │
│  MaterialMapping - User annotations (density, EPD reference)     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ON-DEMAND STREAMING                            │
│                                                                  │
│  When user needs:                                                │
│  - Element list → Stream from IFC                                │
│  - Element properties → Stream from IFC                          │
│  - 3D preview → Generate simple mesh on-the-fly                  │
│  - QTO data → Calculate from IFC geometry                        │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema (Simplified)

### Keep (from existing)
```python
# Model - just file reference
Model:
    id, project_id, name, file_url, ifc_schema
    element_count, type_count, material_count
    created_at, updated_at

# Type definitions from IFC
IFCType:
    id, model_id, type_guid, type_name, ifc_class
    # e.g. "IfcWallType", "Basic Wall:200mm Concrete"

# Material definitions from IFC
Material:
    id, model_id, name, category
```

### Add (for warehouse)
```python
# User mapping of IFC type to standard
TypeMapping:
    id, ifc_type_id
    ns3451_code      # "32.21" Building part code
    product_id       # Link to ProductLibrary
    mapping_status   # pending, mapped, ignored
    notes

# User mapping of material to standard
MaterialMapping:
    id, material_id
    standard_name    # Normalized name
    density_kg_m3    # User-provided density
    epd_reference    # Link to EPD database
    mapping_status
    notes

# Product library (cross-project)
ProductLibrary:
    id, name, category
    manufacturer, product_code
    epd_data (JSON)

# Composite type layers (sandwich)
TypeLayer:
    id, ifc_type_id
    layer_order
    material_id
    thickness_mm
```

## API Endpoints

### Upload & Index
```
POST /api/models/upload/
  - Upload IFC to Supabase Storage
  - Trigger fast index (async)
  - Return model_id immediately

GET /api/models/{id}/
  - Model metadata + index status
```

### On-Demand Streaming
```
GET /api/models/{id}/types/
  - List all types from DB (already indexed)

GET /api/models/{id}/materials/
  - List all materials from DB

GET /api/models/{id}/elements/?type=IfcWall
  - Stream elements from IFC file
  - Filter by type
  - Paginated

GET /api/models/{id}/elements/{guid}/
  - Stream single element + properties from IFC

GET /api/models/{id}/elements/{guid}/geometry/
  - Generate simple mesh on-the-fly
  - Return GLB or OBJ
```

### Warehouse (User Mappings)
```
GET /api/warehouse/types/
  - All types across all models
  - Grouped, deduplicated by name

PATCH /api/warehouse/types/{id}/mapping/
  - Update NS-3451 code, product_id

GET /api/warehouse/materials/
  - All materials across all models

PATCH /api/warehouse/materials/{id}/mapping/
  - Update density, EPD reference

GET /api/warehouse/products/
  - Product library

POST /api/warehouse/products/
  - Add product to library
```

## Frontend Tabs

### BIM Workbench → Warehouse Tab

```tsx
<Tabs>
  <Tab id="types" label="Type Library">
    - Table of all IFCTypes
    - Group by ifc_class (IfcWallType, IfcDoorType)
    - Mapping status badge (pending/mapped/ignored)
    - Click to open mapping dialog
    - Sandwich layer editor for composite types
  </Tab>

  <Tab id="materials" label="Material Library">
    - Table of all Materials
    - Group by category
    - Mapping status badge
    - Click to edit density/EPD
  </Tab>

  <Tab id="products" label="Product Library">
    - Cross-project product database
    - Link to EPD databases
    - Import from CSV
  </Tab>

  <Tab id="statistics" label="Mapping Progress">
    - KPI cards (mapped/pending/ignored)
    - Progress chart
    - Export mapped data
  </Tab>
</Tabs>
```

## Implementation Order

### Phase 1: Fast Index (Today)
1. Simplify parse.py - extract types/materials only
2. Create TypeMapping, MaterialMapping models
3. API endpoints for types/materials

### Phase 2: Warehouse UI
1. Add Warehouse tab to BIMWorkbench.tsx
2. Type library table with mapping dialog
3. Material library table

### Phase 3: On-Demand Streaming
1. IFC streaming service (read elements on-demand)
2. Simple mesh generation for preview
3. Element properties streaming

### Phase 4: Sandwich Editor
1. TypeLayer model
2. Layer editor UI component
3. Bird's eye view preview

## Key Decisions

1. **No geometry in DB** - IFC is source of truth
2. **Fast index < 30s** - Just types/materials/counts
3. **Stream on demand** - Don't pre-process everything
4. **Simple viewer** - Mesh preview, not full BIM viewer
5. **Focus on workflow** - Type mapping, material mapping, coordination

## Migration from Old Schema

Since DB was wiped, we start fresh:

```bash
# Reset migrations
python manage.py makemigrations --empty entities
python manage.py makemigrations --empty models

# Create new schema
python manage.py makemigrations
python manage.py migrate
```

## References

- Type-mapper prototype: `/home/edkjo/dev/type-mapper/`
- IFC Workbench library: `/home/edkjo/dev/ifc-workbench/`
- Fast parsing: `ifc-workbench/docs/performance/FAST_PARSING_GUIDE.md`
