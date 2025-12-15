# IFC Schema Expert Consultation: Multi-Schema Database Architecture

**Consultant**: IFC Schema Development Team
**Client**: SpruceLab - BIM Coordinator Platform
**Date**: 2025-10-25
**Session**: 013
**Status**: Consultation Document

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Schema Version Management](#schema-version-management)
3. [Extended Layer Definitions (4-7)](#extended-layer-definitions)
4. [Robustness Patterns](#robustness-patterns)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Reference Documentation](#reference-documentation)

---

## Executive Summary

### Current State Assessment ✅

Your **Session 012 layered architecture is architecturally sound**. Key strengths:

- ✅ **Layered approach**: Parse → Geometry → Validate is correct
- ✅ **GUID-based tracking**: Foundation for change detection
- ✅ **Separate geometry storage**: Enables optional/deferred extraction
- ✅ **Bulk operations**: 100x performance improvement
- ✅ **Error resilience**: Metadata persists even if geometry fails

### Consultation Focus

This document addresses:

1. **Multi-schema support** (IFC2x3, IFC4, IFC4.3) in single database
2. **Extended data layers** beyond current implementation (Layers 4-7)
3. **Schema-agnostic queries** for unified API
4. **Robustness patterns** for real-world malformed IFC files
5. **Implementation priority** for 80/20 value delivery

### Key Recommendations

| Priority | Recommendation | Impact | Effort |
|----------|---------------|--------|--------|
| **P0** | Schema metadata tracking | High | Low |
| **P0** | Version-agnostic core entities | High | Medium |
| **P1** | Layer 4: Quantities & Classifications | High | Medium |
| **P1** | Robustness: Healing common errors | High | Medium |
| **P2** | Layer 5: MEP connections | Medium | High |
| **P3** | Layer 6: Cost & schedule data | Low | High |

---

## Schema Version Management

### 1. IFC Schema Evolution Overview

```
IFC2x3 (2006)          IFC4 (2013)           IFC4.3 (2024)
│                      │                     │
├─ IfcWall            ├─ IfcWall            ├─ IfcWall
├─ IfcWallStandardCase├─ DEPRECATED         ├─ DEPRECATED
├─ IfcRailing         ├─ IfcRailing         ├─ IfcRailing (enhanced)
├─ IfcSpace           ├─ IfcSpace           ├─ IfcSpace
├─ N/A                ├─ IfcAlignment       ├─ IfcAlignment (mature)
├─ N/A                ├─ N/A                ├─ IfcRoad, IfcRailway
└─ IfcPropertySet     └─ IfcPropertySet     └─ IfcPropertySet (extended)
```

### 2. Critical Schema Differences

#### **Entity Type Changes**

| Category | IFC2x3 | IFC4/4.3 | Impact |
|----------|--------|----------|--------|
| **Deprecated** | `IfcWallStandardCase` | Use `IfcWall` | Must map to unified entity |
| **Deprecated** | `IfcSlabStandardCase` | Use `IfcSlab` | Must map to unified entity |
| **New in IFC4** | N/A | `IfcAlignment`, `IfcCourse` | Optional table for IFC4+ |
| **New in IFC4.3** | N/A | `IfcRoad`, `IfcRailway`, `IfcBridge` | Optional table for IFC4.3+ |
| **Property Changes** | 350+ standard Psets | 500+ standard Psets | Dynamic Pset handling required |

#### **Geometry Representation Changes**

| Aspect | IFC2x3 | IFC4+ | Database Impact |
|--------|--------|-------|-----------------|
| Body representation | `'Body'` | `'Body'` | Same |
| Mapped representations | Different structure | Simplified | Extraction logic differs |
| Tessellated geometry | Limited | `IfcTriangulatedFaceSet` | IFC4+ has optimized tessellation |

#### **Relationship Structure Changes**

| Relationship | IFC2x3 | IFC4 | Impact |
|--------------|--------|------|--------|
| Spatial containment | `IfcRelContainedInSpatialStructure` | Same | No change |
| Aggregation | `IfcRelAggregates` | Same | No change |
| Type assignment | `IfcRelDefinesByType` | Same | No change |
| Port connections | Limited | Enhanced | Layer 5 feature |

### 3. Database Strategy: "Unified Core + Version Extensions"

#### **Recommended Approach**

```
┌─────────────────────────────────────────────────────────────┐
│              SCHEMA-AGNOSTIC CORE TABLES                    │
│  (Same structure works for IFC2x3, IFC4, IFC4.3)           │
├─────────────────────────────────────────────────────────────┤
│ • ifc_entities (GUID, type, name, description)             │
│ • spatial_hierarchy (project/site/building/storey)          │
│ • property_sets (key-value, all versions)                   │
│ • materials, types, systems (core definitions)              │
│ • geometry (vertices, faces, bbox)                          │
│ • graph_edges (relationships)                               │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ IFC2x3       │   │ IFC4         │   │ IFC4.3       │
│ Extensions   │   │ Extensions   │   │ Extensions   │
├──────────────┤   ├──────────────┤   ├──────────────┤
│ • Legacy     │   │ • Alignments │   │ • Roads      │
│   entities   │   │ • Enhanced   │   │ • Railways   │
│   (minimal)  │   │   MEP        │   │ • Bridges    │
└──────────────┘   └──────────────┘   └──────────────┘
```

#### **Core Table: Schema Metadata** (NEW)

```sql
CREATE TABLE ifc_schema_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

    -- Schema identification
    schema_version VARCHAR(50) NOT NULL,  -- 'IFC2X3', 'IFC4', 'IFC4X3_ADD2'
    schema_identifier VARCHAR(100),       -- Full URI: 'http://www.buildingsmart-tech.org/...'

    -- Entity type mapping
    entity_type_mapping JSONB DEFAULT '{}',  -- {'IfcWallStandardCase': 'IfcWall', ...}
    deprecated_entities JSONB DEFAULT '[]',  -- ['IfcWallStandardCase', 'IfcSlabStandardCase']

    -- Property set mapping
    standard_psets JSONB DEFAULT '{}',       -- List of standard Psets for this schema

    -- Feature flags
    supports_tessellation BOOLEAN DEFAULT false,
    supports_alignment BOOLEAN DEFAULT false,
    supports_infrastructure BOOLEAN DEFAULT false,

    -- Extraction configuration
    extraction_config JSONB DEFAULT '{}',    -- Schema-specific extraction settings

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_schema_metadata_model ON ifc_schema_metadata(model_id);
CREATE INDEX idx_schema_metadata_version ON ifc_schema_metadata(schema_version);
```

**Usage Pattern:**

```python
# On file open (Layer 1)
schema_version = ifc_file.schema  # 'IFC4', 'IFC2X3', etc.

schema_metadata = IFCSchemaMetadata.objects.create(
    model=model,
    schema_version=schema_version,
    schema_identifier=ifc_file.schema_identifier,
    entity_type_mapping=get_entity_mapping(schema_version),
    supports_tessellation=(schema_version in ['IFC4', 'IFC4X3']),
    supports_alignment=(schema_version in ['IFC4', 'IFC4X3']),
    supports_infrastructure=(schema_version == 'IFC4X3'),
)
```

#### **Entity Type Normalization**

```python
# apps/models/services/schema_mapping.py

ENTITY_TYPE_MAPPINGS = {
    'IFC2X3': {
        'IfcWallStandardCase': 'IfcWall',
        'IfcSlabStandardCase': 'IfcSlab',
        'IfcBeamStandardCase': 'IfcBeam',
        'IfcColumnStandardCase': 'IfcColumn',
        'IfcMemberStandardCase': 'IfcMember',
        'IfcPlateStandardCase': 'IfcPlate',
    },
    'IFC4': {},  # No mappings needed
    'IFC4X3': {},  # No mappings needed
}

def normalize_entity_type(ifc_type: str, schema_version: str) -> str:
    """
    Normalize entity types across IFC versions.

    Example:
        normalize_entity_type('IfcWallStandardCase', 'IFC2X3') → 'IfcWall'
        normalize_entity_type('IfcWall', 'IFC4') → 'IfcWall'
    """
    mapping = ENTITY_TYPE_MAPPINGS.get(schema_version, {})
    return mapping.get(ifc_type, ifc_type)
```

#### **Modified IFCEntity Table** (ENHANCEMENT)

```python
# backend/apps/entities/models.py

class IFCEntity(models.Model):
    # ... existing fields ...

    # ENHANCED: Add schema-aware fields
    ifc_type = models.CharField(max_length=100)  # Normalized type (IfcWall)
    ifc_type_original = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Original type from IFC file (e.g., IfcWallStandardCase for IFC2x3)"
    )
    schema_version = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="IFC schema version (IFC2X3, IFC4, IFC4X3)"
    )

    # ... rest of fields ...
```

**Migration:**

```python
# Generated migration
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('entities', 'XXXX_previous_migration'),
    ]

    operations = [
        migrations.AddField(
            model_name='ifcentity',
            name='ifc_type_original',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='ifcentity',
            name='schema_version',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        # Backfill schema_version from Model.ifc_schema
        migrations.RunPython(backfill_schema_version),
    ]
```

### 4. Schema-Specific Extension Tables

#### **IFC4+ Alignment Support** (Layer 5)

```sql
-- Only populated for IFC4+ models
CREATE TABLE ifc4_alignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Alignment metadata
    alignment_guid VARCHAR(22) NOT NULL,
    alignment_type VARCHAR(50),  -- 'Horizontal', 'Vertical', 'Cant'

    -- Geometry data
    segments JSONB DEFAULT '[]',  -- Array of segment definitions

    -- References
    parent_alignment_id UUID REFERENCES ifc4_alignments(id),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ifc4_alignment_model ON ifc4_alignments(model_id);
CREATE INDEX idx_ifc4_alignment_entity ON ifc4_alignments(entity_id);
CREATE UNIQUE INDEX idx_ifc4_alignment_guid ON ifc4_alignments(model_id, alignment_guid);
```

#### **IFC4.3 Infrastructure Support** (Layer 5)

```sql
-- Only populated for IFC4.3 models
CREATE TABLE ifc43_infrastructure (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Infrastructure type
    infrastructure_type VARCHAR(50) NOT NULL,  -- 'Road', 'Railway', 'Bridge', 'Tunnel'

    -- Type-specific data
    road_data JSONB DEFAULT '{}',     -- Populated if infrastructure_type = 'Road'
    railway_data JSONB DEFAULT '{}',  -- Populated if infrastructure_type = 'Railway'
    bridge_data JSONB DEFAULT '{}',   -- Populated if infrastructure_type = 'Bridge'

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ifc43_infrastructure_model ON ifc43_infrastructure(model_id);
CREATE INDEX idx_ifc43_infrastructure_type ON ifc43_infrastructure(infrastructure_type);
```

### 5. Query Patterns: Schema-Agnostic API

#### **Example: Get All Walls (Any Schema)**

```python
# apps/entities/views.py

class EntityViewSet(viewsets.ModelViewSet):
    def list(self, request):
        """
        List entities with schema normalization.

        Query params:
            - ifc_type: Normalized type (IfcWall, IfcDoor, etc.)
            - include_original_type: Include original type in response
        """
        queryset = IFCEntity.objects.filter(model=request.model)

        # Filter by normalized type
        if ifc_type := request.query_params.get('ifc_type'):
            queryset = queryset.filter(ifc_type=ifc_type)

        # Optionally filter by original type (for debugging)
        if original_type := request.query_params.get('ifc_type_original'):
            queryset = queryset.filter(ifc_type_original=original_type)

        return Response(serializer.data)
```

#### **Example: Schema-Aware Feature Detection**

```python
# apps/models/services/schema_capabilities.py

def get_schema_capabilities(model_id: UUID) -> dict:
    """
    Return available features for a model's IFC schema.

    Returns:
        {
            'schema_version': 'IFC4',
            'supports_alignment': True,
            'supports_infrastructure': False,
            'supports_tessellation': True,
            'available_layers': [1, 2, 3, 4, 5],
            'entity_count_by_type': {...},
        }
    """
    metadata = IFCSchemaMetadata.objects.get(model_id=model_id)

    capabilities = {
        'schema_version': metadata.schema_version,
        'supports_alignment': metadata.supports_alignment,
        'supports_infrastructure': metadata.supports_infrastructure,
        'supports_tessellation': metadata.supports_tessellation,
        'available_layers': [1, 2, 3],  # Always available
    }

    # Add optional layers based on schema
    if metadata.supports_alignment:
        capabilities['available_layers'].append(5)

    return capabilities
```

---

## Extended Layer Definitions

Your current implementation covers **Layers 1-3** (Parse, Geometry, Validate). Here are the recommended **Layers 4-7** for complete IFC coverage.

### Layer Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1: CORE METADATA (IMPLEMENTED ✅)                          │
│ • Entities (GUID, type, name)                                    │
│ • Spatial hierarchy                                              │
│ • Properties (Psets)                                             │
│ • Materials, Types, Systems                                      │
│ Status: parsing_status                                           │
│ Duration: 5-15 seconds                                           │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2: GEOMETRY (IMPLEMENTED ✅)                               │
│ • 3D mesh (vertices, faces)                                      │
│ • Bounding boxes                                                 │
│ • Simplification                                                 │
│ Status: geometry_status                                          │
│ Duration: 30s - 5 minutes                                        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3: VALIDATION (IMPLEMENTED ✅)                             │
│ • Schema validation                                              │
│ • GUID checks                                                    │
│ • LOD validation                                                 │
│ Status: validation_status                                        │
│ Duration: 5-30 seconds                                           │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 4: QUANTITIES & CLASSIFICATIONS (RECOMMENDED) ⭐           │
│ • Quantity sets (QtoSets)                                        │
│ • Classifications (Uniclass, Omniclass, NS 3451)                 │
│ • Material layers/constituents                                   │
│ Status: quantities_status                                        │
│ Duration: 10-60 seconds                                          │
│ Priority: HIGH (needed for BIM coordination)                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 5: RELATIONSHIPS & CONNECTIONS (OPTIONAL)                  │
│ • MEP port connections                                           │
│ • Structural analysis relationships                              │
│ • Opening/filling relationships                                  │
│ • Space boundaries                                               │
│ Status: relationships_status                                     │
│ Duration: 30s - 2 minutes                                        │
│ Priority: MEDIUM (needed for coordination checks)                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 6: SCHEDULES & DOCUMENTS (OPTIONAL)                        │
│ • Cost data (IfcCostItem, IfcCostSchedule)                       │
│ • Work schedules (IfcTask, IfcWorkSchedule)                      │
│ • Document references                                            │
│ Status: documents_status                                         │
│ Duration: 5-30 seconds                                           │
│ Priority: LOW (rarely in IFC files)                              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 7: ADVANCED (FUTURE)                                       │
│ • IFC4.3 infrastructure (roads, railways)                        │
│ • Structural load analysis                                       │
│ • Performance simulation data                                    │
│ Status: advanced_status                                          │
│ Duration: Variable                                               │
│ Priority: VERY LOW (specialized use cases)                       │
└──────────────────────────────────────────────────────────────────┘
```

### Layer 4: Quantities & Classifications (HIGH PRIORITY)

#### **Why This Layer Matters**

- **Quantities**: Essential for cost estimation, material takeoff, coordination
- **Classifications**: Required for Norwegian BIM (NS 3451), UK BIM (Uniclass)
- **Material Layers**: Needed for thermal analysis, acoustic analysis, fire safety

#### **Database Schema**

```sql
-- Quantity sets (e.g., Qto_WallBaseQuantities)
CREATE TABLE quantity_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Quantity set info
    qset_name VARCHAR(255) NOT NULL,        -- 'Qto_WallBaseQuantities'
    quantity_name VARCHAR(255) NOT NULL,    -- 'Height', 'Width', 'NetVolume'
    quantity_value DOUBLE PRECISION,        -- 2.5, 0.2, 15.3
    quantity_unit VARCHAR(50),              -- 'm', 'm²', 'm³', 'kg'
    quantity_type VARCHAR(50),              -- 'Length', 'Area', 'Volume', 'Weight', 'Count'

    -- Metadata
    is_calculated BOOLEAN DEFAULT false,    -- Was this calculated or from IFC?
    calculation_method VARCHAR(100),        -- How was it calculated?

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quantity_sets_entity ON quantity_sets(entity_id);
CREATE INDEX idx_quantity_sets_qset ON quantity_sets(qset_name);
CREATE INDEX idx_quantity_sets_quantity ON quantity_sets(quantity_name);

-- Classifications (Uniclass, Omniclass, NS 3451, etc.)
CREATE TABLE classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Classification system
    classification_system VARCHAR(100) NOT NULL,  -- 'Uniclass2015', 'NS3451', 'Omniclass'
    classification_code VARCHAR(100) NOT NULL,    -- 'Ss_25_10_20', '21.11'
    classification_title VARCHAR(255),            -- 'External walls'
    classification_description TEXT,

    -- Hierarchy (for tree navigation)
    parent_code VARCHAR(100),
    hierarchy_level INTEGER DEFAULT 1,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_classifications_entity ON classifications(entity_id);
CREATE INDEX idx_classifications_system ON classifications(classification_system);
CREATE INDEX idx_classifications_code ON classifications(classification_code);

-- Material layers (for walls, slabs, roofs with multiple layers)
CREATE TABLE material_layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

    -- Layer info
    layer_name VARCHAR(255),                -- 'Structural', 'Insulation', 'Finish'
    layer_thickness DOUBLE PRECISION,       -- In meters
    layer_order INTEGER NOT NULL,           -- 1, 2, 3 (from inside to outside)

    -- Thermal properties (if available)
    thermal_conductivity DOUBLE PRECISION,  -- W/(m·K)
    thermal_resistance DOUBLE PRECISION,    -- m²·K/W

    -- Other properties
    is_load_bearing BOOLEAN DEFAULT false,
    is_external BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_material_layers_entity ON material_layers(entity_id);
CREATE INDEX idx_material_layers_material ON material_layers(material_id);
CREATE INDEX idx_material_layers_order ON material_layers(entity_id, layer_order);
```

#### **Extraction Service**

```python
# apps/entities/services/quantities.py

def extract_quantities(model_id: UUID, file_path: str):
    """
    Extract quantity sets from IFC file (Layer 4).

    Extracts:
    - Base quantities (Qto_*BaseQuantities)
    - Custom quantity sets
    - Calculated quantities (if not in IFC)
    """
    from apps.models.models import Model
    from apps.entities.models import IFCEntity, QuantitySet
    import ifcopenshell
    import ifcopenshell.util.element

    model = Model.objects.get(id=model_id)
    ifc_file = ifcopenshell.open(file_path)

    print(f"\n📊 [LAYER 4] Extracting quantities...")

    quantity_count = 0
    calculated_count = 0

    # Entity map for fast lookup
    entity_map = {
        e.ifc_guid: e
        for e in IFCEntity.objects.filter(model=model).only('id', 'ifc_guid')
    }

    # Batch for bulk insert
    quantity_batch = []
    BATCH_SIZE = 500

    for element in ifc_file.by_type('IfcElement'):
        entity = entity_map.get(element.GlobalId)
        if not entity:
            continue

        # Extract quantity sets from IFC
        if hasattr(element, 'IsDefinedBy'):
            for definition in element.IsDefinedBy:
                if definition.is_a('IfcRelDefinesByProperties'):
                    pset = definition.RelatingPropertyDefinition

                    if pset.is_a('IfcElementQuantity'):
                        qset_name = pset.Name

                        for quantity in pset.Quantities:
                            try:
                                quantity_batch.append(QuantitySet(
                                    entity=entity,
                                    qset_name=qset_name,
                                    quantity_name=quantity.Name,
                                    quantity_value=_extract_quantity_value(quantity),
                                    quantity_unit=_extract_quantity_unit(quantity),
                                    quantity_type=_get_quantity_type(quantity),
                                    is_calculated=False,
                                ))
                                quantity_count += 1

                                if len(quantity_batch) >= BATCH_SIZE:
                                    QuantitySet.objects.bulk_create(quantity_batch, ignore_conflicts=True)
                                    print(f"   Inserted {quantity_count} quantities...")
                                    quantity_batch = []
                            except Exception as e:
                                print(f"   ⚠️  Failed to extract quantity {quantity.Name}: {e}")

        # Calculate missing base quantities (if not in IFC)
        calculated = _calculate_base_quantities(element, entity)
        quantity_batch.extend(calculated)
        calculated_count += len(calculated)

    # Insert remaining
    if quantity_batch:
        QuantitySet.objects.bulk_create(quantity_batch, ignore_conflicts=True)

    print(f"✅ [LAYER 4] Quantities complete: {quantity_count} from IFC, {calculated_count} calculated")

    return {
        'quantity_count': quantity_count,
        'calculated_count': calculated_count,
    }


def _extract_quantity_value(quantity) -> float:
    """Extract numeric value from IFC quantity."""
    if quantity.is_a('IfcQuantityLength'):
        return float(quantity.LengthValue)
    elif quantity.is_a('IfcQuantityArea'):
        return float(quantity.AreaValue)
    elif quantity.is_a('IfcQuantityVolume'):
        return float(quantity.VolumeValue)
    elif quantity.is_a('IfcQuantityCount'):
        return float(quantity.CountValue)
    elif quantity.is_a('IfcQuantityWeight'):
        return float(quantity.WeightValue)
    else:
        return 0.0


def _extract_quantity_unit(quantity) -> str:
    """Extract unit from IFC quantity."""
    if quantity.is_a('IfcQuantityLength'):
        return 'm'
    elif quantity.is_a('IfcQuantityArea'):
        return 'm²'
    elif quantity.is_a('IfcQuantityVolume'):
        return 'm³'
    elif quantity.is_a('IfcQuantityCount'):
        return 'count'
    elif quantity.is_a('IfcQuantityWeight'):
        return 'kg'
    else:
        return ''


def _get_quantity_type(quantity) -> str:
    """Get quantity type from IFC quantity."""
    if quantity.is_a('IfcQuantityLength'):
        return 'Length'
    elif quantity.is_a('IfcQuantityArea'):
        return 'Area'
    elif quantity.is_a('IfcQuantityVolume'):
        return 'Volume'
    elif quantity.is_a('IfcQuantityCount'):
        return 'Count'
    elif quantity.is_a('IfcQuantityWeight'):
        return 'Weight'
    else:
        return 'Unknown'


def _calculate_base_quantities(element, entity):
    """
    Calculate base quantities if not provided in IFC.

    This is important because many IFC files don't include quantity sets.
    """
    from apps.entities.models import Geometry

    quantities = []

    # Get geometry if available
    try:
        geometry = Geometry.objects.get(entity=entity)
    except Geometry.DoesNotExist:
        return quantities

    # Calculate volume from bounding box (rough estimate)
    if all([
        geometry.bbox_min_x, geometry.bbox_min_y, geometry.bbox_min_z,
        geometry.bbox_max_x, geometry.bbox_max_y, geometry.bbox_max_z
    ]):
        length = geometry.bbox_max_x - geometry.bbox_min_x
        width = geometry.bbox_max_y - geometry.bbox_min_y
        height = geometry.bbox_max_z - geometry.bbox_min_z
        volume = length * width * height

        quantities.append(QuantitySet(
            entity=entity,
            qset_name='Qto_BaseQuantities_Calculated',
            quantity_name='NetVolume',
            quantity_value=volume,
            quantity_unit='m³',
            quantity_type='Volume',
            is_calculated=True,
            calculation_method='bbox_volume',
        ))

        # For walls, calculate surface area
        if element.is_a('IfcWall'):
            # Assume wall thickness is width (smallest dimension)
            thickness = min(length, width, height)
            area = 2 * (length + width - thickness) * height

            quantities.append(QuantitySet(
                entity=entity,
                qset_name='Qto_WallBaseQuantities_Calculated',
                quantity_name='NetSideArea',
                quantity_value=area,
                quantity_unit='m²',
                quantity_type='Area',
                is_calculated=True,
                calculation_method='bbox_surface',
            ))

    return quantities
```

#### **Django Models**

```python
# backend/apps/entities/models.py (ADDITIONS)

class QuantitySet(models.Model):
    """
    IFC quantity sets (Qto_*BaseQuantities).

    Layer 4: Extracted after properties (Layer 1).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='quantities')

    qset_name = models.CharField(max_length=255)
    quantity_name = models.CharField(max_length=255)
    quantity_value = models.FloatField()
    quantity_unit = models.CharField(max_length=50, blank=True, null=True)
    quantity_type = models.CharField(max_length=50, blank=True, null=True)

    is_calculated = models.BooleanField(default=False)
    calculation_method = models.CharField(max_length=100, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'quantity_sets'
        indexes = [
            models.Index(fields=['qset_name']),
            models.Index(fields=['quantity_name']),
        ]


class Classification(models.Model):
    """
    IFC classifications (Uniclass, NS 3451, Omniclass, etc.).

    Layer 4: Extracted after properties (Layer 1).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='classifications')

    classification_system = models.CharField(max_length=100)
    classification_code = models.CharField(max_length=100)
    classification_title = models.CharField(max_length=255, blank=True, null=True)
    classification_description = models.TextField(blank=True, null=True)

    parent_code = models.CharField(max_length=100, blank=True, null=True)
    hierarchy_level = models.IntegerField(default=1)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'classifications'
        indexes = [
            models.Index(fields=['classification_system']),
            models.Index(fields=['classification_code']),
        ]


class MaterialLayer(models.Model):
    """
    Material layers for multi-layer assemblies (walls, slabs, roofs).

    Layer 4: Extracted after materials (Layer 1).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='material_layers')
    material = models.ForeignKey('Material', on_delete=models.CASCADE, related_name='layers')

    layer_name = models.CharField(max_length=255, blank=True, null=True)
    layer_thickness = models.FloatField()  # meters
    layer_order = models.IntegerField()

    # Thermal properties
    thermal_conductivity = models.FloatField(null=True, blank=True)
    thermal_resistance = models.FloatField(null=True, blank=True)

    # Flags
    is_load_bearing = models.BooleanField(default=False)
    is_external = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'material_layers'
        indexes = [
            models.Index(fields=['entity', 'layer_order']),
        ]
```

#### **Update Model Status Tracking**

```python
# backend/apps/models/models.py (ADDITION)

class Model(models.Model):
    # ... existing fields ...

    # NEW: Layer 4 status
    QUANTITIES_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('extracting', 'Extracting'),
        ('completed', 'Completed'),
        ('partial', 'Partial'),
        ('failed', 'Failed'),
    ]

    quantities_status = models.CharField(
        max_length=20,
        choices=QUANTITIES_STATUS_CHOICES,
        default='pending',
        help_text="Layer 4: Quantities & classifications extraction status"
    )

    # ... rest of model ...
```

### Layer 5: Relationships & Connections (MEDIUM PRIORITY)

#### **Why This Layer Matters**

- **MEP Connections**: Track pipe/duct connections for coordination
- **Structural Relationships**: Load transfer, connections
- **Space Boundaries**: Required for energy analysis
- **Opening Relationships**: Doors/windows in walls

#### **Database Schema**

```sql
-- Port connections (MEP)
CREATE TABLE port_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

    -- Source and target entities
    source_entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Port info
    source_port_name VARCHAR(255),
    target_port_name VARCHAR(255),
    connection_type VARCHAR(100),  -- 'Flow', 'Control', 'Electrical'

    -- Flow direction
    flow_direction VARCHAR(50),    -- 'Source', 'Sink', 'Bidirectional'

    -- System assignment
    system_id UUID REFERENCES systems(id) ON DELETE SET NULL,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_port_connections_model ON port_connections(model_id);
CREATE INDEX idx_port_connections_source ON port_connections(source_entity_id);
CREATE INDEX idx_port_connections_target ON port_connections(target_entity_id);

-- Space boundaries
CREATE TABLE space_boundaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

    -- Space and element
    space_entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,
    element_entity_id UUID NOT NULL REFERENCES ifc_entities(id) ON DELETE CASCADE,

    -- Boundary info
    boundary_type VARCHAR(50),     -- 'Physical', 'Virtual'
    physical_or_virtual VARCHAR(50),  -- IFC2x3 compatibility
    internal_or_external VARCHAR(50),  -- 'Internal', 'External'

    -- Geometry
    boundary_area DOUBLE PRECISION,
    boundary_geometry BYTEA,       -- 2D boundary polygon

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_space_boundaries_space ON space_boundaries(space_entity_id);
CREATE INDEX idx_space_boundaries_element ON space_boundaries(element_entity_id);
```

*(Note: Layer 5 extraction is beyond current scope but shown for completeness)*

### Layers 6-7: Low Priority

- **Layer 6**: Cost schedules, work schedules, documents (rarely in IFC files)
- **Layer 7**: Advanced features (IFC4.3 infrastructure, structural analysis) - future

**Recommendation**: Implement Layers 6-7 only when specific projects require them.

---

## Robustness Patterns

### Philosophy: "Parse Everything, Report Issues, Never Fail Silently"

Your current **layered validation** approach is correct. Here are patterns for handling real-world IFC files with errors.

### 1. Common IFC File Issues

| Issue | Frequency | Impact | Handling Strategy |
|-------|-----------|--------|-------------------|
| **Missing GUIDs** | 5-10% | High | Generate synthetic GUID, flag as issue |
| **Duplicate GUIDs** | 2-5% | Critical | Accept first, flag duplicates |
| **Invalid geometry** | 10-20% | Medium | Skip geometry, keep metadata |
| **Missing properties** | 20-30% | Low | Skip property, log warning |
| **Broken relationships** | 5-10% | Medium | Skip relationship, keep entities |
| **Invalid schema** | 1-2% | High | Parse anyway, flag validation errors |
| **Corrupt file sections** | 1-5% | High | Skip corrupt section, continue |

### 2. Error Handling Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 1: CATASTROPHIC (File Cannot Be Read)                    │
│ • File not found, corrupted header, invalid IFC                │
│ Action: FAIL FAST, report to user immediately                  │
│ Recovery: Cannot proceed                                       │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 2: CRITICAL (Major Structural Issues)                    │
│ • Missing project/site/building, all GUIDs missing             │
│ Action: Continue parsing, flag as critical issue               │
│ Recovery: Use defaults, generate missing structure             │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 3: ERROR (Per-Entity Issues)                             │
│ • Element missing GUID, invalid geometry, broken relationship  │
│ Action: Skip element/feature, continue parsing                 │
│ Recovery: Log error, track failed count                        │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 4: WARNING (Data Quality Issues)                         │
│ • Missing optional properties, non-standard Psets              │
│ Action: Continue normally, log warning                         │
│ Recovery: No action needed                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Healing Patterns

#### **Pattern 1: Missing GUID Healing**

```python
# apps/models/services/healing.py

import uuid
import hashlib

def generate_synthetic_guid(element, file_path: str) -> str:
    """
    Generate deterministic GUID for elements missing GlobalId.

    Uses: file path + element type + element name + step ID
    This ensures same element gets same GUID across re-imports.
    """
    # Create deterministic string
    unique_str = f"{file_path}_{element.is_a()}_{element.Name}_{element.id()}"

    # Hash to get consistent UUID
    hash_bytes = hashlib.sha256(unique_str.encode()).digest()[:16]
    generated_uuid = str(uuid.UUID(bytes=hash_bytes))

    # Convert to IFC GUID format (22 characters)
    ifc_guid = _uuid_to_ifc_guid(generated_uuid)

    return ifc_guid


def _uuid_to_ifc_guid(uuid_str: str) -> str:
    """
    Convert UUID to IFC GUID format (base64-like encoding).

    Note: This is a simplified version. Use ifcopenshell.guid for production.
    """
    import ifcopenshell.guid

    # Remove dashes from UUID
    uuid_hex = uuid_str.replace('-', '')

    # Convert to IFC GUID (22 characters)
    return ifcopenshell.guid.compress(uuid_hex)
```

**Usage in parse.py:**

```python
# In _extract_elements_metadata()

for element in elements:
    try:
        # Get GUID with healing
        if hasattr(element, 'GlobalId') and element.GlobalId:
            guid = element.GlobalId
            guid_is_synthetic = False
        else:
            # HEALING: Generate synthetic GUID
            guid = generate_synthetic_guid(element, file_path)
            guid_is_synthetic = True
            errors.append({
                'stage': 'elements_metadata',
                'severity': 'warning',
                'message': f"Element '{element.Name or element.id()}' missing GUID, generated synthetic GUID: {guid}",
                'element_guid': guid,
                'element_type': element.is_a(),
                'timestamp': datetime.now().isoformat(),
                'healing_applied': 'synthetic_guid',
            })

        # Create entity with synthetic flag
        entity = IFCEntity(
            model=model,
            ifc_guid=guid,
            ifc_type=element.is_a(),
            name=element.Name or '',
            # ... other fields ...
        )

        # Track if GUID is synthetic in metadata (optional)
        # Could add `guid_is_synthetic` field to IFCEntity model

    except Exception as e:
        errors.append(...)
```

#### **Pattern 2: Duplicate GUID Handling**

```python
# In _extract_elements_metadata()

# Track GUIDs seen in this file
seen_guids = set()
duplicate_count = 0

for element in elements:
    guid = element.GlobalId

    # Check for duplicate
    if guid in seen_guids:
        duplicate_count += 1

        # HEALING: Append step ID to make unique
        original_guid = guid
        guid = f"{guid}_{element.id()}"

        errors.append({
            'stage': 'elements_metadata',
            'severity': 'error',
            'message': f"Duplicate GUID detected: {original_guid} (step {element.id()}). Assigned unique GUID: {guid}",
            'element_guid': guid,
            'element_type': element.is_a(),
            'timestamp': datetime.now().isoformat(),
            'healing_applied': 'duplicate_guid_resolution',
        })

    seen_guids.add(guid)

    # Continue with entity creation...
```

#### **Pattern 3: Missing Spatial Structure Healing**

```python
def _heal_missing_spatial_structure(model, ifc_file):
    """
    Create default spatial structure if missing from IFC file.

    Many IFC files lack proper Project/Site/Building/Storey hierarchy.
    """
    # Check if project exists
    projects = ifc_file.by_type('IfcProject')
    if not projects:
        # Create synthetic project
        project_entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=generate_synthetic_guid_from_string('DEFAULT_PROJECT'),
            ifc_type='IfcProject',
            name='Default Project',
            description='Synthetic project created due to missing IfcProject',
            geometry_status='no_representation',
        )

        SpatialHierarchy.objects.create(
            model=model,
            entity=project_entity,
            hierarchy_level='project',
        )

        return {
            'healed': True,
            'project_guid': project_entity.ifc_guid,
        }

    # Check if building exists
    buildings = ifc_file.by_type('IfcBuilding')
    if not buildings:
        # Create synthetic building
        building_entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=generate_synthetic_guid_from_string('DEFAULT_BUILDING'),
            ifc_type='IfcBuilding',
            name='Default Building',
            description='Synthetic building created due to missing IfcBuilding',
            geometry_status='no_representation',
        )

        SpatialHierarchy.objects.create(
            model=model,
            entity=building_entity,
            hierarchy_level='building',
        )

        return {
            'healed': True,
            'building_guid': building_entity.ifc_guid,
        }

    return {'healed': False}
```

#### **Pattern 4: Geometry Extraction Fallback**

```python
# In apps/models/services/geometry.py

def extract_geometry_safe(element, settings):
    """
    Extract geometry with multiple fallback strategies.
    """
    try:
        # Strategy 1: Full geometry with world coordinates
        shape = ifcopenshell.geom.create_shape(settings, element)
        return _process_shape(shape), 'full'

    except Exception as e1:
        try:
            # Strategy 2: Try without advanced BREP
            settings.set(settings.DISABLE_ADVANCED_BREP, True)
            shape = ifcopenshell.geom.create_shape(settings, element)
            return _process_shape(shape), 'simplified'

        except Exception as e2:
            try:
                # Strategy 3: Bounding box only
                bbox = _extract_bounding_box_fallback(element)
                if bbox:
                    return _bbox_to_box_mesh(bbox), 'bbox'

            except Exception as e3:
                # Strategy 4: Give up, but log details
                return None, 'failed'


def _extract_bounding_box_fallback(element):
    """
    Extract bounding box even if full geometry fails.

    Uses ObjectPlacement and approximate dimensions.
    """
    if not hasattr(element, 'ObjectPlacement'):
        return None

    # Get placement matrix
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)

        # Get approximate dimensions from type or properties
        # (simplified - real implementation would be more complex)

        return {
            'min': [matrix[0][3] - 1, matrix[1][3] - 1, matrix[2][3] - 1],
            'max': [matrix[0][3] + 1, matrix[1][3] + 1, matrix[2][3] + 1],
        }
    except:
        return None
```

### 4. Validation Layer Integration

Your existing **IFCValidationReport** model (Layer 3) should integrate with healing:

```python
# In validation service

def validate_ifc_model(model_id: UUID):
    """
    Validate IFC model and report issues (Layer 3).

    Should be aware of healing applied in Layer 1.
    """
    report = IFCValidationReport.objects.create(model=model)

    # Check processing report for healing
    processing_report = ProcessingReport.objects.filter(model=model).latest('started_at')

    healing_issues = [
        error for error in processing_report.errors
        if 'healing_applied' in error
    ]

    # Add healing issues to validation report
    report.guid_issues = [
        {
            'severity': 'warning',
            'message': issue['message'],
            'healing_applied': issue['healing_applied'],
        }
        for issue in healing_issues
        if 'guid' in issue['healing_applied']
    ]

    report.save()
```

---

## Implementation Roadmap

### Phase 1: Schema Version Management (Week 1-2)

**Priority**: P0 (Foundation)

**Tasks**:
1. ✅ Create `IFCSchemaMetadata` model
2. ✅ Create `schema_mapping.py` service
3. ✅ Add `ifc_type_original` and `schema_version` fields to `IFCEntity`
4. ✅ Update `parse.py` to normalize entity types
5. ✅ Create migration
6. ✅ Update API serializers to include schema info
7. ✅ Add schema capabilities endpoint: `GET /api/models/{id}/schema/`

**Testing**:
- Upload IFC2x3 file → Check `IfcWallStandardCase` → Should be stored as `IfcWall` with `ifc_type_original='IfcWallStandardCase'`
- Upload IFC4 file → Check entity types → Should all be normalized
- Query entities by `ifc_type='IfcWall'` → Should return walls from both IFC2x3 and IFC4

**Deliverables**:
- Database migration file
- Updated `parse.py` service
- New `schema_mapping.py` service
- API endpoint for schema capabilities
- Django test script: `django-test/test_schema_mapping.py`

### Phase 2: Layer 4 - Quantities & Classifications (Week 3-4)

**Priority**: P1 (High Value)

**Tasks**:
1. ✅ Create `QuantitySet`, `Classification`, `MaterialLayer` models
2. ✅ Create `apps/entities/services/quantities.py` service
3. ✅ Add `quantities_status` field to `Model`
4. ✅ Update `tasks.py` to include Layer 4 extraction
5. ✅ Create bulk extraction functions
6. ✅ Add quantity calculation for missing data
7. ✅ Create API endpoints for quantities

**API Endpoints**:
```
GET    /api/models/{id}/quantities/          # List all quantities
GET    /api/entities/{id}/quantities/        # Entity quantities
POST   /api/models/{id}/extract-quantities/  # On-demand extraction
GET    /api/models/{id}/classifications/     # List classifications
```

**Testing**:
- Upload IFC with quantity sets → Verify extraction
- Upload IFC without quantities → Verify calculation from geometry
- Query quantities by type → Should return aggregated data

**Deliverables**:
- Database migration file
- `quantities.py` service
- Updated `tasks.py`
- API endpoints + serializers
- Django test script: `django-test/test_quantities.py`

### Phase 3: Robustness & Healing (Week 5)

**Priority**: P1 (Stability)

**Tasks**:
1. ✅ Create `apps/models/services/healing.py` service
2. ✅ Implement GUID healing patterns
3. ✅ Implement duplicate GUID handling
4. ✅ Implement missing spatial structure healing
5. ✅ Add healing tracking to `ProcessingReport`
6. ✅ Update validation layer to report healing

**Testing**:
- Test with malformed IFC files:
  - File with missing GUIDs
  - File with duplicate GUIDs
  - File with missing project/building
  - File with corrupt geometry

**Deliverables**:
- `healing.py` service
- Updated `parse.py` with healing integration
- Healing test suite
- Documentation: "Robustness Patterns Handbook"

### Phase 4: Layer 5 - Relationships (Optional, Week 6+)

**Priority**: P2 (Medium Value)

**Tasks**:
1. Create `PortConnection`, `SpaceBoundary` models
2. Create extraction services
3. Add API endpoints
4. Test with MEP models

**Note**: Only implement if specific projects require MEP coordination.

---

## Reference Documentation

### IFC Entity Type Mapping

#### **Core Physical Elements** (IFC2x3 → IFC4)

| IFC2x3 Type | IFC4 Type | Notes |
|-------------|-----------|-------|
| `IfcWall` | `IfcWall` | No change |
| `IfcWallStandardCase` | `IfcWall` | **DEPRECATED in IFC4** |
| `IfcSlab` | `IfcSlab` | No change |
| `IfcSlabStandardCase` | `IfcSlab` | **DEPRECATED in IFC4** |
| `IfcBeam` | `IfcBeam` | No change |
| `IfcColumn` | `IfcColumn` | No change |
| `IfcDoor` | `IfcDoor` | No change |
| `IfcWindow` | `IfcWindow` | No change |
| `IfcStair` | `IfcStair` | No change |
| `IfcRailing` | `IfcRailing` | Enhanced in IFC4 |
| `IfcRoof` | `IfcRoof` | No change |

#### **Spatial Elements** (All Versions)

| Entity Type | Purpose | Geometry |
|-------------|---------|----------|
| `IfcProject` | Root container | None |
| `IfcSite` | Site context | Optional (terrain) |
| `IfcBuilding` | Building container | Optional (building shape) |
| `IfcBuildingStorey` | Floor level | None |
| `IfcSpace` | Room/space | Optional (space volume) |

#### **IFC4.3 Infrastructure** (NEW)

| Entity Type | Purpose | Since |
|-------------|---------|-------|
| `IfcRoad` | Road infrastructure | IFC4.3 |
| `IfcRailway` | Railway infrastructure | IFC4.3 |
| `IfcBridge` | Bridge structure | IFC4.3 |
| `IfcTunnel` | Tunnel structure | IFC4.3 (ADD2) |
| `IfcAlignment` | Linear alignment | IFC4 (mature in 4.3) |

### Standard Property Sets (Psets)

#### **Common Psets** (All Elements)

| Pset Name | Contains | Usage |
|-----------|----------|-------|
| `Pset_Common` | IsExternal, Reference, Status | Universal |
| `Pset_ManufacturerTypeInformation` | Manufacturer, ModelLabel, ProductionYear | Product data |

#### **Wall Psets**

| Pset Name | Contains | Usage |
|-----------|----------|-------|
| `Pset_WallCommon` | LoadBearing, IsExternal, FireRating, ThermalTransmittance | Required |
| `Qto_WallBaseQuantities` | Length, Width, Height, NetVolume, NetSideArea | Quantities |

#### **Door/Window Psets**

| Pset Name | Contains | Usage |
|-----------|----------|-------|
| `Pset_DoorCommon` | IsExternal, FireRating, AcousticRating, SecurityRating | Required |
| `Pset_WindowCommon` | IsExternal, FireRating, GlazingAreaFraction, Infiltration | Required |
| `Qto_DoorBaseQuantities` | Width, Height, Area, Perimeter | Quantities |

### Norwegian Classification: NS 3451

| Code | Title (Norwegian) | Title (English) | Level |
|------|-------------------|-----------------|-------|
| 21 | Bygning | Building | 1 |
| 21.1 | Bæresystemer | Structural systems | 2 |
| 21.11 | Fundamenter | Foundations | 3 |
| 21.12 | Søyler og vegger | Columns and walls | 3 |
| 21.2 | Yttervegger | External walls | 2 |
| 21.21 | Fasader | Facades | 3 |
| 21.3 | Innervegger | Internal walls | 2 |
| 23 | HVAC | HVAC | 1 |
| 23.1 | Varme | Heating | 2 |
| 23.2 | Ventilasjon | Ventilation | 2 |

### SQL Query Examples

#### **Query 1: Get All Walls (Any Schema)**

```sql
-- Works with IFC2x3, IFC4, IFC4.3
SELECT
    e.id,
    e.ifc_guid,
    e.ifc_type,              -- Normalized: 'IfcWall'
    e.ifc_type_original,     -- Original: 'IfcWallStandardCase' or 'IfcWall'
    e.schema_version,        -- 'IFC2X3' or 'IFC4'
    e.name,
    s.name AS storey_name,
    COUNT(p.id) AS property_count
FROM ifc_entities e
LEFT JOIN ifc_entities s ON e.storey_id = s.id
LEFT JOIN property_sets p ON p.entity_id = e.id
WHERE e.ifc_type = 'IfcWall'  -- Normalized type
GROUP BY e.id, e.ifc_guid, e.ifc_type, e.name, s.name
ORDER BY s.name, e.name;
```

#### **Query 2: Quantities Summary by Type**

```sql
-- Get total quantities grouped by element type
SELECT
    e.ifc_type,
    q.quantity_name,
    q.quantity_unit,
    COUNT(*) AS element_count,
    SUM(q.quantity_value) AS total_value,
    AVG(q.quantity_value) AS avg_value,
    MIN(q.quantity_value) AS min_value,
    MAX(q.quantity_value) AS max_value
FROM quantity_sets q
JOIN ifc_entities e ON q.entity_id = e.id
WHERE e.model_id = $model_id
  AND q.quantity_name = 'NetVolume'
GROUP BY e.ifc_type, q.quantity_name, q.quantity_unit
ORDER BY total_value DESC;
```

#### **Query 3: Change Detection (Cross-Schema)**

```sql
-- Find changes between IFC2x3 and IFC4 versions
SELECT
    e1.ifc_guid,
    e1.ifc_type AS new_type,
    e1.ifc_type_original AS new_type_original,
    e1.schema_version AS new_schema,
    e2.ifc_type AS old_type,
    e2.ifc_type_original AS old_type_original,
    e2.schema_version AS old_schema,
    CASE
        WHEN e2.id IS NULL THEN 'added'
        WHEN e1.ifc_type != e2.ifc_type THEN 'type_changed'
        ELSE 'unchanged'
    END AS change_type
FROM ifc_entities e1
LEFT JOIN ifc_entities e2
    ON e1.ifc_guid = e2.ifc_guid
    AND e2.model_id = $previous_model_id
WHERE e1.model_id = $current_model_id;
```

#### **Query 4: Material Layers (Multi-layer Assembly)**

```sql
-- Get wall composition with material layers
SELECT
    e.ifc_guid,
    e.name AS wall_name,
    ml.layer_order,
    ml.layer_name,
    m.name AS material_name,
    ml.layer_thickness,
    ml.thermal_conductivity,
    ml.is_load_bearing,
    ml.is_external
FROM material_layers ml
JOIN ifc_entities e ON ml.entity_id = e.id
JOIN materials m ON ml.material_id = m.id
WHERE e.ifc_type = 'IfcWall'
  AND e.model_id = $model_id
ORDER BY e.name, ml.layer_order;
```

---

## Conclusion

### Summary of Recommendations

| Area | Recommendation | Priority | Effort | Impact |
|------|---------------|----------|--------|--------|
| **Schema Versioning** | Unified core + extensions | P0 | Low | High |
| **Entity Normalization** | Map deprecated types | P0 | Low | High |
| **Layer 4: Quantities** | Extract + calculate | P1 | Medium | High |
| **Robustness: Healing** | GUID/structure healing | P1 | Medium | High |
| **Layer 5: Connections** | MEP/structural | P2 | High | Medium |
| **IFC4.3 Infrastructure** | Road/railway support | P3 | High | Low |

### Next Steps

1. **Immediate (Week 1)**:
   - Implement schema metadata tracking
   - Add entity type normalization
   - Create schema capabilities API

2. **Short-term (Weeks 2-4)**:
   - Implement Layer 4 (quantities)
   - Add robustness/healing patterns
   - Test with real-world IFC files (IFC2x3 and IFC4)

3. **Medium-term (Weeks 5-8)**:
   - Implement Layer 5 if needed for MEP coordination
   - Add advanced query patterns
   - Optimize performance for large models

4. **Long-term (Months 3+)**:
   - IFC4.3 infrastructure support
   - Advanced validation rules
   - Machine learning for classification

### Contact

For questions or clarifications about this consultation:
- **IFC Schema Team**: buildingSMART International
- **Implementation**: SpruceLab team
- **Reference**: IFC documentation at https://standards.buildingsmart.org/

---

**Document Version**: 1.0
**Last Updated**: 2025-10-25
**Status**: Final Consultation Document
**Next Review**: After Phase 1 completion
