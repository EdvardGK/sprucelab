# BIM Coordinator Platform - Technical Architecture Deep Dive

**Version**: 1.0
**Date**: 2025-10-25
**Purpose**: Comprehensive technical documentation for PRD - "IFC as Layer 1" concept
**Audience**: Engineering team, technical stakeholders, architects

---

## Table of Contents

1. [The "IFC as Layer 1" Concept](#ifc-as-layer-1)
2. [Layered Architecture: Parse → Geometry → Validate](#layered-architecture)
3. [Complete Database Schema (15 Tables)](#database-schema)
4. [Data Flow: Upload to Viewer](#data-flow)
5. [Graph Storage in PostgreSQL](#graph-storage)
6. [Query Patterns for Coordinator Workflows](#query-patterns)
7. [Performance Characteristics](#performance)
8. [Why This Architecture Scales](#scalability)
9. [Comparison to Competitors](#competitive-technical)
10. [Future Optimizations](#optimizations)

---

<a name="ifc-as-layer-1"></a>
## 1. The "IFC as Layer 1" Concept

### 1.1 What is "IFC as Layer 1"?

**Traditional Approach** (Competitors):
```
IFC File → Parse & Convert → Proprietary Format → Database
                ↓
         (Original IFC discarded or archived)
```

**Our Approach** (Layer 1 Foundation):
```
IFC File → Parse Metadata → PostgreSQL (GUID-based Layer 1) → All Features Build on This
                  ↓
            GUID becomes primary key for ALL operations
```

**Core Principle**: **IFC metadata IS the database, not just a source for the database.**

### 1.2 What This Means

**IFC is not a file format we convert from - it's the foundational data model.**

| Aspect | Traditional Approach | Our "Layer 1" Approach |
|--------|---------------------|------------------------|
| **IFC GlobalId** | Sometimes stored, sometimes not | REQUIRED - uniquely identifies every element across versions |
| **Metadata** | Extracted, transformed, stored in proprietary schema | Extracted, preserved as-is, stored with IFC types intact |
| **Geometry** | Extracted with metadata (blocking) | SEPARATE from metadata (optional, deferred, retryable) |
| **Properties** | Flattened or simplified | ALL Psets stored in JSONB (query-able, exact) |
| **Relationships** | Lost or simplified | Stored as graph edges (IFC relationship types preserved) |
| **Spatial Hierarchy** | Partially captured | Complete Project→Site→Building→Storey path stored |
| **Change Tracking** | Impossible without GUID | GUID comparison enables version diffing |
| **Standards Compliance** | "IFC-based" (marketing) | **IFC IS the data model** (technical truth) |

### 1.3 Why This Matters for Coordinators

**Problem Coordinators Face**:
- "Did this wall change between versions?" → Need GUID tracking
- "Which walls are on Level 2?" → Need spatial hierarchy
- "Show me all structural elements" → Need IFC type queries
- "What's the fire rating of this door?" → Need property lookups
- "Which system is this pipe part of?" → Need relationship traversal

**With "IFC as Layer 1"**:
- ✅ **GUID is permanent** → Change detection works across ALL model updates
- ✅ **Spatial hierarchy preserved** → Filter by storey/building/site instantly
- ✅ **IFC types intact** → Query by `IfcWall`, `IfcDoor`, etc. (not translated types)
- ✅ **All properties stored** → No data loss, no simplification
- ✅ **Relationships queryable** → Traverse spatial/system/type relationships

### 1.4 The Three-Layer Mental Model

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: VALIDATION (Quality Checks)                            │
│ • BEP compliance checks                                          │
│ • IDS validation (buildingSMART)                                 │
│ • MMI maturity level verification                                │
│ • LOD (Level of Detail) checks                                   │
│ • Property completeness checks                                   │
│                                                                   │
│ Status: validation_status (pending/validating/completed/failed)  │
│ Performance: 5-30 seconds                                        │
│ Can Fail: YES (reports issues, doesn't block)                    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: GEOMETRY (3D Meshes - Optional)                        │
│ • Extract 3D vertex data                                         │
│ • Generate triangle meshes                                       │
│ • Compute bounding boxes                                         │
│ • Optional simplification (LOD)                                  │
│ • Store in separate Geometry table                               │
│                                                                   │
│ Status: geometry_status (pending/extracting/completed/partial)   │
│ Performance: 30 seconds - 5 minutes                              │
│ Can Fail: YES (per-element, doesn't lose metadata)               │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: PARSE (Metadata - ALWAYS SUCCEEDS)                     │
│ • IFC GUID (22-character unique ID)                              │
│ • IFC Type (IfcWall, IfcDoor, etc.)                             │
│ • Name, Description                                              │
│ • ALL Property Sets (Psets) → JSONB                             │
│ • Spatial Hierarchy (Project→Site→Building→Storey)              │
│ • Systems, Materials, Types                                      │
│ • Graph Relationships (stored as edges)                          │
│                                                                   │
│ Status: parsing_status (pending/parsing/parsed/failed)           │
│ Performance: 5-15 seconds (10-100x faster than old approach)     │
│ Can Fail: ONLY if file is corrupt                                │
│ THIS IS THE FOUNDATION FOR EVERYTHING ELSE                       │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight**: **Layer 1 is rock-solid**. Even if geometry extraction fails on 100% of elements, coordinators can still:
- Query elements by type, storey, system
- Validate property completeness
- Track changes between versions (GUID comparison)
- Generate validation reports
- Create BCF issues (linked to GUIDs, not geometry)
- Run clash detection (bounding boxes from IFC, not meshes)

**Geometry is an enhancement, not a requirement.**

### 1.5 Real-World Example: What Gets Stored

**IFC File Input** (simplified):
```ifc
#100 = IFCWALL('2O2Fr$t4X7Zf8NOew3FL9r', #41, 'Exterior Wall', 'Structural load-bearing wall', ...);
  → Has Properties:
      Pset_WallCommon.IsExternal = TRUE
      Pset_WallCommon.FireRating = EI60
      Pset_WallCommon.LoadBearing = TRUE
  → Located in: Building Storey "Level 1"
  → Uses Material: "Concrete 200mm"
  → Has Type: "Exterior Wall Type 01"
  → Has Geometry: 245 vertices, 490 triangles
```

**Layer 1 Storage** (PostgreSQL):
```sql
-- IFCEntity table (ALWAYS created)
INSERT INTO ifc_entities (
    id, model_id, ifc_guid, ifc_type, name, description,
    storey_id, geometry_status
) VALUES (
    '550e8400-...', -- UUID (database primary key)
    'project-uuid',
    '2O2Fr$t4X7Zf8NOew3FL9r', -- IFC GUID (永久 identifier)
    'IfcWall',
    'Exterior Wall',
    'Structural load-bearing wall',
    'storey-level-1-uuid',
    'pending' -- Geometry not extracted yet
);

-- PropertySet table (ALWAYS created)
INSERT INTO property_sets (entity_id, pset_name, property_name, property_value) VALUES
    ('550e8400-...', 'Pset_WallCommon', 'IsExternal', 'TRUE'),
    ('550e8400-...', 'Pset_WallCommon', 'FireRating', 'EI60'),
    ('550e8400-...', 'Pset_WallCommon', 'LoadBearing', 'TRUE');

-- MaterialAssignment table (ALWAYS created)
INSERT INTO material_assignments (entity_id, material_id) VALUES
    ('550e8400-...', 'material-concrete-200mm-uuid');

-- TypeAssignment table (ALWAYS created)
INSERT INTO type_assignments (entity_id, type_id) VALUES
    ('550e8400-...', 'type-exterior-wall-01-uuid');

-- GraphEdge table (relationships)
INSERT INTO graph_edges (source_entity_id, target_entity_id, relationship_type) VALUES
    ('storey-level-1-uuid', '550e8400-...', 'IfcRelContainedInSpatialStructure');
```

**Layer 2 Storage** (Optional - can be deferred or skipped):
```sql
-- Geometry table (ONLY if geometry extraction succeeds)
INSERT INTO geometry (
    entity_id, vertex_count, triangle_count,
    bbox_min_x, bbox_min_y, bbox_min_z,
    bbox_max_x, bbox_max_y, bbox_max_z,
    vertices_original, faces_original -- Binary BLOBs (compressed numpy arrays)
) VALUES (
    '550e8400-...',
    245, 490,
    0.0, 0.0, 0.0,
    5.0, 0.2, 3.0,
    <binary_data>, <binary_data>
);

-- Update entity status
UPDATE ifc_entities SET geometry_status = 'completed' WHERE id = '550e8400-...';
```

**What if geometry extraction fails?**
```sql
-- Entity still exists in database with full metadata
UPDATE ifc_entities SET geometry_status = 'failed' WHERE id = '550e8400-...';

-- Coordinator can STILL:
-- ✅ Query this wall by type, storey, properties
-- ✅ Validate fire rating (EI60) against requirements
-- ✅ Track changes if it's modified in next version
-- ✅ Create BCF issue referencing this GUID
-- ✅ Run collision checks using bounding box (from IFC, not mesh)
-- ✅ Generate reports showing this wall exists

-- What coordinator CANNOT do (until geometry succeeds):
-- ❌ View 3D mesh in viewer (can show bounding box instead)
-- ❌ Perform precise geometry-based clash detection (can use bbox)
```

**This is the core innovation**: Metadata persists even if geometry fails.

---

<a name="layered-architecture"></a>
## 2. Layered Architecture: Parse → Geometry → Validate

### 2.1 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ USER UPLOADS IFC FILE (via API)                                      │
│ POST /api/models/upload/                                             │
└────────────────────┬─────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ DJANGO VIEW: Upload file to Supabase Storage                         │
│ - Creates Model record (status: 'uploading')                         │
│ - Queues Django Q task: process_ifc_task(model_id, file_url)         │
│ - Returns task_id to client                                          │
└────────────────────┬─────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ DJANGO Q TASK: process_ifc_task(model_id, file_url)                  │
│ Orchestrates 3 layers sequentially:                                  │
│   1. parse_ifc_metadata() → Layer 1                                  │
│   2. extract_geometry_*() → Layer 2                                  │
│   3. validate_ifc_model() → Layer 3                                  │
└────────────────────┬─────────────────────────────────────────────────┘
                     │
    ┌────────────────┴───────────────┬──────────────────────┐
    ▼                                ▼                      ▼
┌─────────────────┐      ┌─────────────────────┐   ┌──────────────────┐
│ LAYER 1: PARSE  │ ───▶ │ LAYER 2: GEOMETRY   │──▶│ LAYER 3: VALIDATE│
│ (ALWAYS RUNS)   │      │ (OPTIONAL, CAN FAIL)│   │ (REPORTS ISSUES) │
└────────┬────────┘      └──────────┬──────────┘   └────────┬─────────┘
         │                          │                       │
         ▼                          ▼                       ▼
┌────────────────────────────────────────────────────────────────────┐
│ POSTGRESQL DATABASE (Supabase)                                     │
│                                                                     │
│ Tables Created:                                                     │
│ • Model (parsing_status='parsed')                                  │
│ • IFCEntity (150 elements, geometry_status='pending')              │
│ • PropertySet (450 property records)                               │
│ • SpatialHierarchy (12 spatial levels)                             │
│ • Material, MaterialAssignment                                     │
│ • IFCType, TypeAssignment                                          │
│ • System, SystemMembership                                         │
│ • GraphEdge (relationships)                                        │
│                                                                     │
│ IF geometry succeeds:                                               │
│ • Geometry (148 geometries, 2 failed)                              │
│ • IFCEntity (geometry_status='completed' for 148, 'failed' for 2)  │
│                                                                     │
│ Always created:                                                     │
│ • ProcessingReport (stage_results, errors, duration)               │
│ • IFCValidationReport (schema_valid, issues list)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer 1: Parse (Metadata Extraction)

**Service**: `backend/apps/models/services/parse.py`

**What It Does**:
```python
def parse_ifc_metadata(model_id: UUID, file_path: str) -> dict:
    """
    Extract metadata from IFC file WITHOUT geometry.

    CRITICAL: This function MUST succeed unless file is corrupt.
    Metadata is the foundation for all other operations.

    Returns:
        {
            'status': 'success' | 'failed',
            'elements_parsed': int,
            'duration_seconds': float,
            'errors': list
        }
    """
```

**Steps**:
1. **Open IFC file** (IfcOpenShell)
2. **Extract spatial hierarchy** (Project/Site/Building/Storey)
   - Store in `SpatialHierarchy` table with path arrays
3. **Extract materials** (IfcMaterial, IfcMaterialLayer, etc.)
   - Store in `Material` table
4. **Extract types** (IfcWallType, IfcDoorType, etc.)
   - Store in `IFCType` table
5. **Extract systems** (IfcSystem - HVAC, Electrical, etc.)
   - Store in `System` table
6. **Extract elements** (IfcWall, IfcDoor, IfcWindow, etc.)
   - **BULK INSERT** - 500 elements at a time (100x faster)
   - Store GUID, type, name, description
   - NO geometry extraction (deferred to Layer 2)
7. **Extract properties** (Pset_WallCommon, etc.)
   - Store ALL properties in `PropertySet` table
   - No filtering, no simplification
8. **Extract relationships** (IfcRelContainedInSpatialStructure, etc.)
   - Store in `GraphEdge` table

**Performance**:
- **Before** (monolithic): 2-5 minutes for 150-element model
- **After** (Layer 1 only): 5-15 seconds for same model
- **Improvement**: **10-20x faster**

**Why So Fast?**:
1. **No geometry extraction** (was 80% of time)
2. **Bulk database inserts** (500 elements per transaction)
3. **Parallel property extraction** (all Psets at once)
4. **No validation blocking** (validation is Layer 3)

**What Gets Stored**:
```python
# Example: 150-element model
{
    'spatial_hierarchy': 12,    # Project→Site→Building→8 Storeys
    'materials': 15,
    'types': 25,
    'systems': 3,
    'elements': 150,            # IFCEntity records
    'properties': 450,          # PropertySet records (avg 3 per element)
    'relationships': 185,       # GraphEdge records
    'duration': 8.2             # seconds
}
```

### 2.3 Layer 2: Geometry (3D Mesh Extraction)

**Service**: `backend/apps/models/services/geometry.py`

**What It Does**:
```python
def extract_geometry_bulk(model_id: UUID, file_path: str) -> dict:
    """
    Extract 3D geometry for elements with pending geometry status.

    CRITICAL: This function CAN FAIL per element without losing metadata.
    Each element's geometry_status is tracked independently.

    Returns:
        {
            'status': 'completed' | 'partial' | 'failed',
            'geometries_extracted': int,
            'geometries_failed': int,
            'duration_seconds': float,
            'errors': [{'element_guid': str, 'error': str}, ...]
        }
    """
```

**Steps**:
1. **Query pending elements** from `IFCEntity` where `geometry_status='pending'`
2. **For each element**:
   - Open IFC representation (IfcShapeRepresentation)
   - Generate mesh using IfcOpenShell geometry engine
   - Extract vertices (numpy array of float32)
   - Extract faces (numpy array of uint32)
   - Compute bounding box (min/max x,y,z)
   - **Compress** (gzip numpy arrays → binary)
   - **Store** in `Geometry` table
   - **Update** `IFCEntity.geometry_status = 'completed'`
3. **If element fails**:
   - Log error to `ProcessingReport`
   - Update `IFCEntity.geometry_status = 'failed'`
   - **CONTINUE** to next element (don't abort entire process)
4. **Bulk operations**:
   - Process in batches of 100 elements
   - Bulk insert `Geometry` records
   - Bulk update `IFCEntity` statuses

**Performance**:
- **Sequential**: 30 seconds - 5 minutes (150 elements)
- **Parallel** (future): 4-8x faster with multiprocessing

**Why Can This Fail?**:
1. **No IFC representation** (element is conceptual, not physical)
2. **Invalid geometry** (self-intersecting meshes, degenerate faces)
3. **IfcOpenShell bugs** (edge cases in complex geometry)
4. **Memory limits** (extremely complex geometry OOM)
5. **Timeout** (element takes >30 seconds to process)

**What Gets Stored**:
```sql
-- Geometry table (per element)
CREATE TABLE geometry (
    entity_id UUID PRIMARY KEY, -- Links to IFCEntity

    -- Metrics
    vertex_count INT,           -- Original mesh vertices
    triangle_count INT,         -- Original mesh triangles

    -- Bounding Box (for spatial queries)
    bbox_min_x FLOAT,
    bbox_min_y FLOAT,
    bbox_min_z FLOAT,
    bbox_max_x FLOAT,
    bbox_max_y FLOAT,
    bbox_max_z FLOAT,

    -- Geometry Data (compressed binary)
    vertices_original BYTEA,    -- gzipped numpy array (float32[N,3])
    faces_original BYTEA,       -- gzipped numpy array (uint32[M,3])

    -- Simplified (LOD) - future
    vertices_simplified BYTEA,
    faces_simplified BYTEA,
    simplification_ratio FLOAT,

    -- External storage (for very large geometry)
    geometry_file_path TEXT,    -- S3 URL for mesh file

    -- Timestamps
    extracted_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Key Innovation**: **Geometry is in a SEPARATE table**

This enables:
- ✅ Query elements without loading geometry (fast metadata queries)
- ✅ Retry failed geometry extraction (without re-parsing metadata)
- ✅ Defer geometry extraction (parse first, extract geometry later)
- ✅ Measure storage size separately (metadata vs. geometry)
- ✅ Delete geometry without losing metadata (save storage space)

### 2.4 Layer 3: Validate (Quality Checks)

**Service**: `backend/apps/models/services/validation.py`

**What It Does**:
```python
def validate_ifc_model(model_id: UUID, bep_config_id: UUID = None) -> dict:
    """
    Validate IFC model against BEP requirements and IDS specifications.

    CRITICAL: This function REPORTS issues but NEVER fails processing.
    Validation creates IFCValidationReport with issues list.

    Returns:
        {
            'status': 'pass' | 'warning' | 'fail',
            'total_elements': int,
            'elements_with_issues': int,
            'issues': [{'element_guid': str, 'issue_type': str, 'message': str}, ...],
            'duration_seconds': float
        }
    """
```

**Validation Types**:

1. **Schema Validation** (IFC spec compliance)
   - ✅ IFC schema version (2x3, 4, 4.3)
   - ✅ Required IFC entities present
   - ✅ Attribute types correct
   - ⚠️ Deprecated entities used

2. **GUID Validation**
   - ✅ All elements have GlobalId
   - ✅ GUIDs are 22 characters (Base64 encoded)
   - ✅ GUIDs are unique within file
   - ⚠️ GUID duplicates detected

3. **Spatial Hierarchy Validation**
   - ✅ Project→Site→Building→Storey structure exists
   - ✅ All elements contained in spatial structure
   - ⚠️ Elements not in any storey

4. **Property Validation** (BEP/IDS requirements)
   - ✅ Required properties present
   - ✅ Property values within valid ranges
   - ✅ Property types correct
   - ⚠️ Missing required properties
   - ⚠️ Property values out of range

5. **LOD (Level of Detail) Validation**
   - ✅ Geometry exists where required
   - ✅ Property richness matches LOD target
   - ⚠️ LOD insufficient for phase

6. **BEP Compliance** (if BEP configured)
   - ✅ Naming conventions followed
   - ✅ Required property sets present
   - ✅ MMI maturity level requirements met
   - ⚠️ BEP violations detected

**Performance**: 5-30 seconds (query-based, no geometry processing)

**Output**: `IFCValidationReport` record with:
```json
{
    "overall_status": "warning",
    "schema_valid": true,
    "total_elements": 150,
    "elements_with_issues": 12,

    "schema_errors": [],
    "schema_warnings": [
        "3 elements use deprecated IfcWallStandardCase"
    ],

    "guid_issues": [],

    "geometry_issues": [
        {"element_guid": "2O2Fr$...", "message": "No geometry representation"},
        {"element_guid": "3P3Gs$...", "message": "Bounding box not computable"}
    ],

    "property_issues": [
        {"element_guid": "2O2Fr$...", "pset": "Pset_WallCommon", "property": "FireRating", "message": "Required property missing"},
        ...
    ],

    "lod_issues": [
        {"element_guid": "4Q4Ht$...", "message": "LOD 300 required but LOD 200 detected"}
    ],

    "summary": "12 of 150 elements have validation issues. 8 missing required properties, 2 missing geometry, 3 using deprecated types."
}
```

### 2.5 Status Tracking: Model-Level vs Entity-Level

**Model-Level** (table: `models.Model`):
```sql
-- Three independent status fields (layered architecture)
parsing_status: 'pending' | 'parsing' | 'parsed' | 'failed'
geometry_status: 'pending' | 'extracting' | 'completed' | 'partial' | 'skipped' | 'failed'
validation_status: 'pending' | 'validating' | 'completed' | 'failed'

-- Legacy field (computed for backward compatibility)
status: 'uploading' | 'processing' | 'ready' | 'error'
```

**Status Progression**:
```
UPLOAD:         status='uploading',     parsing_status='pending',    geometry_status='pending',    validation_status='pending'
LAYER 1 START:  status='processing',    parsing_status='parsing',    geometry_status='pending',    validation_status='pending'
LAYER 1 DONE:   status='processing',    parsing_status='parsed',     geometry_status='pending',    validation_status='pending'
LAYER 2 START:  status='processing',    parsing_status='parsed',     geometry_status='extracting', validation_status='pending'
LAYER 2 DONE:   status='processing',    parsing_status='parsed',     geometry_status='completed',  validation_status='pending'
LAYER 3 START:  status='processing',    parsing_status='parsed',     geometry_status='completed',  validation_status='validating'
LAYER 3 DONE:   status='ready',         parsing_status='parsed',     geometry_status='completed',  validation_status='completed'
```

**Entity-Level** (table: `ifc_entities.IFCEntity`):
```sql
-- Per-element geometry status
geometry_status: 'pending' | 'processing' | 'completed' | 'failed' | 'no_representation'
```

**This enables**:
- Track which elements failed geometry extraction
- Retry geometry for specific elements
- Report partial success (148 of 150 elements have geometry)
- Coordinator can filter: "Show me elements with failed geometry"

---

<a name="database-schema"></a>
## 3. Complete Database Schema (15 Tables)

### 3.1 Schema Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ CORE MODELS (Project Management)                                │
├─────────────────────────────────────────────────────────────────┤
│ Project (organization, team, settings)                          │
│   └─ Model (IFC file, status, version)                          │
│       └─ IFCEntity (elements: walls, doors, windows)            │
│           ├─ PropertySet (Psets, properties)                    │
│           ├─ Geometry (3D meshes, bounding boxes) ⟸ LAYER 2    │
│           ├─ MaterialAssignment → Material                      │
│           ├─ TypeAssignment → IFCType                           │
│           └─ SystemMembership → System                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SPATIAL & RELATIONSHIPS (Graph Storage)                         │
├─────────────────────────────────────────────────────────────────┤
│ SpatialHierarchy (Project→Site→Building→Storey)                │
│ GraphEdge (source→target, relationship_type)                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ CHANGE TRACKING & ANALYTICS                                     │
├─────────────────────────────────────────────────────────────────┤
│ ChangeLog (GUID-based version comparison)                       │
│ StorageMetrics (size breakdown by layer)                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ VALIDATION & REPORTING                                          │
├─────────────────────────────────────────────────────────────────┤
│ IFCValidationReport (schema, GUID, property issues)             │
│ ProcessingReport (stage results, errors, performance)           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ BEP SYSTEM (ISO 19650 + POFIN)                                  │
├─────────────────────────────────────────────────────────────────┤
│ BEPConfiguration (project BIM execution plan)                   │
│   ├─ TechnicalRequirement (IFC schema, MVD, units)             │
│   ├─ MMIScaleDefinition (maturity levels 0-2000)               │
│   ├─ NamingConvention (file/element naming rules)              │
│   ├─ RequiredPropertySet (mandatory Psets per type)            │
│   ├─ ValidationRule (quality control checks)                   │
│   └─ SubmissionMilestone (delivery phases)                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ VIEWER SYSTEM (Federated Models)                                │
├─────────────────────────────────────────────────────────────────┤
│ ViewerGroup (federated model container)                         │
│   └─ ViewerModel (model with offset/rotation/color/opacity)    │
└─────────────────────────────────────────────────────────────────┘
```

**Total Tables**: 22 (15 core IFC + 7 BEP + 2 Viewer)

### 3.2 Table Definitions (Full Schema)

#### Core IFC Tables

**1. `models.Model`** (IFC file metadata)
```sql
CREATE TABLE models (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    ifc_schema VARCHAR(50),                -- 'IFC2X3', 'IFC4', 'IFC4X3'
    file_url TEXT,                         -- Supabase Storage URL
    file_size BIGINT DEFAULT 0,

    -- Legacy status (computed from layer statuses)
    status VARCHAR(20) DEFAULT 'uploading',

    -- Layer-specific statuses (Session 012)
    parsing_status VARCHAR(20) DEFAULT 'pending',
    geometry_status VARCHAR(20) DEFAULT 'pending',
    validation_status VARCHAR(20) DEFAULT 'pending',

    -- Versioning
    version_number INT DEFAULT 1,
    parent_model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    is_published BOOLEAN DEFAULT FALSE,

    -- Metadata
    element_count INT DEFAULT 0,
    storey_count INT DEFAULT 0,
    system_count INT DEFAULT 0,
    processing_error TEXT,

    -- Async task tracking
    task_id VARCHAR(255),                  -- Django Q task ID

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_model_version UNIQUE(project_id, name, version_number)
);

CREATE INDEX idx_models_status ON models(status);
CREATE INDEX idx_models_parsing_status ON models(parsing_status);
CREATE INDEX idx_models_geometry_status ON models(geometry_status);
CREATE INDEX idx_models_project ON models(project_id);
```

**2. `ifc_entities.IFCEntity`** (Building elements)
```sql
CREATE TABLE ifc_entities (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

    -- Layer 1: Core IFC Metadata (ALWAYS populated)
    ifc_guid VARCHAR(22) NOT NULL,         -- IFC GlobalId (22-char Base64)
    ifc_type VARCHAR(100) NOT NULL,        -- 'IfcWall', 'IfcDoor', etc.
    name VARCHAR(255),
    description TEXT,
    storey_id UUID,                        -- Reference to spatial hierarchy

    -- Layer 2: Geometry Status (per-element tracking)
    geometry_status VARCHAR(20) DEFAULT 'pending',

    -- DEPRECATED fields (use Geometry table instead)
    has_geometry BOOLEAN DEFAULT FALSE,
    vertex_count INT DEFAULT 0,
    triangle_count INT DEFAULT 0,
    bbox_min_x FLOAT, bbox_min_y FLOAT, bbox_min_z FLOAT,
    bbox_max_x FLOAT, bbox_max_y FLOAT, bbox_max_z FLOAT,

    CONSTRAINT unique_entity_guid UNIQUE(model_id, ifc_guid)
);

CREATE INDEX idx_entities_type ON ifc_entities(ifc_type);
CREATE INDEX idx_entities_guid ON ifc_entities(ifc_guid);
CREATE INDEX idx_entities_storey ON ifc_entities(storey_id);
CREATE INDEX idx_entities_model ON ifc_entities(model_id);
CREATE INDEX idx_entities_geometry_status ON ifc_entities(geometry_status);
```

**3. `property_sets.PropertySet`** (Pset properties)
```sql
CREATE TABLE property_sets (
    id UUID PRIMARY KEY,
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    pset_name VARCHAR(255) NOT NULL,       -- 'Pset_WallCommon'
    property_name VARCHAR(255) NOT NULL,   -- 'FireRating'
    property_value TEXT,                   -- 'EI60'
    property_type VARCHAR(50)              -- 'STRING', 'INTEGER', 'BOOLEAN'
);

CREATE INDEX idx_properties_entity ON property_sets(entity_id);
CREATE INDEX idx_properties_pset ON property_sets(pset_name);
CREATE INDEX idx_properties_name ON property_sets(property_name);

-- Enable fast "find all walls with FireRating=EI60" queries
CREATE INDEX idx_properties_search ON property_sets(pset_name, property_name, property_value);
```

**4. `geometry.Geometry`** (3D meshes - Layer 2)
```sql
CREATE TABLE geometry (
    entity_id UUID PRIMARY KEY REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Metrics
    vertex_count INT DEFAULT 0,
    triangle_count INT DEFAULT 0,

    -- Bounding Box (for spatial queries and clash detection)
    bbox_min_x FLOAT, bbox_min_y FLOAT, bbox_min_z FLOAT,
    bbox_max_x FLOAT, bbox_max_y FLOAT, bbox_max_z FLOAT,

    -- Geometry Data (compressed binary numpy arrays)
    vertices_original BYTEA,               -- gzipped float32[N,3]
    faces_original BYTEA,                  -- gzipped uint32[M,3]

    -- LOD (Level of Detail) - future optimization
    vertices_simplified BYTEA,
    faces_simplified BYTEA,
    simplification_ratio FLOAT,

    -- External Storage (for very large meshes)
    geometry_file_path TEXT,               -- S3 URL if BYTEA too large

    -- Timestamps
    extracted_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Spatial index for bounding box queries (clash detection)
CREATE INDEX idx_geometry_bbox ON geometry USING GIST (
    box(point(bbox_min_x, bbox_min_y), point(bbox_max_x, bbox_max_y))
);
```

**5. `spatial_hierarchy.SpatialHierarchy`** (Project→Site→Building→Storey)
```sql
CREATE TABLE spatial_hierarchy (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES ifc_entities(id) ON DELETE CASCADE,
    hierarchy_level VARCHAR(20) NOT NULL,  -- 'project', 'site', 'building', 'storey'
    path VARCHAR(22)[],                    -- Array of GUIDs: ['proj-guid', 'site-guid', 'bldg-guid', 'storey-guid']

    CONSTRAINT unique_spatial_entity UNIQUE(model_id, entity_id)
);

CREATE INDEX idx_spatial_level ON spatial_hierarchy(hierarchy_level);
CREATE INDEX idx_spatial_parent ON spatial_hierarchy(parent_id);

-- Enable fast "find all elements on storey X" queries
CREATE INDEX idx_spatial_path ON spatial_hierarchy USING GIN(path);
```

**6. `materials.Material`** (IFC materials)
```sql
CREATE TABLE materials (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    material_guid VARCHAR(50) NOT NULL,    -- IFC step ID (materials don't have GlobalId)
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    properties JSONB DEFAULT '{}',         -- Material properties

    CONSTRAINT unique_material UNIQUE(model_id, material_guid)
);

CREATE INDEX idx_materials_name ON materials(name);
```

**7. `material_assignments.MaterialAssignment`** (element→material)
```sql
CREATE TABLE material_assignments (
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    layer_thickness FLOAT,
    layer_order INT DEFAULT 1,

    PRIMARY KEY (entity_id, material_id, layer_order)
);
```

**8. `ifc_types.IFCType`** (Wall types, door types, etc.)
```sql
CREATE TABLE ifc_types (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    type_guid VARCHAR(22) NOT NULL,
    type_name VARCHAR(255),
    ifc_type VARCHAR(100) NOT NULL,        -- 'IfcWallType', 'IfcDoorType'
    properties JSONB DEFAULT '{}',

    CONSTRAINT unique_type UNIQUE(model_id, type_guid)
);
```

**9. `type_assignments.TypeAssignment`** (element→type)
```sql
CREATE TABLE type_assignments (
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    type_id UUID NOT NULL REFERENCES ifc_types(id) ON DELETE CASCADE,

    PRIMARY KEY (entity_id, type_id)
);
```

**10. `systems.System`** (HVAC, electrical, plumbing systems)
```sql
CREATE TABLE systems (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    system_guid VARCHAR(22) NOT NULL,
    system_name VARCHAR(255),
    system_type VARCHAR(100),              -- 'IfcSystem' subclass
    description TEXT,

    CONSTRAINT unique_system UNIQUE(model_id, system_guid)
);
```

**11. `system_memberships.SystemMembership`** (element→system)
```sql
CREATE TABLE system_memberships (
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    PRIMARY KEY (system_id, entity_id)
);
```

#### Graph & Relationships

**12. `graph_edges.GraphEdge`** (Graph storage in PostgreSQL)
```sql
CREATE TABLE graph_edges (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL, -- 'IfcRelContainedInSpatialStructure', 'IfcRelConnectsElements', etc.
    properties JSONB DEFAULT '{}'
);

CREATE INDEX idx_edges_source ON graph_edges(source_entity_id);
CREATE INDEX idx_edges_target ON graph_edges(target_entity_id);
CREATE INDEX idx_edges_type ON graph_edges(relationship_type);

-- Enable graph traversal queries (find neighbors)
CREATE INDEX idx_edges_bidirectional ON graph_edges(source_entity_id, target_entity_id);
```

#### Change Tracking & Analytics

**13. `change_log.ChangeLog`** (GUID-based version comparison)
```sql
CREATE TABLE change_log (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    previous_model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    ifc_guid VARCHAR(22) NOT NULL,
    change_type VARCHAR(20) NOT NULL,      -- 'added', 'removed', 'modified', 'geometry_changed', 'property_changed'
    change_details JSONB DEFAULT '{}',     -- Detailed diff
    detected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_changes_type ON change_log(change_type);
CREATE INDEX idx_changes_guid ON change_log(ifc_guid);
```

**14. `storage_metrics.StorageMetrics`** (Size analysis)
```sql
CREATE TABLE storage_metrics (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    measured_at TIMESTAMP DEFAULT NOW(),

    -- Size breakdown (bytes)
    spatial_structure_bytes BIGINT DEFAULT 0,
    elements_metadata_bytes BIGINT DEFAULT 0,
    properties_bytes BIGINT DEFAULT 0,
    systems_bytes BIGINT DEFAULT 0,
    materials_bytes BIGINT DEFAULT 0,
    relationships_bytes BIGINT DEFAULT 0,
    geometry_original_bytes BIGINT DEFAULT 0,
    geometry_simplified_bytes BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0
);
```

#### Validation & Reporting

**15. `ifc_validation_reports.IFCValidationReport`** (Quality checks)
```sql
CREATE TABLE ifc_validation_reports (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    validated_at TIMESTAMP DEFAULT NOW(),

    -- Overall status
    overall_status VARCHAR(20) DEFAULT 'pass', -- 'pass', 'warning', 'fail'
    schema_valid BOOLEAN DEFAULT TRUE,

    -- Issue counts
    total_elements INT DEFAULT 0,
    elements_with_issues INT DEFAULT 0,

    -- Detailed issues (JSON arrays)
    schema_errors JSONB DEFAULT '[]',
    schema_warnings JSONB DEFAULT '[]',
    guid_issues JSONB DEFAULT '[]',
    geometry_issues JSONB DEFAULT '[]',
    property_issues JSONB DEFAULT '[]',
    lod_issues JSONB DEFAULT '[]',

    summary TEXT
);

CREATE INDEX idx_validation_status ON ifc_validation_reports(overall_status);
CREATE INDEX idx_validation_date ON ifc_validation_reports(validated_at);
```

**16. `processing_reports.ProcessingReport`** (Processing performance)
```sql
CREATE TABLE processing_reports (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

    -- Timestamps
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_seconds FLOAT,

    -- Overall status
    overall_status VARCHAR(20) DEFAULT 'failed', -- 'success', 'partial', 'failed'

    -- File info
    ifc_schema VARCHAR(50),
    file_size_bytes BIGINT DEFAULT 0,

    -- Per-stage results (JSON array)
    -- [{stage: 'elements', status: 'success', processed: 150, failed: 0, duration_ms: 8200}, ...]
    stage_results JSONB DEFAULT '[]',

    -- Overall counts
    total_entities_processed INT DEFAULT 0,
    total_entities_skipped INT DEFAULT 0,
    total_entities_failed INT DEFAULT 0,

    -- Errors (JSON array)
    errors JSONB DEFAULT '[]',

    -- Catastrophic failure tracking
    catastrophic_failure BOOLEAN DEFAULT FALSE,
    failure_stage VARCHAR(50),
    failure_exception TEXT,
    failure_traceback TEXT,

    summary TEXT
);

CREATE INDEX idx_reports_status ON processing_reports(overall_status);
CREATE INDEX idx_reports_date ON processing_reports(started_at);
```

### 3.3 Key Schema Innovations

**1. GUID as Permanent Identifier**
```sql
-- Every element MUST have ifc_guid
CONSTRAINT unique_entity_guid UNIQUE(model_id, ifc_guid)

-- Enables change detection across versions
SELECT
    v1.ifc_guid,
    v1.name AS version1_name,
    v2.name AS version2_name,
    CASE
        WHEN v2.ifc_guid IS NULL THEN 'removed'
        WHEN v1.name <> v2.name THEN 'modified'
        ELSE 'unchanged'
    END AS change_type
FROM ifc_entities v1
FULL OUTER JOIN ifc_entities v2 ON v1.ifc_guid = v2.ifc_guid AND v2.model_id = '<version2-id>'
WHERE v1.model_id = '<version1-id>';
```

**2. Geometry in Separate Table**
```sql
-- OneToOne relationship: IFCEntity ←→ Geometry
-- Entity can exist WITHOUT geometry
-- Geometry can be deleted WITHOUT losing entity

-- Query metadata WITHOUT loading geometry (fast)
SELECT ifc_type, name, storey_id FROM ifc_entities WHERE model_id = '...';

-- Query geometry ONLY when needed (viewer)
SELECT e.ifc_guid, g.vertices_original, g.faces_original
FROM ifc_entities e
JOIN geometry g ON g.entity_id = e.id
WHERE e.model_id = '...' AND e.storey_id = '<storey-id>';
```

**3. JSONB for Flexible Properties**
```sql
-- Store ALL properties without schema changes
CREATE TABLE property_sets (
    pset_name VARCHAR(255),  -- 'Pset_WallCommon'
    property_name VARCHAR(255), -- 'FireRating'
    property_value TEXT      -- 'EI60' (stored as text, cast on read)
);

-- Fast queries with GIN index on JSONB
CREATE INDEX idx_properties_jsonb ON property_sets USING GIN(
    jsonb_build_object(pset_name, jsonb_build_object(property_name, property_value))
);

-- Query: "Find all walls with FireRating = EI60"
SELECT e.* FROM ifc_entities e
JOIN property_sets ps ON ps.entity_id = e.id
WHERE e.ifc_type = 'IfcWall'
  AND ps.pset_name = 'Pset_WallCommon'
  AND ps.property_name = 'FireRating'
  AND ps.property_value = 'EI60';
```

**4. Graph Storage in PostgreSQL**
```sql
-- Store relationships as edges (source → target)
CREATE TABLE graph_edges (
    source_entity_id UUID,
    target_entity_id UUID,
    relationship_type VARCHAR(100)
);

-- Traverse graph: "Find all doors on this wall"
SELECT t.* FROM ifc_entities t
JOIN graph_edges e ON e.target_entity_id = t.id
WHERE e.source_entity_id = '<wall-id>'
  AND e.relationship_type = 'IfcRelVoidsElement';

-- Recursive query: "Find all elements in this building"
WITH RECURSIVE building_tree AS (
    SELECT id, ifc_guid FROM ifc_entities WHERE ifc_guid = '<building-guid>'
    UNION ALL
    SELECT e.id, e.ifc_guid FROM ifc_entities e
    JOIN graph_edges ge ON ge.target_entity_id = e.id
    JOIN building_tree bt ON bt.id = ge.source_entity_id
)
SELECT * FROM building_tree;
```

**5. Status Tracking at Multiple Levels**
```sql
-- Model-level: Overall processing status
UPDATE models SET parsing_status = 'parsed', geometry_status = 'extracting';

-- Entity-level: Per-element geometry status
UPDATE ifc_entities SET geometry_status = 'completed' WHERE id IN (...);
UPDATE ifc_entities SET geometry_status = 'failed' WHERE id IN (...);

-- Report partial success
SELECT
    COUNT(*) AS total_elements,
    SUM(CASE WHEN geometry_status = 'completed' THEN 1 ELSE 0 END) AS geometries_extracted,
    SUM(CASE WHEN geometry_status = 'failed' THEN 1 ELSE 0 END) AS geometries_failed
FROM ifc_entities WHERE model_id = '...';
```

### 3.4 Database Size Estimation

**Example: 1,000-element IFC model**

| Table | Records | Avg Size | Total Size | Notes |
|-------|---------|----------|------------|-------|
| Model | 1 | 1 KB | 1 KB | Minimal |
| IFCEntity | 1,000 | 500 bytes | 500 KB | GUID, type, name, storey |
| PropertySet | 3,000 | 200 bytes | 600 KB | Avg 3 properties per element |
| Geometry | 800 | 50 KB | 40 MB | 80% have geometry (compressed) |
| SpatialHierarchy | 15 | 300 bytes | 5 KB | Project→Site→Building→12 Storeys |
| Material | 50 | 500 bytes | 25 KB | |
| MaterialAssignment | 800 | 100 bytes | 80 KB | |
| IFCType | 100 | 500 bytes | 50 KB | |
| TypeAssignment | 800 | 100 bytes | 80 KB | |
| System | 10 | 500 bytes | 5 KB | |
| SystemMembership | 500 | 100 bytes | 50 KB | |
| GraphEdge | 2,000 | 200 bytes | 400 KB | Relationships |
| **TOTAL METADATA** | | | **~2 MB** | WITHOUT geometry |
| **TOTAL WITH GEOMETRY** | | | **~42 MB** | WITH geometry |

**Key Insight**: Metadata is ~5% of total size. **Geometry is 95%.**

This validates the layered architecture:
- **Layer 1 (metadata)**: 2 MB, extracted in seconds
- **Layer 2 (geometry)**: 40 MB, extracted in minutes
- **Separate storage** enables querying metadata without loading geometry

---

<a name="data-flow"></a>
## 4. Data Flow: Upload to Viewer

### 4.1 End-to-End Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: USER UPLOADS IFC FILE                                                │
│ Frontend: React app (localhost:5173)                                          │
│ Action: FormData with file + project_id + name                               │
└────────────────────────┬─────────────────────────────────────────────────────┘
                         │
                         ▼ HTTP POST /api/models/upload/
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: DJANGO VIEW HANDLER                                                   │
│ File: backend/apps/models/views.py → ModelViewSet.upload()                   │
│                                                                                │
│ Actions:                                                                       │
│ 1. Validate file (size, type, IFC extension)                                 │
│ 2. Upload to Supabase Storage (S3-compatible)                                │
│     → bucket: 'ifc-files'                                                     │
│     → path: 'projects/<project-id>/models/<uuid>.ifc'                        │
│ 3. Create Model record in database                                            │
│     → status = 'uploading'                                                    │
│     → parsing_status = 'pending'                                              │
│     → geometry_status = 'pending'                                             │
│     → validation_status = 'pending'                                           │
│     → file_url = <supabase-storage-url>                                       │
│ 4. Queue Django Q task: process_ifc_task(model.id, file_url)                 │
│ 5. Return JSON response with task_id                                          │
└────────────────────────┬─────────────────────────────────────────────────────┘
                         │
                         ▼ Django Q Task Queue
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: ASYNC PROCESSING (Django Q Worker)                                    │
│ File: backend/apps/models/tasks.py → process_ifc_task()                      │
│                                                                                │
│ Task orchestrates 3 layers:                                                   │
│   Layer 1: parse_ifc_metadata(model_id, file_path)                           │
│   Layer 2: extract_geometry_bulk(model_id, file_path)                        │
│   Layer 3: validate_ifc_model(model_id, bep_id)                              │
└────────────────────────┬─────────────────────────────────────────────────────┘
                         │
       ┌─────────────────┴───────────────┬─────────────────────┐
       ▼                                 ▼                     ▼
┌──────────────────┐          ┌───────────────────┐   ┌────────────────────┐
│ LAYER 1: PARSE   │────────▶ │ LAYER 2: GEOMETRY │──▶│ LAYER 3: VALIDATE  │
│ (5-15 seconds)   │          │ (30s - 5 minutes) │   │ (5-30 seconds)     │
└───────┬──────────┘          └──────────┬────────┘   └───────┬────────────┘
        │                                │                    │
        ▼                                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ POSTGRESQL DATABASE (Supabase)                                              │
│                                                                              │
│ Tables Populated:                                                            │
│ ✓ Model (parsing_status='parsed', geometry_status='completed')              │
│ ✓ IFCEntity (1,000 elements with GUIDs, types, names)                       │
│ ✓ PropertySet (3,000 property records)                                      │
│ ✓ SpatialHierarchy (15 spatial levels)                                      │
│ ✓ Material, MaterialAssignment (50 materials, 800 assignments)              │
│ ✓ IFCType, TypeAssignment (100 types, 800 assignments)                      │
│ ✓ System, SystemMembership (10 systems, 500 memberships)                    │
│ ✓ GraphEdge (2,000 relationship edges)                                      │
│ ✓ Geometry (800 geometries: vertices, faces, bboxes)                        │
│ ✓ ProcessingReport (stage results, errors, performance)                     │
│ ✓ IFCValidationReport (issues, warnings, summary)                           │
└────────────────────────────────────────────────────────────────────────────┬┘
                                                                               │
                                                                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: FRONTEND POLLS FOR STATUS                                             │
│ Endpoint: GET /api/models/<id>/status/                                       │
│                                                                                │
│ Response:                                                                      │
│ {                                                                              │
│   "id": "<uuid>",                                                             │
│   "status": "ready",                                                          │
│   "parsing_status": "parsed",                                                 │
│   "geometry_status": "completed",                                             │
│   "validation_status": "completed",                                           │
│   "element_count": 1000,                                                      │
│   "task_state": "SUCCESS",                                                    │
│   "progress": 100                                                             │
│ }                                                                              │
└────────────────────────┬─────────────────────────────────────────────────────┘
                         │
                         ▼ status === "ready"
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: COORDINATOR USES MODEL                                                │
└──────────────────────────────────────────────────────────────────────────────┘

        ┌─────────────────┬──────────────────┬──────────────────┐
        ▼                 ▼                  ▼                  ▼
┌──────────────┐  ┌─────────────┐  ┌────────────────┐  ┌──────────────────┐
│ QUERY        │  │ VALIDATE    │  │ DETECT CHANGES │  │ VIEW IN 3D       │
│ ELEMENTS     │  │ PROPERTIES  │  │ (VERSION DIFF) │  │ (FEDERATED)      │
└──────┬───────┘  └──────┬──────┘  └────────┬───────┘  └─────┬────────────┘
       │                 │                  │                 │
       ▼                 ▼                  ▼                 ▼
GET /api/models/   GET /api/bep/    GET /api/models/   GET /api/geometry/
  <id>/entities/     validate/        <id>/changes/      <entity-ids>/mesh/
  ?ifc_type=IfcWall  ?model_id=...    ?prev_version=...
  &storey=Level2
```

### 4.2 API Endpoints (RESTful)

**Upload**:
```bash
POST /api/models/upload/
Content-Type: multipart/form-data

{
  "file": <binary>,
  "project_id": "uuid",
  "name": "Architecture Model v1"
}

→ Response:
{
  "model": {
    "id": "uuid",
    "name": "Architecture Model v1",
    "status": "uploading",
    "parsing_status": "pending",
    "geometry_status": "pending",
    "validation_status": "pending"
  },
  "task_id": "django-q-task-id",
  "message": "Processing started. Poll /api/models/<id>/status/ for progress."
}
```

**Status Polling**:
```bash
GET /api/models/<id>/status/

→ Response (processing):
{
  "id": "uuid",
  "status": "processing",
  "parsing_status": "parsed",          # ✓ Layer 1 complete
  "geometry_status": "extracting",     # ⏳ Layer 2 in progress
  "validation_status": "pending",      # ⏸ Layer 3 not started
  "progress": 65,                      # Estimated %
  "task_state": "STARTED",
  "task_info": {
    "current_stage": "geometry",
    "processed": 650,
    "total": 1000
  }
}

→ Response (complete):
{
  "id": "uuid",
  "status": "ready",
  "parsing_status": "parsed",
  "geometry_status": "completed",
  "validation_status": "completed",
  "progress": 100,
  "task_state": "SUCCESS",
  "element_count": 1000,
  "storey_count": 12,
  "system_count": 8
}
```

**Query Elements** (Layer 1 data - fast):
```bash
GET /api/models/<id>/entities/
  ?ifc_type=IfcWall
  &storey=<storey-uuid>
  &page=1
  &page_size=100

→ Response:
{
  "count": 245,
  "next": "/api/models/<id>/entities/?page=2",
  "previous": null,
  "results": [
    {
      "id": "uuid",
      "ifc_guid": "2O2Fr$t4X7Zf8NOew3FL9r",
      "ifc_type": "IfcWall",
      "name": "Exterior Wall",
      "storey_id": "storey-uuid",
      "geometry_status": "completed",
      "properties": [
        {"pset": "Pset_WallCommon", "name": "FireRating", "value": "EI60"},
        {"pset": "Pset_WallCommon", "name": "LoadBearing", "value": "TRUE"}
      ]
    },
    ...
  ]
}
```

**Get Geometry** (Layer 2 data - lazy load):
```bash
GET /api/geometry/<entity-id>/mesh/

→ Response (binary):
{
  "entity_id": "uuid",
  "vertex_count": 245,
  "triangle_count": 490,
  "bbox": {
    "min": [0.0, 0.0, 0.0],
    "max": [5.0, 0.2, 3.0]
  },
  "vertices": <base64-encoded-compressed-numpy>,  # Float32[245, 3]
  "faces": <base64-encoded-compressed-numpy>      # Uint32[490, 3]
}
```

**Validate Model** (Layer 3 - run on demand):
```bash
POST /api/bep/validate/
{
  "model_id": "uuid",
  "bep_config_id": "uuid"  # Optional
}

→ Response:
{
  "report_id": "uuid",
  "overall_status": "warning",
  "total_elements": 1000,
  "elements_with_issues": 45,
  "issues": [
    {
      "element_guid": "2O2Fr$...",
      "issue_type": "missing_property",
      "pset": "Pset_WallCommon",
      "property": "FireRating",
      "message": "Required property 'FireRating' is missing"
    },
    ...
  ]
}
```

**Change Detection** (GUID comparison):
```bash
GET /api/models/<id>/changes/
  ?previous_version=<prev-model-id>

→ Response:
{
  "added": 15,        # New GUIDs in current version
  "removed": 8,       # GUIDs missing in current version
  "modified": 32,     # GUIDs with changed properties
  "geometry_changed": 12,  # GUIDs with changed geometry
  "unchanged": 945,
  "changes": [
    {
      "ifc_guid": "2O2Fr$...",
      "change_type": "modified",
      "change_details": {
        "property_changes": [
          {"pset": "Pset_WallCommon", "property": "FireRating", "old": "EI30", "new": "EI60"}
        ]
      }
    },
    ...
  ]
}
```

---

<a name="graph-storage"></a>
## 5. Graph Storage in PostgreSQL

### 5.1 Why PostgreSQL (Not Neo4j)?

**Decision**: Store graph as **edges in PostgreSQL** (not dedicated graph database)

**Rationale**:
1. **Most queries are simple filters**, not deep graph traversal
   - "Find all walls on Level 2" → Spatial hierarchy (not graph)
   - "Show me IfcWall elements" → Type filter (not graph)
   - "Which elements have FireRating=EI60?" → Property query (not graph)
2. **Graph queries are rare**:
   - "Find all doors hosted by this wall" → 1-hop neighbor query
   - "Find all elements in this building" → 2-3 hop recursive query
3. **PostgreSQL handles this well**:
   - Recursive CTEs for graph traversal
   - GIN indexes for path arrays
   - JSONB for flexible properties
4. **Can migrate to Neo4j later** if profiling shows need:
   - Export `GraphEdge` table to Neo4j
   - Keep PostgreSQL as primary data store
   - Neo4j as read replica for complex queries

### 5.2 Graph Storage Schema

**Core Table: `graph_edges`**
```sql
CREATE TABLE graph_edges (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL,
    source_entity_id UUID NOT NULL REFERENCES ifc_entities(id),
    target_entity_id UUID NOT NULL REFERENCES ifc_entities(id),
    relationship_type VARCHAR(100) NOT NULL,
    properties JSONB DEFAULT '{}'
);

CREATE INDEX idx_edges_source ON graph_edges(source_entity_id);
CREATE INDEX idx_edges_target ON graph_edges(target_entity_id);
CREATE INDEX idx_edges_type ON graph_edges(relationship_type);
CREATE INDEX idx_edges_bidirectional ON graph_edges(source_entity_id, target_entity_id);
```

**IFC Relationship Types** (examples):
```
IfcRelContainedInSpatialStructure  → Storey contains walls/doors
IfcRelFillsElement                → Door fills opening in wall
IfcRelVoidsElement                → Opening voids wall
IfcRelConnectsElements            → Beam connects to column
IfcRelAssignsToGroup              → Element belongs to group/system
IfcRelDefinesByType               → Element instance of type
IfcRelAssociatesMaterial          → Element uses material
IfcRelAggregates                  → Element composed of parts
```

### 5.3 Graph Query Patterns

**Pattern 1: Find neighbors (1-hop)**
```sql
-- "Find all doors in this wall"
SELECT t.*
FROM ifc_entities t
JOIN graph_edges e ON e.target_entity_id = t.id
WHERE e.source_entity_id = '<wall-uuid>'
  AND e.relationship_type = 'IfcRelFillsElement'
  AND t.ifc_type = 'IfcDoor';

-- Performance: < 10ms (indexed on source_entity_id + target_entity_id)
```

**Pattern 2: Traverse hierarchy (2-3 hops)**
```sql
-- "Find all elements in this building"
WITH RECURSIVE building_contents AS (
    -- Start with building entity
    SELECT id, ifc_guid, name, ifc_type, 0 AS depth
    FROM ifc_entities
    WHERE ifc_guid = '<building-guid>'

    UNION ALL

    -- Recursively find contained elements
    SELECT e.id, e.ifc_guid, e.name, e.ifc_type, bc.depth + 1
    FROM ifc_entities e
    JOIN graph_edges ge ON ge.target_entity_id = e.id
    JOIN building_contents bc ON bc.id = ge.source_entity_id
    WHERE ge.relationship_type = 'IfcRelContainedInSpatialStructure'
      AND bc.depth < 5  -- Limit recursion depth
)
SELECT * FROM building_contents WHERE depth > 0;

-- Performance: < 100ms for typical building (500-1000 elements)
```

**Pattern 3: Find all instances of a type**
```sql
-- "Find all walls that use 'Exterior Wall Type 01'"
SELECT e.*
FROM ifc_entities e
JOIN graph_edges ge ON ge.target_entity_id = e.id
JOIN ifc_types t ON t.id = ge.source_entity_id::UUID
WHERE t.type_name = 'Exterior Wall Type 01'
  AND ge.relationship_type = 'IfcRelDefinesByType';

-- Performance: < 20ms (indexed on relationship_type)
```

**Pattern 4: System membership**
```sql
-- "Find all pipes in the 'Supply Air' system"
SELECT e.*
FROM ifc_entities e
JOIN system_memberships sm ON sm.entity_id = e.id
JOIN systems s ON s.id = sm.system_id
WHERE s.system_name = 'Supply Air'
  AND e.ifc_type = 'IfcPipeSegment';

-- Performance: < 15ms (indexed join)
```

### 5.4 When to Use Neo4j?

**Benchmark Threshold**: If PostgreSQL graph queries exceed **500ms consistently**, consider Neo4j

**Scenarios where Neo4j wins**:
1. **Deep traversal** (5+ hops): "Find all connected elements in MEP network"
2. **Complex pattern matching**: "Find all walls connected to columns that support beams"
3. **Graph algorithms**: PageRank, shortest path, community detection
4. **Real-time graph queries**: < 50ms response time required

**Migration Strategy**:
1. **Phase 1** (current): PostgreSQL only
2. **Phase 2** (if needed): PostgreSQL (primary) + Neo4j (read replica for graph queries)
3. **Sync**: Replicate `graph_edges` to Neo4j on model update
4. **Query routing**: Simple queries → PostgreSQL, complex graph → Neo4j

---

<a name="query-patterns"></a>
## 6. Query Patterns for Coordinator Workflows

### 6.1 Coordinator Daily Queries

**Query 1: "Show me all walls on Level 2"**
```sql
-- Uses: Spatial hierarchy (not graph traversal)
SELECT e.*
FROM ifc_entities e
JOIN spatial_hierarchy sh ON sh.entity_id = e.id
WHERE e.model_id = '<model-id>'
  AND e.ifc_type = 'IfcWall'
  AND sh.hierarchy_level = 'storey'
  AND sh.path @> ARRAY['<level-2-guid>'];  -- GIN index on path array

-- Performance: < 20ms (indexed)
```

**Query 2: "Find all doors with missing fire ratings"**
```sql
-- Uses: Property queries + LEFT JOIN (find missing)
SELECT e.ifc_guid, e.name
FROM ifc_entities e
LEFT JOIN property_sets ps ON ps.entity_id = e.id
    AND ps.pset_name = 'Pset_DoorCommon'
    AND ps.property_name = 'FireRating'
WHERE e.model_id = '<model-id>'
  AND e.ifc_type = 'IfcDoor'
  AND ps.id IS NULL;  -- Missing property

-- Performance: < 50ms (indexed on pset_name + property_name)
```

**Query 3: "What changed between Version 1 and Version 2?"**
```sql
-- Uses: GUID comparison (FULL OUTER JOIN)
SELECT
    COALESCE(v1.ifc_guid, v2.ifc_guid) AS ifc_guid,
    CASE
        WHEN v1.ifc_guid IS NULL THEN 'added'
        WHEN v2.ifc_guid IS NULL THEN 'removed'
        WHEN v1.name <> v2.name OR v1.ifc_type <> v2.ifc_type THEN 'modified'
        ELSE 'unchanged'
    END AS change_type,
    v1.name AS v1_name,
    v2.name AS v2_name
FROM ifc_entities v1
FULL OUTER JOIN ifc_entities v2 ON v1.ifc_guid = v2.ifc_guid AND v2.model_id = '<v2-id>'
WHERE v1.model_id = '<v1-id>'
  AND (v1.ifc_guid IS NULL OR v2.ifc_guid IS NULL OR v1.name <> v2.name);

-- Performance: < 200ms (indexed on ifc_guid)
-- Result: Cached in ChangeLog table for faster subsequent queries
```

**Query 4: "Show me all MEP elements in clash zone (bounding box)"**
```sql
-- Uses: Spatial index on geometry bounding boxes
SELECT e.ifc_guid, e.ifc_type, e.name
FROM ifc_entities e
JOIN geometry g ON g.entity_id = e.id
WHERE e.model_id = '<model-id>'
  AND e.ifc_type IN ('IfcPipeSegment', 'IfcDuctSegment', 'IfcCableSegment')
  AND box(point(g.bbox_min_x, g.bbox_min_y), point(g.bbox_max_x, g.bbox_max_y))
      && box(point(<clash_x_min>, <clash_y_min>), point(<clash_x_max>, <clash_y_max>));

-- Performance: < 100ms (GIST index on bounding box)
```

**Query 5: "Find all structural elements by system"**
```sql
-- Uses: System membership join
SELECT e.ifc_guid, e.ifc_type, e.name, s.system_name
FROM ifc_entities e
JOIN system_memberships sm ON sm.entity_id = e.id
JOIN systems s ON s.id = sm.system_id
WHERE e.model_id = '<model-id>'
  AND s.system_type LIKE '%Structural%';

-- Performance: < 30ms (indexed joins)
```

### 6.2 Query Performance Targets

| Query Type | Target Latency | Actual (Indexed) | Notes |
|------------|---------------|------------------|-------|
| Simple filter (type, storey) | < 50ms | 10-20ms | Very fast (primary use case) |
| Property search | < 100ms | 30-50ms | GIN index on JSONB |
| GUID comparison (changes) | < 500ms | 150-200ms | Full table scan (cached in ChangeLog) |
| Spatial queries (bbox) | < 200ms | 80-100ms | GIST index on geometry |
| Graph traversal (1-2 hops) | < 100ms | 20-50ms | Indexed edges |
| Graph traversal (3+ hops) | < 500ms | 200-300ms | Recursive CTE (rare) |
| Validation report | < 5s | 2-3s | Bulk checks, parallel queries |

**Key Insight**: 90% of coordinator queries are **simple filters** (type, storey, property), not complex graph traversal. PostgreSQL handles these excellently.

---

<a name="performance"></a>
## 7. Performance Characteristics

### 7.1 Processing Performance (Layered Architecture)

**Before** (Monolithic):
```
┌──────────────────────────────────────────────────────┐
│ MONOLITHIC PROCESSING (Everything at once)           │
│ Duration: 2-5 minutes                                │
│                                                       │
│ • Open IFC file                      5s              │
│ • Extract spatial hierarchy          10s             │
│ • Extract elements WITH geometry     180s (3min)     │
│ • Extract properties                 30s             │
│ • Extract relationships              15s             │
│ • Validate                           20s             │
│                                                       │
│ TOTAL: 260 seconds (4.3 minutes)                     │
│                                                       │
│ ❌ If geometry fails → entire process rolls back     │
│ ❌ Metadata lost                                      │
└──────────────────────────────────────────────────────┘
```

**After** (Layered):
```
┌──────────────────────────────────────────────────────┐
│ LAYER 1: PARSE METADATA (NO geometry)                │
│ Duration: 8-15 seconds                                │
│                                                       │
│ • Open IFC file                      2s              │
│ • Extract spatial hierarchy          2s              │
│ • Extract elements (metadata only)   3s (BULK)       │
│ • Extract properties                 2s (BULK)       │
│ • Extract relationships              1s              │
│                                                       │
│ TOTAL LAYER 1: 10 seconds                            │
│                                                       │
│ ✅ Metadata persists in database                     │
│ ✅ Coordinators can query immediately                │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│ LAYER 2: EXTRACT GEOMETRY (OPTIONAL)                 │
│ Duration: 30 seconds - 5 minutes                     │
│                                                       │
│ • For each element:                                  │
│   - Generate mesh (IfcOpenShell)                     │
│   - Compress vertices/faces                          │
│   - Compute bounding box                             │
│   - Store in Geometry table                          │
│                                                       │
│ TOTAL LAYER 2: 45 seconds (typical)                  │
│                                                       │
│ ⚠️ If element fails → mark as 'failed', continue     │
│ ✅ Metadata already persisted                        │
│ ✅ Can retry failed elements later                   │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│ LAYER 3: VALIDATE (REPORTS, DOESN'T FAIL)            │
│ Duration: 5-30 seconds                                │
│                                                       │
│ • Schema validation                  2s              │
│ • GUID validation                    1s              │
│ • Property validation                3s              │
│ • LOD validation                     2s              │
│ • Generate report                    2s              │
│                                                       │
│ TOTAL LAYER 3: 10 seconds                            │
│                                                       │
│ ✅ Reports issues, doesn't block                     │
│ ✅ Coordinator can review validation                 │
└──────────────────────────────────────────────────────┘

TOTAL TIME: 10s (Layer 1) + 45s (Layer 2) + 10s (Layer 3) = 65 seconds
VS. MONOLITHIC: 260 seconds

IMPROVEMENT: 4x faster (and metadata available in 10s!)
```

### 7.2 Query Performance (Database)

**Fast Queries** (< 50ms):
- Filter by type: `WHERE ifc_type = 'IfcWall'`
- Filter by storey: `WHERE storey_id = '<uuid>'`
- Filter by system: `JOIN system_memberships`
- Count elements: `SELECT COUNT(*) FROM ifc_entities`

**Medium Queries** (50-200ms):
- Property search: `JOIN property_sets WHERE pset_name=... AND property_name=...`
- Spatial queries: `WHERE bbox && <clash-box>` (GIST index)
- 1-hop graph: `JOIN graph_edges WHERE source_entity_id=...`

**Slow Queries** (200-500ms):
- GUID comparison (full table scan - but cached in ChangeLog)
- 3+ hop graph traversal (recursive CTE)
- Complex aggregations (multiple JOINs with GROUP BY)

**Optimization Strategies**:
1. **Indexes** (already implemented):
   - B-tree on ifc_type, ifc_guid, storey_id
   - GIN on spatial_hierarchy.path (array containment)
   - GIST on geometry bounding boxes
   - Composite index on (pset_name, property_name, property_value)
2. **Materialized Views** (future):
   - Pre-compute common queries (e.g., "elements by storey")
   - Refresh on model update
3. **Redis Cache** (Phase 2):
   - Cache validation reports (rarely change)
   - Cache change detection results (expensive GUID comparison)
   - Cache element counts by type/storey
4. **Connection Pooling** (done):
   - Supabase connection pooler (port 6543)
   - PgBouncer for transaction pooling

### 7.3 Viewer Performance (Geometry Loading)

**Lazy Loading Strategy**:
```
┌──────────────────────────────────────────────────────┐
│ VIEWER LOADS FEDERATED MODEL                         │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│ STEP 1: Load Metadata (fast)                         │
│ GET /api/models/<id>/entities/?visible=true          │
│                                                       │
│ Response: 1,000 elements (metadata only)             │
│ Size: ~500 KB JSON                                   │
│ Time: < 100ms                                        │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│ STEP 2: Load Bounding Boxes (for initial view)       │
│ GET /api/geometry/bboxes/?entity_ids=<comma-sep>     │
│                                                       │
│ Response: 1,000 bounding boxes (min/max x,y,z)       │
│ Size: ~50 KB JSON                                    │
│ Time: < 50ms                                         │
│                                                       │
│ VIEWER: Render bounding boxes as placeholder         │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│ STEP 3: Load Visible Geometry (lazy)                 │
│ GET /api/geometry/meshes/?entity_ids=<visible-only>  │
│                                                       │
│ Strategy: Load only elements in camera frustum       │
│ Batch: 100 elements at a time                        │
│ Response: Compressed meshes (gzipped numpy)          │
│ Size: ~5 MB per batch (100 elements)                 │
│ Time: ~500ms per batch                               │
│                                                       │
│ VIEWER: Replace bboxes with meshes as they load      │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│ STEP 4: Progressive Enhancement                      │
│ • Camera moves → load more geometry                  │
│ • Zoom in → increase LOD (future)                    │
│ • Hide storey → unload geometry (free memory)        │
│ • Filter by type → reload visible geometry           │
└──────────────────────────────────────────────────────┘
```

**Performance Targets** (from Consultant 4):
- **Initial display**: < 3 seconds (bounding boxes)
- **Time to interactive**: < 1 second (camera controls work)
- **Geometry streaming**: 100-200 elements/second
- **Frame rate**: 30+ FPS mobile, 60+ FPS desktop
- **Memory**: < 500MB mobile, < 2GB desktop
- **Capacity**: 100K+ objects federated (with LOD)

---

<a name="scalability"></a>
## 8. Why This Architecture Scales

### 8.1 Scalability Analysis

**Vertical Scaling** (Single Server):
```
Database (PostgreSQL):
• Max connections: 100 (Supabase default)
• Query cache: 1 GB (shared_buffers)
• Work memory: 4 MB per query
• Max parallel workers: 4

Handles:
• 50 concurrent users (2 connections each)
• 1,000 models in database
• 1M+ IFC entities total
• 10 GB geometry storage

Bottleneck: Database connections (exhausted at 50 concurrent users)
```

**Horizontal Scaling** (Multiple Servers):
```
Phase 1 (0-50 users):
┌─────────────────┐
│ Django Server   │ ← Single server, no load balancer needed
│ + Django Q      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PostgreSQL      │ ← Supabase managed database
│ (Supabase)      │
└─────────────────┘

Phase 2 (50-500 users):
┌─────────────────┐
│ Load Balancer   │ ← NGINX or AWS ALB
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│Django 1│ │Django 2│ ← Horizontal scaling (API servers)
└───┬────┘ └───┬────┘
    │          │
    │   ┌──────┴─────┐
    │   │            │
    ▼   ▼            ▼
┌─────────┐    ┌──────────┐
│PgBouncer│    │Django Q  │ ← Separate async workers
│(Pooler) │    │Workers×4 │
└────┬────┘    └────┬─────┘
     │              │
     ▼              ▼
┌─────────────────────┐
│ PostgreSQL (Primary)│ ← Supabase managed (connection pooler: port 6543)
└─────────────────────┘

Phase 3 (500+ users):
┌─────────────────┐
│ CDN (Geometry)  │ ← CloudFront or Cloudflare (cache meshes)
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Load Balancer   │
└────────┬────────┘
         │
    ┌────┴────┬────────┬─────────┐
    ▼         ▼        ▼         ▼
┌────────┐┌────────┐┌────────┐┌─────────┐
│Django 1││Django 2││Django 3││Django Q │ ← Auto-scaling group
└───┬────┘└───┬────┘└───┬────┘└───┬─────┘
    │         │         │         │
    │    ┌────┴─────┬───┴─────┐   │
    │    │          │         │   │
    ▼    ▼          ▼         ▼   ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │Redis Cache│  │S3 Storage│ ← Separate caching + storage layers
│(Primary+ │  │(Query    │  │(Geometry)│
│ Replicas)│  │ results) │  │          │
└──────────┘  └──────────┘  └──────────┘
```

### 8.2 Scaling Strategies by Component

**Django API Servers** (Stateless - Easy to Scale):
- ✅ Horizontal scaling: Add more servers behind load balancer
- ✅ Auto-scaling: AWS ECS / GCP Cloud Run / Kubernetes
- ✅ No session state: JWT tokens (stateless authentication)
- Target: 10-20 requests/second per server

**Django Q Workers** (Async Processing - Scale Independently):
- ✅ Separate worker pool from API servers
- ✅ Scale workers based on queue depth (not API traffic)
- ✅ Long-running tasks (IFC processing) don't block API
- Target: 4-8 workers (process 10-20 IFC files simultaneously)

**PostgreSQL** (Vertical Scaling + Read Replicas):
- Phase 1: Single instance (Supabase default)
- Phase 2: Connection pooler (PgBouncer - port 6543)
- Phase 3: Read replicas (query distribution)
- Phase 4: Sharding (if >10M entities - unlikely)

**Redis Cache** (Optional - Phase 2):
- Cache validation reports (rarely change)
- Cache element counts (expensive aggregations)
- Cache BCF issue lists (frequently accessed)
- Target: 50-90% cache hit rate

**S3 Storage** (Supabase Storage):
- ✅ Already scalable (S3-compatible)
- IFC files: Original files (1 GB max)
- Geometry files: Large meshes (>10 MB)
- CDN: CloudFront for geometry delivery

### 8.3 Performance at Scale

**Database Size Projections**:
| Models | Entities | Properties | Geometry | Total DB Size | Query Latency |
|--------|----------|------------|----------|---------------|---------------|
| 100 | 100K | 300K | 80K | 4 GB | < 50ms |
| 1,000 | 1M | 3M | 800K | 40 GB | < 100ms |
| 10,000 | 10M | 30M | 8M | 400 GB | < 500ms |

**Bottleneck**: **Geometry storage** (95% of total size)

**Solution**: Store geometry in S3 (not PostgreSQL) for large datasets
```sql
-- Instead of storing BYTEA in PostgreSQL:
geometry_file_path TEXT → 's3://bucket/geometries/<entity-id>.mesh.gz'

-- Viewer fetches directly from S3 (CDN cached)
```

### 8.4 Concurrent User Capacity

**Assumptions**:
- Average API request: 50ms processing + 50ms database query = 100ms total
- Each user: 10 requests per minute (clicking through UI)
- Django server: 4 workers (Gunicorn) × 25 requests/second = 100 req/s per server

**Capacity**:
| Servers | Database Connections | Users | Requests/s |
|---------|---------------------|-------|------------|
| 1 | 10 | 50 | 100 |
| 3 | 30 | 150 | 300 |
| 10 | 100 | 500 | 1,000 |

**Bottleneck**: **Database connections** (Supabase default: 100)

**Solution**: Connection pooler (PgBouncer) - port 6543
- Transaction pooling: 100 physical connections → 1,000+ virtual connections
- Enables 500+ concurrent users on single database instance

---

<a name="competitive-technical"></a>
## 9. Comparison to Competitors (Technical Architecture)

### 9.1 Architectural Comparison

| Aspect | Solibri | Navisworks | Dalux | ACC/Procore | **Our Platform** |
|--------|---------|------------|-------|-------------|------------------|
| **IFC Storage** | Desktop file | Desktop file | Proprietary DB | Proprietary DB | **PostgreSQL (IFC as Layer 1)** |
| **GUID Tracking** | ✅ Yes | ⚠️ Sometimes | ❌ No | ❌ No | **✅ Required (primary key)** |
| **Metadata Persistence** | Desktop only | Desktop only | Partial | Partial | **✅ Full (survives geometry failure)** |
| **Geometry Storage** | Desktop file | Desktop file | Cloud blob | Cloud blob | **PostgreSQL + S3 (layered)** |
| **Property Storage** | Desktop file | Desktop file | Simplified | Simplified | **JSONB (ALL properties preserved)** |
| **Relationship Storage** | Desktop file | Desktop file | ❌ Lost | ❌ Lost | **Graph edges (PostgreSQL)** |
| **Change Detection** | ⚠️ Manual | ⚠️ Manual | ❌ No | ❌ No | **✅ Automated (GUID comparison)** |
| **Layered Processing** | ❌ Monolithic | ❌ Monolithic | Unknown | Unknown | **✅ Parse→Geometry→Validate** |
| **Geometry Retry** | ❌ No | ❌ No | Unknown | Unknown | **✅ Yes (per-element status)** |
| **Query Performance** | Desktop (fast) | Desktop (fast) | Cloud (varies) | Cloud (slow) | **Cloud (50-200ms indexed)** |
| **Scalability** | Desktop only | Desktop only | Proprietary | Proprietary | **Horizontal (load balanced)** |

### 9.2 Key Innovations (Our Advantages)

**1. IFC as Layer 1** (vs. Proprietary Formats)
```
Competitors: IFC → Convert → Proprietary Format → Query
Us:          IFC → Parse → PostgreSQL (IFC preserved) → Query

Advantage:
- ✅ Standards-compliant (buildingSMART)
- ✅ No data loss (all properties preserved)
- ✅ GUID permanence (change tracking works)
- ✅ Can export back to IFC (round-trip)
```

**2. Layered Architecture** (vs. Monolithic)
```
Competitors: Parse + Geometry + Validate (all or nothing)
Us:          Layer 1 (metadata) → Layer 2 (geometry) → Layer 3 (validate)

Advantage:
- ✅ Metadata available in seconds (not minutes)
- ✅ Geometry failures don't lose metadata
- ✅ Can retry geometry without re-parsing
- ✅ Optional geometry (defer/skip)
```

**3. Graph Storage in PostgreSQL** (vs. Lost Relationships)
```
Competitors: Relationships lost or simplified
Us:          GraphEdge table (source→target, relationship_type)

Advantage:
- ✅ Can query "doors in wall" (IfcRelFillsElement)
- ✅ Can query "elements in building" (IfcRelContainedInSpatialStructure)
- ✅ Can traverse system networks (IfcRelAssignsToGroup)
- ✅ Can migrate to Neo4j if needed
```

**4. GUID-Based Change Detection** (vs. Manual Comparison)
```
Competitors: Manual diff, no automation
Us:          FULL OUTER JOIN on ifc_guid → ChangeLog table

Advantage:
- ✅ Automated change detection
- ✅ Track added/removed/modified elements
- ✅ Property-level diffs
- ✅ Geometry change detection
```

**5. Cloud-Native + Open Standards** (vs. Desktop-Only)
```
Competitors: Desktop software (Solibri, Navisworks) or proprietary cloud (Dalux, ACC)
Us:          Cloud-native (Supabase) + Open standards (IFC, BCF, IDS)

Advantage:
- ✅ Real-time collaboration
- ✅ Cross-platform (web, mobile)
- ✅ Universal coordination (BCF works with everyone)
- ✅ No vendor lock-in (IFC preserved, can export)
```

---

<a name="optimizations"></a>
## 10. Future Optimizations (Phase 2-3)

### 10.1 Performance Optimizations

**1. Parallel Geometry Extraction** (Phase 2)
```python
# Current: Sequential processing
for entity in entities:
    extract_geometry(entity)  # 0.3s per element

# Future: Multiprocessing
from multiprocessing import Pool
with Pool(processes=8) as pool:
    pool.map(extract_geometry, entities)

# Improvement: 8x speedup (0.3s × 1000 elements / 8 workers = 37.5s vs 300s)
```

**2. LOD (Level of Detail) Meshes** (Phase 2)
```python
# Generate 3 quality levels:
# - LOD 0: Bounding box only (6 vertices, 12 triangles)
# - LOD 1: Simplified mesh (67% vertex reduction)
# - LOD 2: Original mesh (full detail)

# Viewer switches LOD based on distance from camera
if distance > 50m:
    use_lod = 0  # Bbox
elif distance > 10m:
    use_lod = 1  # Simplified
else:
    use_lod = 2  # Full detail

# Result: 60-90% less geometry loaded, 2-3x higher frame rates
```

**3. Mesh Instancing** (Phase 2)
```python
# Detect repeated geometry (doors, windows, columns)
# Store geometry ONCE, reference many times

# Example: 100 identical windows
# Before: 100 × 500 vertices = 50,000 vertices
# After:  1 × 500 vertices + 100 transforms = 500 vertices + 100 matrices

# Improvement: 96%+ reduction for repeated geometry
```

**4. Compression** (Phase 2-3)
```python
# Content-based compression (40% reduction)
# - Quantize vertices (float32 → int16)
# - Strip unused attributes
# - Deduplicate vertices

# Spatial partitioning compression (70% reduction)
# - Octree-based spatial indexing
# - Load only visible spatial cells
# - Unload far cells

# Combined: ~85% reduction (40% × 70% remaining = 88% total reduction)
```

**5. web-ifc Integration** (Phase 3)
```javascript
// Current: Server-side parsing (IfcOpenShell)
POST /api/models/upload/ → Server parses → Database

// Future: Client-side parsing (web-ifc in browser)
<input type="file" onChange={parseIFC}>
  ↓
web-ifc.OpenModel(file) → Parse in browser → POST metadata to server

// Advantage:
// - 80-100 MB/s parsing (vs 45 MB/s IfcOpenShell)
// - No server load for parsing
// - Instant preview before upload
```

### 10.2 Feature Optimizations

**6. Redis Caching** (Phase 2)
```python
# Cache expensive queries
@cache_result(ttl=3600)  # 1 hour
def get_validation_report(model_id):
    return ValidationReport.objects.get(model_id=model_id)

# Cache element counts (frequently accessed)
@cache_result(ttl=300)  # 5 minutes
def get_element_counts_by_type(model_id):
    return IFCEntity.objects.filter(model_id=model_id).values('ifc_type').annotate(count=Count('id'))

# Cache BCF issue lists (hot path)
@cache_result(ttl=60)  # 1 minute
def get_open_bcf_issues(project_id):
    return BCFIssue.objects.filter(project_id=project_id, status='open')

# Target: 50-90% cache hit rate → 2-10x faster responses
```

**7. Materialized Views** (Phase 2)
```sql
-- Pre-compute common queries
CREATE MATERIALIZED VIEW elements_by_storey AS
SELECT
    s.hierarchy_level,
    s.path[array_length(s.path, 1)] AS storey_guid,
    e.ifc_type,
    COUNT(*) AS element_count
FROM ifc_entities e
JOIN spatial_hierarchy s ON s.entity_id = e.id
WHERE s.hierarchy_level = 'storey'
GROUP BY s.hierarchy_level, storey_guid, e.ifc_type;

-- Refresh on model update
REFRESH MATERIALIZED VIEW CONCURRENTLY elements_by_storey;

-- Query (instant)
SELECT * FROM elements_by_storey WHERE storey_guid = '<guid>';
```

**8. Neo4j Read Replica** (Phase 3 - if needed)
```python
# PostgreSQL: Primary data store (CRUD operations)
# Neo4j: Read replica for complex graph queries

# Sync on model update:
def sync_to_neo4j(model_id):
    edges = GraphEdge.objects.filter(model_id=model_id)
    for edge in edges:
        neo4j.query(
            "MERGE (a:Element {guid: $source_guid}) "
            "MERGE (b:Element {guid: $target_guid}) "
            "MERGE (a)-[:$rel_type]->(b)",
            source_guid=edge.source_entity.ifc_guid,
            target_guid=edge.target_entity.ifc_guid,
            rel_type=edge.relationship_type
        )

# Query routing:
if query_type == 'simple_filter':
    return postgres.query(...)  # Fast (indexed)
elif query_type == 'deep_graph_traversal':
    return neo4j.query(...)     # Fast (graph optimized)
```

### 10.3 Optimization Priority

**Phase 2** (6-12 months):
1. ✅ Parallel geometry extraction (4-8x speedup) - **HIGH IMPACT**
2. ✅ LOD mesh generation (2-3x frame rate) - **HIGH IMPACT**
3. ✅ Redis caching (2-10x query speed) - **MEDIUM IMPACT**
4. ⚠️ Materialized views (optional) - **LOW IMPACT** (most queries already fast)

**Phase 3** (12+ months):
5. ✅ Compression (40% + 70% = ~85%) - **HIGH IMPACT** (storage costs)
6. ✅ Mesh instancing (96% reduction for repeated geometry) - **HIGH IMPACT**
7. ✅ web-ifc integration (80-100 MB/s client-side) - **MEDIUM IMPACT**
8. ⚠️ Neo4j read replica (optional) - **LOW IMPACT** (PostgreSQL handles graph queries well)

**Decision Criteria**: Only implement optimizations if profiling shows **bottleneck > 500ms consistently**.

---

## Conclusion

The "IFC as Layer 1" architecture provides:

1. **Rock-Solid Foundation**: Metadata ALWAYS persists, even if geometry fails
2. **10-100x Faster Parsing**: Bulk inserts, no geometry blocking
3. **Change Tracking**: GUID permanence enables version comparison
4. **Query Performance**: 90% of queries < 50ms (indexed)
5. **Scalability**: Horizontal scaling to 500+ concurrent users
6. **Standards Compliance**: IFC/BCF/IDS (buildingSMART)
7. **Competitive Advantage**: Only platform with true "IFC as database" approach

**This is the technical foundation** that enables ALL coordinator workflows.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-25
**Authors**: Technical Team + Consultant Research (4 experts)
**Status**: ✅ Complete - Ready for PRD Integration
