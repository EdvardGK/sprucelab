# Session: Type, Materials & EPD Architecture Clarification

**Date**: 2026-02-07
**Status**: Phase 1 COMPLETE (Data Models Implemented)
**Priority**: High - foundational refactor before further LCA work

---

## ✅ Implementation Complete (Phase 1)

**Migration**: `0025_add_epd_architecture.py`

**New Models Added**:
- `EPDLibrary` - EPD data as first-class entity (source, source_id, GWP values, unit, validity)
- `EPDMapping` - Flexible mapping of EPD → IFC types, materials, MaterialLibrary, or ProductLibrary
- `IFCMaterialNormalization` - Maps IFC material names to normalized MaterialLibrary entries

**Fields Removed**:
- MaterialLibrary: `normalized_epd_id`, `specific_epd_id`, `gwp_a1_a3`, `reduzer_product_id`, `reduzer_product_id_type`
- ProductLibrary: `epd_data`, `reduzer_product_id`, `reduzer_product_id_type`

**Next Steps**: Phase 2 (Project Config Enhancement) - add inheritance fields and EPD source configuration.

---

## Quick Start (for new context)

**Read these first**:
1. `CLAUDE.md` - Project context, rules, architecture
2. `docs/knowledge/PROJECT_STATUS.md` - Current state, what's built
3. `docs/knowledge/magna-reduzer-comparison.md` - Where ideas came from

**What this worklog defines**:
- New data architecture separating IFC data, configuration, and EPD mapping
- EPDLibrary, EPDMapping, MaterialMapping models (code below)
- UI split: BIM Workbench (IFC) vs Project Types & Materials (config)
- Implementation phases with specific file paths

**To implement**: Start at "Implementation Plan" section below, Phase 1.

---

## Summary

Clarified the separation of concerns between IFC data (source of truth), configuration (project-specific), and EPD mapping (flexible relationships). This session defines the architectural split between BIM Workbench (IFC work) and Project Types & Materials (configuration).

## Problem Statement

The current Sprucelab architecture has these issues:

1. **MaterialLibrary embeds EPD IDs** - `backend/apps/entities/models.py` has `epd_id` and Reduzer-specific fields baked into MaterialLibrary. Different projects need different EPDs for the same generic material.

2. **No separation between IFC data and configuration** - Type classification, material normalization, and EPD mapping are conflated. Should be: IFC = source of truth, Config = project-specific rules.

3. **No inheritance model** - Each project must configure everything from scratch. Should be able to inherit from global defaults.

4. **EPDs not first-class** - EPDs are embedded in materials/products. Should be separate entities that can link to types, materials, OR products flexibly.

## Context

### Comparison with magna-reduzer

See `docs/knowledge/magna-reduzer-comparison.md` for full comparison.

**magna-reduzer** (`/home/edkjo/skiplum/model-analysis/magna-reduzer/`):
- Python scripts for type extraction and LCA export
- 33 confirmed Reduzer product IDs in `epd_mapper.py`
- Material normalization in `material_normalizer.py`
- NS3451 classification in `ns3451_mapper.py`
- Multi-scenario export (Scenario A/C for new vs renovation)

**Key insight from magna-reduzer**: EPD mapping is project-specific. G55 might use different EPDs than S8 for the same "concrete" material.

### Current Sprucelab State

**Relevant files**:
- `backend/apps/entities/models.py` (1,673 lines) - Contains MaterialLibrary, ProductLibrary with embedded EPD fields
- `backend/apps/projects/models.py` - ProjectConfig (JSON-based, needs enhancement)
- `frontend/src/pages/BIMWorkbench.tsx` - Current type classification UI
- `frontend/src/components/features/warehouse/` - Type mapping components

**Current MaterialLibrary model** (problematic):
```python
class MaterialLibrary(models.Model):
    canonical_name = models.CharField()
    category = models.CharField()  # Enova category
    density = models.FloatField()
    epd_id = models.CharField()  # ← PROBLEM: Baked-in Reduzer ID
    reduzer_name = models.CharField()  # ← PROBLEM: Reduzer-specific
```

**What we want**:
```python
class MaterialLibrary(models.Model):
    canonical_name = models.CharField()
    category = models.CharField()
    density = models.FloatField()
    # NO EPD fields - EPDs are separate entities with flexible mapping
```

## Architectural Clarification

### Core Principle: Layered Data Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 0: IFC Source of Truth                                │
│ ┌─────────────┐  ┌─────────────┐                           │
│ │  IFCType    │  │ IFCMaterial │  (from parsed IFC files)  │
│ └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Project Configuration                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ProjectConfig                                           │ │
│ │ - Normalization rules (inherit global or custom)        │ │
│ │ - Product libraries (which to use)                      │ │
│ │ - EPD sources (Reduzer, OneClick, custom)              │ │
│ │ - Classification system (NS3451, OmniClass)            │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Mappings (per-project, inheritable)                │
│ ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │
│ │ TypeMapping   │  │ MaterialMap   │  │ EPDMapping    │    │
│ │ → NS3451      │  │ → Normalized  │  │ → EPD link    │    │
│ │ → SemanticType│  │ → Category    │  │               │    │
│ └───────────────┘  └───────────────┘  └───────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Reference Libraries (global, reusable)             │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│ │ MaterialLib │  │ ProductLib  │  │ EPDLibrary  │          │
│ │ (generic)   │  │ (products)  │  │ (EPD data)  │          │
│ └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Key Entities

#### IFC Source of Truth (from parsed files)
- **IFCType**: Type definitions from IFC (name, class, instance_count)
- **IFCMaterial**: Materials from IFC (name, as defined in model)

#### Project Configuration
- **ProjectConfig**: Per-project settings
  - `normalization_rules`: Which rules to apply (global vs custom)
  - `product_libraries`: Which product libraries to use
  - `epd_sources`: Which EPD databases (Reduzer, OneClick, NEPD)
  - `classification_system`: NS3451, OmniClass, custom
  - `inherit_from`: Global config or another project

#### Reference Libraries (global, shared)
- **MaterialLibrary**: Generic materials (steel, concrete, wood)
  - NO embedded EPD IDs
  - Categories (Enova 36-category system)
  - Physical properties (density, thermal conductivity)

- **ProductLibrary**: Specific products (manufacturers, models)
  - Manufacturer, model, dimensions
  - Datasheet links
  - NO embedded EPD IDs

- **EPDLibrary**: EPD data as first-class entities
  - `source`: Reduzer, OneClick, NEPD, custom
  - `product_id`: ID in source system
  - `name`: Human-readable name
  - `gwp`: Global Warming Potential
  - `valid_until`: Expiration date
  - `unit`: per kg, per m², per m³

#### Mappings (per-project, flexible)
- **TypeMapping**: IFCType → Classification
  - ns3451_code, semantic_type, representative_unit

- **MaterialMapping**: IFCMaterial → MaterialLibrary
  - Links raw IFC material to normalized category

- **EPDMapping**: Flexible EPD relationships
  - Can link to: IFCType, IFCMaterial, MaterialLibrary, ProductLibrary
  - `target_type`: "ifc_type" | "ifc_material" | "material_lib" | "product_lib"
  - `target_id`: UUID of target
  - `epd`: ForeignKey to EPDLibrary
  - `project`: Optional (null = global default)

### EPD Relationship Examples

```
# EPD can map to different levels:

1. Direct to IFC Type (most specific)
   EPDMapping(target_type="ifc_type", target_id=wall_type_123, epd=concrete_epd)
   → "This specific wall type uses this EPD"

2. Direct to IFC Material (model-specific)
   EPDMapping(target_type="ifc_material", target_id=b35_concrete, epd=b35_epd)
   → "B35 concrete in this model uses this EPD"

3. To MaterialLibrary (generic default)
   EPDMapping(target_type="material_lib", target_id=concrete_generic, epd=generic_concrete_epd)
   → "All concrete defaults to this EPD"

4. To ProductLibrary (product-specific)
   EPDMapping(target_type="product_lib", target_id=schuco_window, epd=schuco_epd)
   → "This product uses this EPD"
```

### Inheritance Model

```
Global Config (system defaults)
    │
    ├── Normalization rules
    ├── Default EPD sources
    └── Default material mappings
          │
          ▼
Project Config (can override)
    │
    ├── inherit_from: "global" | "project_id" | null
    ├── Custom normalization rules (merged or replaced)
    ├── Custom EPD sources (added or replaced)
    └── Project-specific mappings
```

## UI Separation

### BIM Workbench (`/projects/:id/workbench`)
- **Purpose**: Work with IFC data (source of truth)
- **Features**:
  - Type list from parsed models
  - Type classification (NS3451, semantic type)
  - Material layer editor (sandwich view)
  - Type verification workflow
  - 3D type instance preview

### Project Types & Materials (`/projects/:id/types-materials`)
- **Purpose**: Configuration for normalization, products, EPDs
- **Tabs**:
  1. **Config** - Project settings, inheritance
  2. **Materials** - Material mappings, normalization
  3. **Products** - Product library (project-specific or global)
  4. **EPDs** - EPD mappings, sources

### Global Libraries (`/admin/libraries`)
- **Purpose**: System-wide reference data
- **Sections**:
  - Material Library (generic materials)
  - Product Library (global products)
  - EPD Library (all EPDs from all sources)
  - NS3451 Codes (reference)
  - Semantic Types (PA0802)

## Model Changes Required

### New Models

```python
# apps/entities/models.py

class EPDLibrary(models.Model):
    """EPD data as first-class entity"""
    source = models.CharField(choices=[
        ("reduzer", "Reduzer"),
        ("oneclick", "OneClickLCA"),
        ("nepd", "NEPD"),
        ("epd_norge", "EPD Norge"),
        ("custom", "Custom"),
    ])
    source_id = models.CharField()  # ID in source system
    name = models.CharField()
    category = models.CharField()  # Enova category
    gwp_a1_a3 = models.FloatField(null=True)  # kg CO2e
    gwp_total = models.FloatField(null=True)
    unit = models.CharField()  # kg, m², m³, pcs
    valid_until = models.DateField(null=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        unique_together = ["source", "source_id"]


class EPDMapping(models.Model):
    """Flexible EPD-to-target mapping"""
    project = models.ForeignKey(Project, null=True)  # null = global
    target_type = models.CharField(choices=[
        ("ifc_type", "IFC Type"),
        ("ifc_material", "IFC Material"),
        ("material_lib", "Material Library"),
        ("product_lib", "Product Library"),
    ])
    target_id = models.UUIDField()
    epd = models.ForeignKey(EPDLibrary)
    priority = models.IntegerField(default=0)  # Higher = preferred
    notes = models.TextField(blank=True)


class MaterialMapping(models.Model):
    """IFC Material → Normalized Material"""
    model = models.ForeignKey(Model)
    ifc_material_name = models.CharField()  # Raw from IFC
    material_library = models.ForeignKey(MaterialLibrary, null=True)
    normalized_name = models.CharField()  # Canonical name
    confidence = models.CharField(choices=[
        ("auto", "Auto-detected"),
        ("manual", "Manual"),
        ("verified", "Verified"),
    ])
```

### Model Updates

```python
# Remove EPD fields from MaterialLibrary
class MaterialLibrary(models.Model):
    canonical_name = models.CharField()
    category = models.CharField()  # Enova category
    density = models.FloatField(null=True)
    thermal_conductivity = models.FloatField(null=True)
    # REMOVED: epd_id, reduzer_id

# Remove EPD fields from ProductLibrary
class ProductLibrary(models.Model):
    name = models.CharField()
    manufacturer = models.CharField()
    model_number = models.CharField()
    # REMOVED: epd_id
```

## Implementation Plan

### Phase 1: Data Model Refactor

**File**: `backend/apps/entities/models.py`

**Step 1.1**: Add new models (append to file):

```python
class EPDLibrary(models.Model):
    """EPD data as first-class entity - NOT tied to specific materials"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    source = models.CharField(max_length=50, choices=[
        ("reduzer", "Reduzer"),
        ("oneclick", "OneClickLCA"),
        ("nepd", "NEPD"),
        ("epd_norge", "EPD Norge"),
        ("custom", "Custom"),
    ])
    source_id = models.CharField(max_length=255)  # ID in source system
    name = models.CharField(max_length=500)
    category = models.CharField(max_length=100, blank=True)  # Enova category

    # LCA data
    gwp_a1_a3 = models.FloatField(null=True, blank=True)  # kg CO2e
    gwp_c3_c4 = models.FloatField(null=True, blank=True)
    gwp_d = models.FloatField(null=True, blank=True)
    gwp_total = models.FloatField(null=True, blank=True)

    unit = models.CharField(max_length=20)  # kg, m², m³, pcs
    declared_unit = models.CharField(max_length=100, blank=True)  # "1 kg", "1 m²"
    valid_until = models.DateField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["source", "source_id"]
        verbose_name_plural = "EPD Library"

    def __str__(self):
        return f"{self.source}:{self.name}"


class EPDMapping(models.Model):
    """Flexible EPD-to-target mapping - can link EPD to type, material, or product"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True, blank=True,
        help_text="Null = global default mapping"
    )

    target_type = models.CharField(max_length=50, choices=[
        ("ifc_type", "IFC Type"),
        ("ifc_material", "IFC Material"),
        ("material_lib", "Material Library"),
        ("product_lib", "Product Library"),
    ])
    target_id = models.UUIDField()

    epd = models.ForeignKey(EPDLibrary, on_delete=models.CASCADE)
    priority = models.IntegerField(default=0, help_text="Higher = preferred when multiple match")

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )

    class Meta:
        ordering = ["-priority", "-created_at"]


class MaterialMapping(models.Model):
    """Maps raw IFC material names to normalized MaterialLibrary entries"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE)

    ifc_material_name = models.CharField(max_length=500)  # Raw from IFC
    material_library = models.ForeignKey(
        'MaterialLibrary',
        on_delete=models.SET_NULL,
        null=True, blank=True
    )
    normalized_name = models.CharField(max_length=255, blank=True)  # Canonical name

    confidence = models.CharField(max_length=20, choices=[
        ("auto", "Auto-detected"),
        ("manual", "Manual"),
        ("verified", "Verified"),
    ], default="auto")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["model", "ifc_material_name"]
```

**Step 1.2**: Update existing MaterialLibrary (remove EPD fields):

```python
# REMOVE these fields from MaterialLibrary:
# - epd_id
# - reduzer_name
# - reduzer_id
# Keep: canonical_name, category, density, thermal_conductivity, etc.
```

**Step 1.3**: Create migration:
```bash
cd backend
python manage.py makemigrations entities --name add_epd_architecture
python manage.py migrate
```

### Phase 2: Project Config Enhancement

**File**: `backend/apps/projects/models.py`

**Step 2.1**: Enhance ProjectConfig:

```python
class ProjectConfig(models.Model):
    # Existing fields...

    # NEW: Inheritance
    inherit_from = models.CharField(max_length=50, choices=[
        ("global", "Global Defaults"),
        ("none", "No Inheritance"),
    ], default="global")
    parent_project = models.ForeignKey(
        'Project',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="child_configs",
        help_text="Inherit from another project's config"
    )

    # NEW: EPD Configuration
    epd_sources = models.JSONField(default=list, blank=True)
    # Example: ["reduzer", "nepd", "custom"]

    # NEW: Normalization rules
    normalization_rules = models.JSONField(default=dict, blank=True)
    # Example: {"use_global": true, "custom_overrides": {...}}
```

### Phase 3: Frontend Implementation

**New page**: `frontend/src/pages/ProjectTypesAndMaterials.tsx`

**Route**: `/projects/:id/types-materials`

**Tabs**:
1. **Config** - Project settings, inheritance toggle
2. **Materials** - MaterialMapping list, normalization
3. **Products** - ProductLibrary (project-specific additions)
4. **EPDs** - EPDLibrary browser, EPDMapping editor

**New components** (in `frontend/src/components/features/config/`):
- `EPDLibraryBrowser.tsx` - Search/browse EPDs
- `EPDMappingEditor.tsx` - Map EPDs to targets
- `MaterialMappingGrid.tsx` - IFC material → normalized
- `ProjectConfigForm.tsx` - Inheritance, sources

### Phase 4: API Endpoints

**File**: `backend/apps/entities/views.py`

**New ViewSets**:
```python
class EPDLibraryViewSet(viewsets.ModelViewSet):
    queryset = EPDLibrary.objects.all()
    serializer_class = EPDLibrarySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    search_fields = ['name', 'source_id', 'category']
    filterset_fields = ['source', 'category']


class EPDMappingViewSet(viewsets.ModelViewSet):
    serializer_class = EPDMappingSerializer

    def get_queryset(self):
        project_id = self.request.query_params.get('project')
        if project_id:
            # Return project-specific + global (null project)
            return EPDMapping.objects.filter(
                Q(project_id=project_id) | Q(project__isnull=True)
            )
        return EPDMapping.objects.all()


class MaterialMappingViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialMappingSerializer
    filterset_fields = ['model', 'confidence']
```

**File**: `backend/apps/entities/urls.py`

```python
router.register(r'epd-library', EPDLibraryViewSet, basename='epd-library')
router.register(r'epd-mappings', EPDMappingViewSet, basename='epd-mappings')
router.register(r'material-mappings', MaterialMappingViewSet, basename='material-mappings')
```

### Phase 5: Export Updates

**File**: `backend/apps/entities/services/reduzer_export.py`

**Update EPD resolution logic**:
```python
def resolve_epd(target_type: str, target_id: UUID, project_id: UUID = None) -> EPDLibrary:
    """
    Resolve EPD with fallback chain:
    1. Project-specific mapping for exact target
    2. Global mapping for exact target
    3. Project-specific mapping for parent (e.g., MaterialLibrary)
    4. Global mapping for parent
    5. None
    """
    # Try project-specific first
    if project_id:
        mapping = EPDMapping.objects.filter(
            project_id=project_id,
            target_type=target_type,
            target_id=target_id
        ).order_by('-priority').first()
        if mapping:
            return mapping.epd

    # Try global
    mapping = EPDMapping.objects.filter(
        project__isnull=True,
        target_type=target_type,
        target_id=target_id
    ).order_by('-priority').first()
    if mapping:
        return mapping.epd

    return None
```

## File Reference

### Files to Modify
| File | Changes |
|------|---------|
| `backend/apps/entities/models.py` | Add EPDLibrary, EPDMapping, MaterialMapping; remove EPD fields from MaterialLibrary |
| `backend/apps/entities/views.py` | Add new ViewSets |
| `backend/apps/entities/serializers.py` | Add new serializers |
| `backend/apps/entities/urls.py` | Register new routes |
| `backend/apps/projects/models.py` | Enhance ProjectConfig |
| `backend/apps/entities/services/reduzer_export.py` | Update EPD resolution |

### Files to Create
| File | Purpose |
|------|---------|
| `frontend/src/pages/ProjectTypesAndMaterials.tsx` | New page |
| `frontend/src/components/features/config/EPDLibraryBrowser.tsx` | EPD browser |
| `frontend/src/components/features/config/EPDMappingEditor.tsx` | Mapping UI |
| `frontend/src/components/features/config/MaterialMappingGrid.tsx` | Material normalization |
| `frontend/src/hooks/use-epd.ts` | React Query hooks for EPD |

## Documentation References

| Document | Purpose |
|----------|---------|
| `docs/knowledge/PROJECT_STATUS.md` | Current architecture overview |
| `docs/knowledge/magna-reduzer-comparison.md` | Comparison with prototype, what to adopt |
| `docs/knowledge/architecture-flowchart.md` | System diagrams |
| `docs/plans/PRD_v2.md` | Product requirements |
| `CLAUDE.md` | Project context and rules |

## Testing Checklist

After implementation:

1. [ ] Can create EPDLibrary entries from Reduzer CSV
2. [ ] Can map EPD to IFCType (project-specific)
3. [ ] Can map EPD to MaterialLibrary (global default)
4. [ ] EPD resolution falls back correctly (project → global)
5. [ ] Reduzer export uses new EPD mapping
6. [ ] Project config inheritance works
7. [ ] Material normalization persists per-model

## Notes

- EPDs should be importable from external sources (CSV, API)
- Consider caching EPD data with TTL (EPDs expire)
- Need versioning for EPD changes over time
- Project inheritance should be auditable
- magna-reduzer has 33 confirmed Reduzer product IDs in `docs/reduzer-materials-index.md` - can import these as initial EPDLibrary seed data
