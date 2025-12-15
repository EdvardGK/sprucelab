# Session 014 Planning - Federated Viewer Architecture

**Date**: 2025-10-13
**Feature**: Federated Model Viewer with Custom Organization
**Status**: 📋 Planning Complete → Ready for Implementation

---

## Problem Statement

### Real-World BIM Coordination Challenges

**Current Limitation**:
- Individual model viewer (`/models/:id`) only shows ONE IFC file
- No way to view multiple models together (ARK + HVAC + STR)
- Can't coordinate models from different disciplines

**Real-World Complexity**:
- Different IFC versions (IFC2X3, IFC4, IFC4X3)
- Different project structures (IfcProject names don't match)
- Different coordinate systems (models may not align)
- Different naming conventions (Norwegian vs English, abbreviations)
- Incomplete hierarchies (missing IfcSite, wrong IfcBuilding names)

**Customer Risk**:
> "We can't be too strict, or we'll quickly lose customers if they get bogged down in 'perfectionism'"

**Solution**: Build a flexible federated viewer with custom organization layer (our abstraction, not strict IFC schema).

---

## Architecture Design

### Two Distinct Viewer Types

#### 1. Individual Model Viewer (Unchanged)
- **Route**: `/models/:id`
- **Purpose**: View/analyze ONE IFC model
- **Left Panel**: Native IFC tree (strict schema parsing)
  ```
  📁 Project
    └─ 📁 Site
        └─ 🏢 Building
            └─ 📐 Storey 1
                └─ Elements...
  ```
- **Use Cases**:
  - Model validation
  - Single-model QTO
  - Property inspection
  - Schema compliance checking

#### 2. Federated Viewer (New Feature)
- **Route**: `/projects/:id/viewers/:viewerId`
- **Purpose**: Coordinate MULTIPLE models from different disciplines
- **Left Panel**: Custom organization (flexible, user-defined groups)
  ```
  📁 Building A (custom group)
    └─ 📐 ARK_Building_A_v3.ifc
    └─ 🔧 HVAC_Bygg1_v2.ifc
    └─ 🏗️ STR_BuildingA_v1.ifc

  📁 Landscape (custom group)
    └─ 🌳 Landscape_Site.ifc
  ```
- **Use Cases**:
  - Multi-discipline coordination
  - Clash detection (future)
  - Federated property search (future)
  - Client presentations

---

## Database Schema

### ViewerConfiguration
**Purpose**: Top-level federated viewer (like a "saved view")

```python
class ViewerConfiguration(models.Model):
    """
    Federated viewer configuration for a project.
    Users can create multiple viewers (e.g., "Site Overview", "Building A Detail").
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey('auth.User', null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'viewer_configurations'
        ordering = ['name']
```

**Example Records**:
| id | project_id | name | description |
|----|-----------|------|-------------|
| uuid-1 | proj-123 | Site Overview | All models, full site coordination |
| uuid-2 | proj-123 | Building A | Detailed coordination for Building A only |
| uuid-3 | proj-123 | Phase 1 | Models relevant to construction phase 1 |

---

### ViewerGroup
**Purpose**: Custom organizational hierarchy (our abstraction layer)

```python
class ViewerGroup(models.Model):
    """
    Custom grouping for models in a viewer.
    Can represent buildings, phases, disciplines, or any custom organization.
    Supports nested hierarchy (parent/child).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    viewer = models.ForeignKey(ViewerConfiguration, on_delete=models.CASCADE, related_name='groups')
    name = models.CharField(max_length=255)
    group_type = models.CharField(max_length=50, choices=[
        ('building', 'Building'),
        ('phase', 'Construction Phase'),
        ('discipline', 'Discipline'),
        ('zone', 'Spatial Zone'),
        ('custom', 'Custom Group'),
    ])
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')
    display_order = models.IntegerField(default=0)
    is_expanded = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'viewer_groups'
        ordering = ['display_order', 'name']
```

**Example Records**:
| id | viewer_id | name | group_type | parent | display_order |
|----|-----------|------|------------|--------|---------------|
| grp-1 | uuid-1 | Building A | building | null | 1 |
| grp-2 | uuid-1 | Landscape | zone | null | 2 |
| grp-3 | uuid-1 | Architecture | discipline | grp-1 | 1 |
| grp-4 | uuid-1 | HVAC | discipline | grp-1 | 2 |

**Why This Works**:
- No assumptions about IFC structure
- Users define their own organization
- Can group by building, phase, discipline, or custom logic
- Handles nested hierarchies
- Works even when IFC schemas don't match

---

### ViewerModel
**Purpose**: Model assignment to viewer with coordination data

```python
class ViewerModel(models.Model):
    """
    Assignment of an IFC model to a viewer group.
    Includes coordination data (position, rotation, visibility).
    One model can appear in multiple viewers/groups.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    group = models.ForeignKey(ViewerGroup, on_delete=models.CASCADE, related_name='models')
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE)

    # Coordination (for models that don't align)
    offset_x = models.FloatField(default=0.0, help_text="X offset in meters")
    offset_y = models.FloatField(default=0.0, help_text="Y offset in meters")
    offset_z = models.FloatField(default=0.0, help_text="Z offset in meters")
    rotation = models.FloatField(default=0.0, help_text="Rotation in degrees (Z-axis)")

    # Display properties
    is_visible = models.BooleanField(default=True)
    opacity = models.FloatField(default=1.0)
    color_override = models.CharField(max_length=7, null=True, blank=True, help_text="Hex color (e.g., #FF5733)")
    display_order = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'viewer_models'
        unique_together = ['group', 'model']  # Same model can't be in same group twice
        ordering = ['display_order']
```

**Example Records**:
| id | group_id | model_id | offset_x | offset_y | is_visible | color_override |
|----|----------|----------|----------|----------|------------|----------------|
| vm-1 | grp-3 | model-ark | 0 | 0 | true | null |
| vm-2 | grp-4 | model-hvac | 0 | 0 | true | #FF5733 |
| vm-3 | grp-2 | model-landscape | 100 | 50 | true | null |

**Coordination Features**:
- **offset_x/y/z**: Handle models that don't share same origin
- **rotation**: Align models with different coordinate systems
- **color_override**: Color-code by discipline (Architecture=blue, HVAC=red, etc.)
- **opacity**: Fade models for context (e.g., show structure at 50% when focusing on MEP)

---

## API Endpoints

### Viewer Configuration

```
GET    /api/viewers/                      # List all viewers for a project (query param: project_id)
POST   /api/viewers/                      # Create new viewer
GET    /api/viewers/{id}/                 # Get viewer details (includes groups + models)
PATCH  /api/viewers/{id}/                 # Update viewer (name, description)
DELETE /api/viewers/{id}/                 # Delete viewer
```

### Viewer Groups

```
GET    /api/viewer-groups/                # List groups for a viewer (query param: viewer_id)
POST   /api/viewer-groups/                # Create new group
PATCH  /api/viewer-groups/{id}/           # Update group (name, parent, display_order)
DELETE /api/viewer-groups/{id}/           # Delete group (cascade to models)
POST   /api/viewer-groups/{id}/reorder/   # Reorder groups (drag-and-drop)
```

### Viewer Models

```
GET    /api/viewer-models/                # List models in a group (query param: group_id)
POST   /api/viewer-models/                # Add model to group
PATCH  /api/viewer-models/{id}/           # Update model (offset, visibility, color)
DELETE /api/viewer-models/{id}/           # Remove model from group
POST   /api/viewer-models/{id}/coordinate/ # Batch update coordination (X/Y/Z offset)
```

---

## Frontend Components

### 1. Viewer List (Project My Page)

**Location**: `/projects/:id/my-page` → "3D Viewers" section

**UI**:
```
┌─────────────────────────────────────────┐
│ 3D Viewers                              │
├─────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐     │
│ │ Site Overview│  │ Building A   │     │
│ │ 3 models     │  │ 5 models     │     │
│ │ [Open]       │  │ [Open]       │     │
│ └──────────────┘  └──────────────┘     │
│                                         │
│ [+ Create New Viewer]                   │
└─────────────────────────────────────────┘
```

### 2. Viewer Page

**Route**: `/projects/:id/viewers/:viewerId`

**Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│ Header: "Site Overview" [Edit] [Settings]                     │
├────────────┬─────────────────────────────┬───────────────────┤
│ Left Panel │        Canvas               │  Right Panel      │
│ (256px)    │        (flex-1)             │  (320px)          │
│            │                             │                   │
│ [Tree]     │                             │  Properties:      │
│ [Info]     │    Three.js Renderer        │  ┌─────────────┐ │
│            │                             │  │ Selected    │ │
│ Toggle:    │                             │  │ Object      │ │
│ ● Tree View│                             │  │ Info        │ │
│ ○ Object   │                             │  └─────────────┘ │
│            │                             │                   │
│ 📁 Building│                             │  Type: IfcWall    │
│  └─ ARK    │                             │  Name: Wall-001   │
│  └─ HVAC   │                             │  GUID: 1a2b3c...  │
│            │                             │                   │
│ [+] Add    │                             │  [More Props...]  │
└────────────┴─────────────────────────────┴───────────────────┘
```

**Left Panel - Two Modes**:

#### Mode 1: Tree View (Custom Groups)
```
📁 Building A [👁️ 🎨]
  └─ 📐 ARK_Building_A_v3.ifc [👁️ 🔧]
  └─ 🔧 HVAC_Bygg1_v2.ifc [👁️ 🔧]
  └─ 🏗️ STR_BuildingA_v1.ifc [👁️ 🔧]

📁 Landscape [👁️ 🎨]
  └─ 🌳 Landscape_Site.ifc [👁️ 🔧]

[+ Add Group]
[+ Add Model]
```

- 👁️ = Toggle visibility
- 🔧 = Coordination settings (offset, rotation)
- 🎨 = Group settings (color, opacity)

#### Mode 2: Object Info (Selection Details)
```
Selected: Wall-001

Type: IfcWall
GUID: 1ABCxyz...
Model: ARK_Building_A_v3.ifc

Properties:
  LoadBearing: true
  IsExternal: false
  Width: 200mm
  Height: 3000mm

Materials:
  - Concrete (200mm)

[View Full Properties]
```

### 3. Viewer Settings Dialog

**Triggered by**: Settings button in viewer header

**UI**:
```
Viewer Settings

General:
  Name: [Site Overview          ]
  Description: [Full site coordination]

Default View:
  Camera Position: [Auto-fit]
  Grid: [x] Show grid
  Shadows: [x] Enable shadows

Export:
  [Export as Image]
  [Export Coordination Report]
```

---

## Implementation Plan

### Phase 1: Backend + Basic Viewer (Week 1)

**Backend**:
1. Create database models (ViewerConfiguration, ViewerGroup, ViewerModel)
2. Run migrations
3. Create serializers (nested for full tree structure)
4. Create ViewSet endpoints (CRUD for all 3 models)
5. Add `GET /api/viewers/{id}/full/` endpoint (returns viewer + groups + models in one call)

**Frontend**:
6. Create viewer list component on Project My Page
7. Create "New Viewer" dialog
8. Create basic viewer page with 3-column layout
9. Load multiple models in Three.js (no tree yet, just model list)
10. Test with 2-3 models in same canvas

**Deliverable**: Can create viewers, add models, see them together in 3D

---

### Phase 2: Custom Organization (Week 2)

**Backend**:
11. Add reorder endpoint for groups
12. Add bulk coordination update endpoint

**Frontend**:
13. Build tree component for left panel
14. Add drag-and-drop to organize groups
15. Add visibility toggles per model
16. Add coordination dialog (X/Y/Z offset input)
17. Color-coding by discipline

**Deliverable**: Fully functional custom organization tree

---

### Phase 3: Advanced Features (Week 3)

**Backend**:
18. Graph visualization API (expose relationships across models)
19. Federated property search API

**Frontend**:
20. Toggle between Tree View and Object Info
21. Object selection in 3D → show properties
22. Graph visualization module (optional)
23. Federated search (search across all models in viewer)

**Deliverable**: Production-ready federated viewer

---

### Phase 4: Polish & Optimization (Week 4)

24. Performance optimization (LOD, occlusion culling)
25. Clash detection (basic intersection checks)
26. Export functionality (images, reports)
27. User permissions (who can edit viewers)
28. Documentation

**Deliverable**: Feature-complete, tested, documented

---

## Key Design Decisions

### 1. **Flexibility Over Strictness**
- No assumptions about IFC structure
- Users define their own organization
- Works with messy real-world data

### 2. **Custom Abstraction Layer**
- `ViewerGroup` is OUR concept, not IFC's
- Users can organize by building, phase, discipline, or custom logic
- Handles models with incompatible IFC hierarchies

### 3. **Model Reusability**
- Same model can appear in multiple viewers
- Example: "Landscape.ifc" in both "Site Overview" and "Building A Detail"
- No duplication, just references

### 4. **Coordination Flexibility**
- Models may not align (different origins)
- Provide X/Y/Z offset and rotation tools
- Optional color-coding for visual distinction

### 5. **Individual vs Federated Viewers**
- Individual viewer (`/models/:id`): Strict IFC tree, single model
- Federated viewer (`/projects/:id/viewers/:id`): Custom tree, multiple models
- Both coexist, serve different purposes

---

## Future Enhancements (Post-MVP)

### Clash Detection
- Spatial intersection checks between models
- Highlight conflicts (ARK wall vs HVAC duct)
- Export clash reports

### Version Comparison
- Compare two versions of same model in federated view
- Highlight changes (added/removed/modified elements)

### BCF Integration
- Link BCF issues to federated viewer
- Navigate to issue location in 3D

### Collaboration
- Real-time cursor sharing (see where team members are looking)
- Comments in 3D space
- Markup tools

### Advanced Visualization
- Heatmaps (energy, cost, schedule)
- 4D simulation (construction sequencing)
- Sunlight analysis

---

## Success Metrics

**MVP Success**:
- ✅ Users can create federated viewers
- ✅ Users can organize models into custom groups
- ✅ Multiple models load together in 3D
- ✅ Models can be shown/hidden individually
- ✅ Basic coordination (X/Y/Z offset) works

**Production Success**:
- ✅ Load 10+ models without performance issues
- ✅ Users prefer federated viewer for coordination tasks
- ✅ No customer complaints about inflexibility
- ✅ Handles real-world messy data gracefully

---

## Risk Mitigation

### Performance Risk
**Problem**: Loading 10+ large IFC models may be slow
**Mitigation**:
- Implement LOD (level of detail) system
- Load geometry progressively
- Use instancing for repeated elements
- Web Workers for geometry processing

### Coordination Complexity
**Problem**: Users may struggle with manual X/Y/Z offsets
**Mitigation**:
- Auto-detect common origins (0,0,0)
- Provide visual alignment tools (click two points to align)
- Save coordination presets (e.g., "Standard Building A offset")

### Data Inconsistency
**Problem**: Models may have conflicting data (different units, schemas)
**Mitigation**:
- Validate on upload (warn about IFC version mismatches)
- Display model metadata (schema, units) in tree
- Allow unit conversion in coordination settings

---

**Status**: 📋 Architecture Complete → Ready for Implementation
**Next Step**: Create backend models (ViewerConfiguration, ViewerGroup, ViewerModel)
**Estimated Timeline**: 4 weeks to full production feature
