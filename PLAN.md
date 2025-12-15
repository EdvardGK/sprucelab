# Sprucelab MVP - Implementation Plan

**Created:** 2025-11-09
**Status:** Planning Complete - Ready for Phase 0
**Target:** Property Editing Platform with IFC Warehouse and LCA Workflows

---

## Vision

Transform Sprucelab from a BIM coordination platform into a **comprehensive IFC property editing and data manipulation platform** that:

1. **Wraps existing ifcopenshell workflows with UI** - Productize proven scripts for non-programmers
2. **Enables bulk property editing** - Edit thousands of IFC objects at once
3. **Provides bidirectional Excel integration** - Excel ↔ IFC workflows
4. **Includes IFC Warehouse** - Material/type library with LCA data and state tracking
5. **Supports LCA scenarios** - Design options A/B/C with embodied carbon tracking
6. **Validates against custom rules** - Norwegian standards (MMI, NS-3451) + project-specific validation

**Unique Value:** Only platform combining IFC editing, LCA workflows, and Norwegian standards with concurrent file processing.

---

## Architecture Overview

### Hybrid Microservices

```
┌─────────────────────────────────────────┐
│   Django Backend (Port 8000)            │
│   - API, database, user management      │
│   - Project/Model metadata              │
│   - Material/Type library (warehouse)   │
│   - LCA scenarios                       │
│   - PostgreSQL database                 │
└──────────────┬──────────────────────────┘
               │
               │ Internal HTTP / Redis Queue
               ▼
┌─────────────────────────────────────────┐
│   FastAPI IFC Service (Port 8001)       │
│   - Concurrent IFC processing           │
│   - Bulk property editing               │
│   - Validation engine                   │
│   - IFC reconstruction/export           │
│   - Excel integration                   │
└─────────────────────────────────────────┘
               │
               │ REST API
               ▼
┌─────────────────────────────────────────┐
│   React Frontend (Port 5173)            │
│   - Property editor grid                │
│   - Warehouse library UI                │
│   - LCA dashboards                      │
│   - ThatOpen 3D viewer                  │
└─────────────────────────────────────────┘
```

### Communication Flow

1. **File Upload:** Frontend → Django → Celery task → Parse → Store metadata
2. **Property Editing:** Frontend → FastAPI → ifcopenshell operations → Return results
3. **Export:** Frontend → FastAPI → Generate IFC → Django storage → Download link
4. **Validation:** Frontend → FastAPI → Validation rules → Report → Frontend

### Key Architectural Decisions

**Why Hybrid (Django + FastAPI)?**
- **Django:** Excellent ORM, migrations, admin interface, auth - perfect for database-heavy operations
- **FastAPI:** Native async support, better for concurrent file processing, faster IFC operations
- **Separation:** Django handles data, FastAPI handles computationally intensive IFC operations

**Why Database-Backed Warehouse?**
- SQL queries for filtering materials/types
- Relational links between instances, projects, and library items
- Track usage across projects
- Export to LCA tools

**Why Parametric Geometry?**
- Lightweight storage (JSON instead of meshes)
- Editable parameters
- Generate 3D preview on-demand

---

## Phase 0: Fix Sprucelab (Weeks 1-2)

**Goal:** Debug and fix existing viewer and parsing issues before building new features

### Week 1: Diagnostic & Viewer Fix

#### Tasks:
1. **Debug ThatOpen Viewer**
   - [ ] Investigate why viewer broke
   - [ ] Check Fragments loading path
   - [ ] Test with sample IFC file (use Solibri export from `/data/`)
   - [ ] Fix Fragments generation script
   - [ ] Verify multi-model viewing works

2. **Test IFC Parsing**
   - [ ] Run existing parse service with test file
   - [ ] Check database insertions (IFCEntity, PropertySet, SpatialHierarchy)
   - [ ] Verify GUID uniqueness constraint
   - [ ] Test metadata extraction (properties, quantities, systems)

3. **Database Audit**
   - [ ] Review all 15 tables
   - [ ] Identify which tables are needed for property editing MVP
   - [ ] Plan new models: MaterialLibrary, TypeLibrary, WarehouseInstance
   - [ ] Check if existing PropertySet model supports bulk editing

**Deliverables:**
- ✅ Working ThatOpen viewer with multi-model support
- ✅ Functional IFC parsing (Layer 1)
- ✅ Database schema assessment document

### Week 2: Architecture Planning & Setup

#### Tasks:
1. **FastAPI Service Setup**
   - [ ] Create `/backend/ifc-service/` directory
   - [ ] Initialize FastAPI app (`main.py`)
   - [ ] Set up Pydantic models for requests/responses
   - [ ] Create Dockerfile
   - [ ] Test basic endpoint (`/health`)

2. **Database Schema Updates**
   - [ ] Add `enrichment_status`, `export_status` to Model model
   - [ ] Create MaterialLibrary model
   - [ ] Create TypeLibrary model
   - [ ] Create WarehouseInstance model
   - [ ] Create DesignScenario + ScenarioAssignment models (for LCA)
   - [ ] Run migrations

3. **Integration Planning**
   - [ ] Define Django ↔ FastAPI communication protocol (HTTP or Redis?)
   - [ ] Plan file storage (where do FastAPI-processed files go?)
   - [ ] Document API contracts

**Deliverables:**
- ✅ FastAPI service running locally
- ✅ Updated database schema with new models
- ✅ Integration architecture documented

---

## Phase 1: FastAPI IFC Service + Bulk Property Editing (Weeks 3-6)

**Goal:** Core IFC operations and bulk property editing with Excel integration

### Week 3: IFC Operations API

#### Tasks:
1. **File Loading**
   - [ ] Endpoint: `POST /ifc/open` - Accept IFC file upload
   - [ ] Service: Load IFC with ifcopenshell
   - [ ] Extract element tree (GUIDs, types, names)
   - [ ] Store in temporary cache (Redis or filesystem)
   - [ ] Return file_id + element count

2. **Element Querying**
   - [ ] Endpoint: `GET /ifc/{file_id}/elements` - Paginated element list
   - [ ] Support filters: `type`, `floor`, `material`, custom query
   - [ ] Return elements with properties (Psets)
   - [ ] Endpoint: `GET /ifc/{file_id}/elements/{guid}` - Single element details

3. **Property Extraction**
   - [ ] Service: Extract all Psets from element
   - [ ] Format as nested dict: `{pset_name: {property_name: value}}`
   - [ ] Handle property types (string, float, boolean, enum)

**Deliverables:**
- ✅ FastAPI endpoints for IFC loading and querying
- ✅ Element list with properties returned as JSON

### Week 4: Bulk Property Editor

#### Tasks:
1. **Backend Service**
   - [ ] Endpoint: `POST /ifc/{file_id}/properties/bulk-edit`
   - [ ] Accept: Array of `{guid, pset_name, property_name, new_value}`
   - [ ] Service: Apply changes to ifcopenshell model in memory
   - [ ] Return: Success count, errors
   - [ ] Endpoint: `POST /ifc/{file_id}/psets/add` - Add Pset to multiple elements

2. **Validation Before Write**
   - [ ] Validate property types (e.g., FireRating must be string)
   - [ ] Validate required properties (e.g., IsExternal is boolean)
   - [ ] Return validation errors BEFORE applying changes

3. **Preview Endpoint**
   - [ ] Endpoint: `GET /ifc/{file_id}/properties/preview` - Show changes without applying
   - [ ] Return diff: `{guid: {pset.property: {old_value, new_value}}}`

**Deliverables:**
- ✅ Bulk property editing endpoint functional
- ✅ Validation prevents broken data
- ✅ Preview endpoint returns change diff

### Week 5: Excel Integration (IFC → Excel)

#### Tasks:
1. **Export IFC to Excel**
   - [ ] Endpoint: `POST /ifc/{file_id}/export-excel`
   - [ ] Accept: Element filter (type, floor, etc.)
   - [ ] Service: Extract elements and properties
   - [ ] Generate Excel with columns: GUID, Type, Name, Pset.Property...
   - [ ] Use `openpyxl` to create workbook
   - [ ] Return download URL

2. **Excel Template Download**
   - [ ] Endpoint: `GET /ifc/templates/excel`
   - [ ] Generate blank template with correct column headers
   - [ ] Include instructions sheet
   - [ ] Return downloadable Excel file

**Deliverables:**
- ✅ IFC → Excel export working
- ✅ Downloadable Excel template

### Week 6: Excel Integration (Excel → IFC)

#### Tasks:
1. **Import Excel to IFC**
   - [ ] Endpoint: `POST /ifc/import-excel`
   - [ ] Accept: Excel file upload
   - [ ] Parse Excel with pandas/openpyxl
   - [ ] Column mapping (flexible - handle variations)
   - [ ] For existing GUIDs: Update properties
   - [ ] For new rows: Create new IFC objects (using ifcopenshell scripts)
   - [ ] Return: Created/updated count, errors

2. **Property Application**
   - [ ] Map Excel columns to Psets (e.g., `Pset_WallCommon.FireRating`)
   - [ ] Handle nested properties
   - [ ] Apply to IFC model

3. **Frontend Integration**
   - [ ] Upload Excel component (drag-drop)
   - [ ] Show mapping preview (Excel columns → IFC properties)
   - [ ] Display import results (success/errors)

**Deliverables:**
- ✅ Excel → IFC import functional
- ✅ Bidirectional Excel workflow complete
- ✅ Frontend upload UI

**Phase 1 Success Criteria:**
- Can load IFC file via FastAPI
- Can query elements with filters
- Can bulk edit properties on 1000+ elements
- Can export to Excel and re-import changes
- All changes validated before write

---

## Phase 2: IFC Warehouse (Material/Type Library) (Weeks 7-9)

**Goal:** Database-backed material and type library with instance tracking

### Week 7: Material Library

#### Tasks:
1. **Material Library CRUD API (Django)**
   - [ ] ViewSet for MaterialLibrary model
   - [ ] Endpoints: GET/POST/PATCH/DELETE `/api/warehouse/materials/`
   - [ ] Serializers with nested properties
   - [ ] Upload photos endpoint

2. **Material Library UI**
   - [ ] React component: Material table (TanStack Table)
   - [ ] CRUD forms (create/edit material)
   - [ ] Search/filter by category, manufacturer, status
   - [ ] Photo upload preview
   - [ ] Bulk import from CSV

**Deliverables:**
- ✅ Material library CRUD API
- ✅ Material library UI functional

### Week 8: Type Library

#### Tasks:
1. **Type Library CRUD API (Django)**
   - [ ] ViewSet for TypeLibrary model
   - [ ] Link to MaterialLibrary (FK)
   - [ ] Store parametric geometry as JSON
   - [ ] Track instances across projects

2. **Type Library UI**
   - [ ] React component: Type table
   - [ ] CRUD forms (create/edit type)
   - [ ] Material dropdown (select from MaterialLibrary)
   - [ ] Parametric geometry form (width, height, depth for box type)
   - [ ] Instance usage table (show which projects use this type)

3. **3D Preview Generation**
   - [ ] Service: Generate Three.js scene from parametric definition
   - [ ] Frontend: Simple Three.js viewer for type preview
   - [ ] Support types: box, cylinder, cone, sphere

**Deliverables:**
- ✅ Type library CRUD API
- ✅ Type library UI with 3D preview

### Week 9: Instance Tracking

#### Tasks:
1. **Warehouse Instance Model**
   - [ ] Auto-create WarehouseInstance on IFC upload
   - [ ] Match GUIDs to existing library items
   - [ ] Mark unmatched instances for manual review

2. **Instance Linking UI**
   - [ ] Show unmatched instances
   - [ ] UI to assign instance to library Material/Type
   - [ ] Bulk assignment (e.g., "All IfcWall Type='200mm Concrete' → Type Library item 'Wall-200-Concrete'")

3. **Integration with Property Editor**
   - [ ] When editing properties in FastAPI, update WarehouseInstance
   - [ ] Show library info in property editor (e.g., "This wall uses Material: 'Concrete C30'")

**Deliverables:**
- ✅ WarehouseInstance model functional
- ✅ Auto-matching on IFC upload
- ✅ Manual linking UI

**Phase 2 Success Criteria:**
- Material library has 20+ materials with LCA data
- Type library has 10+ types with parametric geometry
- IFC upload auto-links instances to library
- Unmatched instances can be manually assigned

---

## Phase 3: Validation System (Weeks 10-12)

**Goal:** Custom validation rules with visual reports

### Week 10: Validation Engine (FastAPI)

#### Tasks:
1. **Built-in Validators**
   - [ ] Schema validation (valid IFC structure using ifcopenshell)
   - [ ] GUID uniqueness check
   - [ ] Required Psets check (e.g., IfcWall must have Pset_WallCommon)
   - [ ] Property value validation (type checks, enum ranges)
   - [ ] Spatial structure validation (Site → Building → Storeys, no orphans)

2. **Validation Endpoint**
   - [ ] Endpoint: `POST /ifc/{file_id}/validate`
   - [ ] Accept: Validation rule set (use Django BEP ValidationRule models)
   - [ ] Return: Report with pass/fail per rule, failing elements list

**Deliverables:**
- ✅ Built-in validators functional
- ✅ Validation API endpoint

### Week 11: Custom Validation Rules

#### Tasks:
1. **Rule Definition Format**
   - [ ] Define JSON schema for validation rules
   - [ ] Example: `{applies_to: ["IfcWall"], checks: [{pset: "Pset_WallCommon", property: "FireRating", required: true, allowed_values: ["REI30", "REI60", "REI90"]}]}`
   - [ ] Store in Django ValidationRule model (reuse BEP model)

2. **Rule Execution**
   - [ ] Service: Parse rule JSON
   - [ ] Check elements against rules
   - [ ] Collect failing elements
   - [ ] Return detailed report

3. **Custom Rule API**
   - [ ] Endpoint: `POST /ifc/{file_id}/validate/custom`
   - [ ] Accept: Array of rule definitions
   - [ ] Return: Validation report

**Deliverables:**
- ✅ Custom rule format defined
- ✅ Rule execution engine functional
- ✅ Custom validation API

### Week 12: Validation Report UI

#### Tasks:
1. **Report Display**
   - [ ] React component: Validation report
   - [ ] Summary: Pass/fail count per rule
   - [ ] Drill-down: Click rule → show failing elements
   - [ ] Element list with GUID, Type, Location

2. **Export Report**
   - [ ] Export to Excel (rule, status, failing element GUIDs)
   - [ ] Export to PDF (using reportlab or similar)

3. **Fix Actions**
   - [ ] Link to property editor: "Fix 12 walls missing FireRating"
   - [ ] Bulk apply: "Add Pset_WallCommon to all failing walls"

**Deliverables:**
- ✅ Validation report UI
- ✅ Export to Excel/PDF
- ✅ Fix actions integrated with property editor

**Phase 3 Success Criteria:**
- Built-in validation catches schema errors, missing Psets, invalid values
- Custom rules can be defined and executed
- Validation report UI shows pass/fail with drill-down
- Can export report to Excel/PDF

---

## Phase 4: Excel → IFC Creation (Weeks 13-15)

**Goal:** Create IFC objects from CSV/Excel/JSON with simple geometry UI

### Week 13: Object Creation from Excel

#### Tasks:
1. **Excel Template for Object Creation**
   - [ ] Template columns: Type, Name, Material, X, Y, Z, Floor, Geometry (width, height, depth), Properties...
   - [ ] Example row: IfcWall, "External Wall", Concrete, 1000, 2000, 0, Floor 1, 200, 3000, 5000, {FireRating: REI60}

2. **Creation Service (FastAPI)**
   - [ ] Endpoint: `POST /ifc/create-from-excel`
   - [ ] Parse Excel
   - [ ] For each row: Create IFC object using ifcopenshell
   - [ ] Apply properties (Psets from columns)
   - [ ] Return: Created IFC file download URL

3. **Geometry Generation**
   - [ ] Use parametric geometry (box, cylinder, cone, sphere)
   - [ ] Create IfcExtrudedAreaSolid from dimensions
   - [ ] Position at XYZ coordinates

**Deliverables:**
- ✅ Excel → IFC creation functional
- ✅ Template downloadable

### Week 14: Simple Geometry UI for Non-Programmers

#### Tasks:
1. **Form-Based Object Creation**
   - [ ] React form: Select Type (from TypeLibrary), Material, XYZ, Geometry parameters
   - [ ] Preview: Show 2D plot (plan view) with Matplotlib/Plotly
   - [ ] 3D preview: Simple Three.js render of object

2. **Batch Mode**
   - [ ] Create N instances of same type
   - [ ] Input: XYZ array (CSV or manual entry)
   - [ ] Preview: Scatter plot of all instances

3. **Integration with Warehouse**
   - [ ] When creating object, link to TypeLibrary item
   - [ ] Auto-populate geometry parameters from library
   - [ ] Auto-assign Material from library

**Deliverables:**
- ✅ Form-based object creation UI
- ✅ Batch creation mode
- ✅ Preview in 2D/3D

### Week 15: Script Integration

#### Tasks:
1. **Script Wrapper API**
   - [ ] Endpoint: `POST /ifc/scripts/run`
   - [ ] Accept: Script name, parameters (JSON)
   - [ ] Execute user's existing ifcopenshell scripts
   - [ ] Return: IFC file or modification result

2. **Script Library**
   - [ ] Store common scripts in database (Django Scripting model)
   - [ ] Examples: "Create grid lines", "Create survey points", "Create zone model"
   - [ ] UI: List scripts, select, fill parameters, run

3. **Result Viewer**
   - [ ] After script runs, display result in viewer
   - [ ] Option to download IFC or save to project

**Deliverables:**
- ✅ User scripts wrapped in API
- ✅ Script library UI
- ✅ Result viewer

**Phase 4 Success Criteria:**
- Can create IFC objects from Excel template
- Form UI allows non-programmers to create simple objects
- Batch mode creates multiple instances at once
- User's existing scripts executable from UI

---

## Phase 5: LCA Module (Weeks 16-18)

**Goal:** LCA scenarios with embodied carbon tracking and export templates

### Week 16: Design Scenarios

#### Tasks:
1. **Scenario CRUD API (Django)**
   - [ ] ViewSet for DesignScenario model
   - [ ] Endpoints: GET/POST/PATCH/DELETE `/api/lca/scenarios/`
   - [ ] Link to Project

2. **Scenario Assignment**
   - [ ] Model: ScenarioAssignment (links scenario → WarehouseInstance)
   - [ ] Fields: status (New/Existing Kept/Reused/Existing Waste), material_override, type_override
   - [ ] API: Assign status to multiple instances

3. **Scenario UI**
   - [ ] Create scenario form
   - [ ] List scenarios for project
   - [ ] Select scenario → show objects in table
   - [ ] Bulk assign status (select objects → dropdown: New/Reused/Waste)

**Deliverables:**
- ✅ Scenario CRUD API
- ✅ Scenario UI with bulk status assignment

### Week 17: LCA Dashboards

#### Tasks:
1. **Dashboard Components (Plotly)**
   - [ ] Scenario comparison bar chart (A vs B vs C embodied carbon)
   - [ ] Material breakdown pie chart (Concrete, Steel, Wood %)
   - [ ] Status breakdown bar chart (New, Reused, Waste by material)
   - [ ] Reuse percentage metric

2. **Data Aggregation**
   - [ ] API endpoint: `GET /api/lca/scenarios/{id}/summary`
   - [ ] Aggregate: Total embodied carbon by material + status
   - [ ] Calculate: Reuse % = Reused / (Reused + New)

3. **Dashboard Page**
   - [ ] React component: LCA Dashboard
   - [ ] Scenario selector (dropdown)
   - [ ] Charts: 4 visualizations
   - [ ] Export charts as PNG

**Deliverables:**
- ✅ LCA dashboards with Plotly charts
- ✅ Scenario comparison functional

### Week 18: Export Templates

#### Tasks:
1. **OneClickLCA Export**
   - [ ] Endpoint: `GET /api/lca/scenarios/{id}/export/oneclicklca`
   - [ ] Format: Excel with columns: Material, Quantity, Unit, Embodied Carbon, Status
   - [ ] Grouped by material

2. **Reduzer Export**
   - [ ] Endpoint: `GET /api/lca/scenarios/{id}/export/reduzer`
   - [ ] Format: Excel with Reduzer-compatible columns
   - [ ] Include metadata sheet

3. **Custom Export**
   - [ ] User-defined Excel template
   - [ ] Map database fields to template columns
   - [ ] Download filled template

**Deliverables:**
- ✅ OneClickLCA export template
- ✅ Reduzer export template
- ✅ Custom export configurator

**Phase 5 Success Criteria:**
- Can create scenarios A/B/C for a project
- Can assign status (New/Reused/Waste) to objects per scenario
- Dashboard shows scenario comparison with embodied carbon
- Can export to OneClickLCA/Reduzer formats

---

## Phase 6: Federated Viewer & Model Groups (Weeks 19-20)

**Goal:** Finalize federated viewer with property editing integration

### Week 19: Viewer Enhancements

#### Tasks:
1. **Model Groups**
   - [ ] Use existing ViewerGroup models
   - [ ] API: GET/POST `/api/viewers/`
   - [ ] UI: Create groups, add models to group
   - [ ] Viewer: Load multiple models from group

2. **Visibility Controls**
   - [ ] Per-model visibility toggle
   - [ ] Per-type visibility (hide all IfcWall, show all IfcColumn)
   - [ ] Color by property (e.g., color by FireRating)

3. **Element Selection**
   - [ ] Click element → select in viewer
   - [ ] Show properties panel
   - [ ] Link to property editor (bulk edit)

**Deliverables:**
- ✅ Federated viewer with model groups
- ✅ Visibility controls functional
- ✅ Element selection → properties panel

### Week 20: Property Editing Integration

#### Tasks:
1. **Select in Viewer → Edit Properties**
   - [ ] Select element(s) in viewer
   - [ ] Button: "Edit Properties"
   - [ ] Opens property editor with selected elements pre-filtered

2. **Edit → Refresh Viewer**
   - [ ] After property edit in FastAPI, re-export IFC
   - [ ] Reload in viewer
   - [ ] Highlight changed elements

3. **Polish & Testing**
   - [ ] Test full workflow: Upload → View → Edit → Export → Re-view
   - [ ] Performance testing (10,000+ elements)
   - [ ] Bug fixes

**Deliverables:**
- ✅ Viewer integrated with property editor
- ✅ Full workflow tested
- ✅ Performance optimized

**Phase 6 Success Criteria:**
- Can view federated models in groups
- Can select elements and edit properties
- Changes persist and viewer refreshes

---

## MVP Completion (Week 20)

### MVP Feature Checklist

**Core Features:**
- ✅ Bulk property editing (1000+ elements)
- ✅ Excel ↔ IFC bidirectional workflow
- ✅ Material/Type library (IFC Warehouse)
- ✅ Instance tracking across projects
- ✅ Custom validation rules
- ✅ LCA scenarios with embodied carbon
- ✅ Export to OneClickLCA/Reduzer
- ✅ Federated viewer with property editing
- ✅ Excel → IFC object creation
- ✅ Simple geometry UI for non-programmers

**Technical:**
- ✅ Django + FastAPI hybrid architecture
- ✅ Concurrent file processing
- ✅ PostgreSQL database with 20+ tables
- ✅ ThatOpen viewer with multi-model support
- ✅ Celery + Redis for async tasks

### Launch Readiness

**Documentation:**
- [ ] User guide (PDF)
- [ ] API documentation (FastAPI auto-docs + Django DRF docs)
- [ ] Video tutorials (5 core workflows)

**Testing:**
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests (end-to-end workflows)
- [ ] Performance tests (10,000+ elements)
- [ ] User acceptance testing

**Deployment:**
- [ ] Docker Compose setup (Django + FastAPI + PostgreSQL + Redis)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production deployment (AWS/DigitalOcean/Heroku)

---

## Post-MVP Roadmap (Months 6-12)

### Phase 7: BCF/RFI Integration (Weeks 21-24)
- BCF import/export
- Issue management UI
- Link BCF issues to IFC elements
- RFI workflows

### Phase 8: Advanced Dashboards (Weeks 25-28)
- PowerBI/Grafana-style analytics
- Custom dashboard builder
- Quantity takeoff analysis
- Cost/budget tracking

### Phase 9: Project Management (Weeks 29-32)
- Meeting module (agendas, minutes)
- Phasing (construction phases)
- Cost analysis
- Material orders

### Phase 10: Point Clouds (Weeks 33-36) - OPTIONAL
- Upload/view E57, LAS, LAZ
- Basic processing (SOR, subsample, crop)
- View with IFC models
- As-built vs. design comparison

### Phase 11: Advanced Features (Months 10-12)
- Clash detection
- Change tracking (version comparison)
- User authentication & permissions
- Mobile app (viewer + field data capture)

---

## Success Metrics

### MVP Success (Week 20):
- Can bulk edit properties on 10,000 elements in < 5 seconds
- Excel import/export works with 5,000 rows
- Material library has 50+ materials with LCA data
- Validation catches 100% of schema errors and 95%+ of custom rule violations
- LCA scenario comparison runs in < 10 seconds
- Export to OneClickLCA/Reduzer is accurate

### 6-Month Success:
- 10 active users (BIM managers, LCA consultants)
- 100+ projects in database
- 500+ materials in warehouse library
- 1,000+ types in library
- Positive user feedback (NPS > 50)

### 12-Month Success:
- 50 active users
- 500+ projects
- Integration with external tools (Solibri, Revit via IFC export)
- Revenue-generating (SaaS or licensing model)

---

## Risk Mitigation

### Technical Risks

**Risk:** IFC export geometry incorrect
**Mitigation:** Test early with Revit/Solibri, validate bounding box calculations with unit tests

**Risk:** FastAPI performance bottleneck with large files
**Mitigation:** Use async/await, profile with cProfile, optimize ifcopenshell operations, add caching

**Risk:** Django + FastAPI integration complexity
**Mitigation:** Clear API contracts, use Redis for async communication, test integration thoroughly

### Product Risks

**Risk:** Users don't adopt Excel workflows (prefer direct UI editing)
**Mitigation:** Offer both Excel and UI options, gather user feedback early

**Risk:** Validation rules too complex to configure
**Mitigation:** Provide pre-built rule templates, visual rule builder UI

**Risk:** LCA data not available for all materials
**Mitigation:** Make LCA data optional, allow manual entry, integrate with EPD databases

---

## Next Immediate Steps (Phase 0 Start)

1. **Debug ThatOpen Viewer** - Investigate and fix viewer issues
2. **Test IFC Parsing** - Verify existing parse service works
3. **Set up FastAPI Service** - Initialize FastAPI app and Dockerfile
4. **Create New Database Models** - MaterialLibrary, TypeLibrary, WarehouseInstance
5. **Document Current State** - Create worklog entry for Phase 0 start

**Ready to start Phase 0!**
