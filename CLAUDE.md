# Sprucelab - IFC Property Editing Platform

> **For detailed project status, session history, and planning documents:**
> See `/docs/` directory

---

## Project Overview

**IFC property editing and data manipulation platform** with bulk editing, material/type library ("IFC Warehouse"), LCA workflows, and validation.

**Core Value Proposition:**
- Bulk edit IFC properties across thousands of objects
- Bidirectional Excel ↔ IFC workflows
- Material/Type library with LCA data and state tracking
- Custom validation rules (Norwegian standards: MMI, NS-3451)
- Create IFC objects from structured data (CSV/Excel/JSON)
- LCA scenarios with embodied carbon tracking

**Tech Stack:**
- **Backend**: Django 5.0 + DRF (API, database, project management) + **FastAPI microservice** (IFC processing)
- **Database**: PostgreSQL (Supabase)
- **IFC Processing**: ifcopenshell 0.8.x (existing scripts wrapped with UI)
- **Frontend**: React 18 + TypeScript + Vite, Tailwind v4 + shadcn/ui
- **Viewer**: ThatOpen Components + Three.js (federated multi-model)
- **Infrastructure**: Celery + Redis (async tasks), Docker (FastAPI service)

**Current Phase**: MVP rebuild - Property editing focus, debugging existing viewer/parsing

**Key Documentation**:
- Project status: `docs/worklog/` (latest session)
- Planning docs: `docs/plans/`
- TODO lists: `docs/todos/`
- Architecture: `docs/plans/session-002-bim-coordinator-platform.md`
- **Layered Processing**: `docs/knowledge/LAYERED_ARCHITECTURE_IMPLEMENTATION.md` ⭐

---

## ⭐ Layered Architecture (Updated for Property Editing)

### **Processing Model: Parse → Enrich → Validate → Export**

**CRITICAL:** All IFC processing uses a **layered architecture**:

```
Layer 1 (Parse):    Extract metadata ONLY (GUID, type, name, properties)
                    → ALWAYS succeeds (unless file corrupt)
                    → Fast: 5-15 seconds
                    → NO GEOMETRY (viewer loads IFC/Fragments directly)
                    → Service: Django services/parse.py OR FastAPI /ifc/open

Layer 2 (Enrich):   Add/edit properties, assign to warehouse library, Excel import
                    → Bulk property editing
                    → Material/Type assignment
                    → State tracking (New/Reused/Waste)
                    → Service: FastAPI /ifc/properties/bulk-edit

Layer 3 (Validate): Quality checks (custom rules, required Psets, value ranges)
                    → REPORTS issues, doesn't fail
                    → Fast: 5-30 seconds
                    → Service: FastAPI /ifc/validate

Layer 4 (Export):   Write modified IFC with updated properties
                    → GUID preservation
                    → Incremental updates (only changed properties)
                    → Service: FastAPI /ifc/export
```

### **Status Tracking:**

**Model-level statuses:**
- `parsing_status`: pending/parsing/parsed/failed (Layer 1)
- `enrichment_status`: pending/enriching/enriched/failed (Layer 2) - NEW
- `validation_status`: pending/validating/completed/failed (Layer 3)
- `export_status`: pending/exporting/exported/failed (Layer 4) - NEW
- `geometry_status`: DEPRECATED (viewer loads directly)

**Entity-level status:**
- `IFCEntity.enrichment_status`: pending/enriched/manual_review - NEW
- `IFCEntity.validation_status`: valid/invalid/warning - NEW

### **Key Benefits:**
- ✅ Metadata persists even if geometry fails
- ✅ 10-100x faster metadata extraction (bulk inserts)
- ✅ Bulk property editing across thousands of objects
- ✅ Excel ↔ IFC bidirectional workflow
- ✅ Validation before export prevents broken files
- ✅ Optional/deferred geometry extraction

### **Files:**
- `backend/apps/models/services/parse.py` - Layer 1 (Django)
- `backend/ifc-service/` - Layers 2-4 (FastAPI microservice)
  - `endpoints/ifc_operations.py` - IFC CRUD operations
  - `services/property_editor.py` - Bulk property editing
  - `services/validator.py` - Validation engine
  - `services/exporter.py` - IFC reconstruction
- `docs/knowledge/LAYERED_ARCHITECTURE_IMPLEMENTATION.md` - Full documentation

---

## Critical Rules

### 1. IFC Data Integrity

**GUID Uniqueness**:
- IFC GlobalId (GUID) is 22-character unique identifier
- NEVER modify or reassign GUIDs
- GUIDs persist across model versions for change tracking

**World Coordinates**:
- ALL geometry extracted in world coordinates (`USE_WORLD_COORDS=True`)
- No local transforms or rotation matrices in output

**Metadata Preservation**:
- Always extract complete spatial hierarchy (Project/Site/Building/Storey)
- Extract ALL property sets (Psets)
- Extract systems, materials, types
- Do NOT create simplified IFC without metadata option

### 2. Database Architecture

**Schema Stability**:
- 15 tables defined (see planning docs)
- Changes require migration file + documentation update
- Database constraint: UNIQUE(model_id, ifc_guid)

**Performance**:
- Celery + Redis for long operations (IFC processing)
- Never process IFC in Django request/response cycle
- Geometry NOT returned in list endpoints (too large)
- Use pagination for large element lists (100 per page)

### 3. IFC Warehouse (Material/Type Library) ⭐

**Purpose:** Database-backed library of materials and types with LCA data, state tracking, and instance tracking.

**MaterialLibrary Model:**
- Name, category (Concrete, Steel, Wood, etc.), manufacturer
- Flexible properties (JSON field)
- LCA data: embodied_carbon (kg CO2e/unit), EPD reference
- Media: photos (URLs), documents (datasheets, certificates)
- State: New, Existing Kept, Reused, Existing Waste

**TypeLibrary Model:**
- Name, IFC type (IfcWall, IfcColumn, etc.), type name
- Material link (FK to MaterialLibrary)
- Parametric geometry: `{type: "box", width: 200, height: 3000, ...}`
- Default Psets (property templates for this type)
- Preview image (3D preview render using Three.js)
- Instance tracking: `[{project_id, model_id, guid}, ...]`

**WarehouseInstance Model:**
- Links warehouse items to actual IFC objects in projects
- FK to TypeLibrary, MaterialLibrary, Project, Model
- `ifc_guid` (22-char GlobalId)
- Custom properties (instance-specific overrides)
- Location (XYZ, floor, zone)
- Comments, photos (instance-specific)

**Key Rules:**
- Each instance MUST have a WarehouseInstance record if linked to library
- GUIDs from IFC objects are immutable and used for tracking
- Materials/Types can exist in library WITHOUT instances (templates)
- Instances can exist WITHOUT library link (unmatched objects)

### 4. Bulk Property Editing ⭐

**Core Workflow:**
1. User selects IFC file or model in database
2. Query builder: Filter elements (type, floor, material, custom query)
3. Property table: Show selected elements × properties (editable grid)
4. Bulk edit: Select column, apply value to all rows
5. Preview changes before applying
6. Export modified IFC

**Features:**
- Multi-select elements (by filter or manual selection)
- Edit single property across 100s/1000s of elements
- Add/remove entire Psets (e.g., add Pset_WallCommon to all walls)
- Undo/redo support
- Validation before write (prevents broken IFC files)

**Backend:** FastAPI microservice `/ifc/properties/bulk-edit`
**Frontend:** React data grid (TanStack Table) with cell editing

**Rule:** ALWAYS validate property types/values before writing to IFC (use validation layer)

### 5. Excel Integration ⭐

**Bidirectional Workflow:**

**IFC → Excel:**
1. User selects IFC file
2. Choose elements (filter or all)
3. Generate Excel template with columns: GUID, Type, Name, Properties...
4. User edits in Excel (familiar tool)
5. Re-upload Excel to apply changes

**Excel → IFC:**
1. User downloads Excel template (pre-configured columns)
2. Fills template with data (Type, Material, X, Y, Z, Floor, Properties...)
3. Uploads filled template
4. Backend creates IFC objects using ifcopenshell scripts
5. Preview in viewer (Matplotlib/Plotly scatter plot)
6. Export IFC

**Template Format:**
- Required columns: Type, Name (or GUID for existing objects)
- Optional columns: Material, X, Y, Z, Floor, custom properties
- Each row = one IFC object
- Pset columns: `Pset_WallCommon.FireRating`, `Pset_WallCommon.IsExternal`

**Rule:** Column mapping MUST be flexible (fuzzy matching for common variations)

### 6. LCA Workflows ⭐

**Design Scenarios:**
- Create multiple scenarios (Scenario A, B, C) per project
- Each scenario assigns status + material/type to objects
- Status: New, Existing Kept, Reused, Existing Waste

**ScenarioAssignment Model:**
- FK to DesignScenario, WarehouseInstance
- Status override (New/Reused/Waste)
- Material override (FK to MaterialLibrary - "what if we use timber instead of concrete?")
- Type override (FK to TypeLibrary)

**Dashboards (Plotly/Grafana-style):**
- Scenario comparison (A vs B vs C)
- Embodied carbon by material + status
- Material breakdown (pie charts)
- Reuse percentage: Reused / (Reused + New)
- Cost comparison (if cost data in material library)

**Export Templates:**
- OneClickLCA format: Material, Quantity, Unit, Embodied Carbon, Status
- Reduzer format: Similar structure, Reduzer-compatible column names

**Rule:** LCA data is OPTIONAL - warehouse can be used without embodied carbon data

### 7. BEP System (Session 010+) - NOT MVP PRIORITY

**MMI Scale**:
- Based on Norwegian MMI-veileder 2.0 (October 2022)
- Flexible range: 0-2000 (standard uses 25-point increments)
- Official scale: 19 levels (0, 100, 125, 150...500, 600)
- Projects can define custom levels
- Database stores: mmi_level, name, name_en, description, color_hex, color_rgb

**BEP Components** (7 models):
1. BEPConfiguration - Main BEP document
2. TechnicalRequirement - IFC schema, coordinate system, units
3. MMIScaleDefinition - Model maturity levels (0-2000 range)
4. NamingConvention - File/element naming rules
5. RequiredPropertySet - Required Psets per IFC type
6. ValidationRule - Quality control checks
7. SubmissionMilestone - Delivery milestones

### 8. Development Workflow

**Before Writing Code**:
1. Create planning document in `/docs/plans/` with timestamp format: `yyyy-mm-dd-hh-mm_Description.md`
2. Update TODO list in `/docs/todos/`

**When Modifying Code**:
1. Make changes to code files directly
2. Update session worklog in `/docs/worklog/` with timestamp format

**Database Changes (Django)**:
1. Modify models in `apps/*/models.py`
2. Run `python manage.py makemigrations`
3. Review migration file
4. Run `python manage.py migrate`
5. Update documentation if schema changed

**FastAPI Service Changes**:
1. Add/modify endpoints in `ifc-service/endpoints/`
2. Add/modify services in `ifc-service/services/`
3. Update Pydantic models in `ifc-service/models/`
4. Test with FastAPI auto docs (`/docs` endpoint)
5. Update Django integration if needed

**Code Modularity** ⭐:
- **Thresholds**: Under 500 lines is fine, 500-800 review for splits, over 800 consider refactoring
- **Cohesion matters more than length**: Related models/ViewSets can exceed limits
- **Django patterns**: Keep related models together, keep ViewSets intact
- **Natural boundaries**: Only split when clear logical separations exist
- **Single responsibility**: One file, one clear purpose (domain/subsystem)
- **Maintainability**: If hard to navigate or causes conflicts, consider splitting

### 5. Django Test Scripts ⭐

**Purpose**: Standalone Python scripts for testing Django models/operations

**Location**: `/django-test/` directory

**Requirements**:
- Scripts MUST initialize Django environment themselves
- Scripts MUST be runnable with `python script.py` (no shell piping)
- Scripts MUST work on Windows PowerShell
- Scripts MUST NOT require Django shell or bash redirection

**Template Pattern**:
```python
import os
import sys
import django

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# Now import Django models
from apps.bep.models import BEPConfiguration

# Script logic here...
```

**Usage**:
```bash
# From project root (recommended)
python django-test/script_name.py

# Or from backend directory
cd backend
python ../django-test/script_name.py
```

**Documentation**: See `django-test/README.md` for available scripts

---

## Key Architecture Decisions

### Database Storage Over Files
- Store ALL IFC data in PostgreSQL, not just geometry
- Enables SQL queries, change detection, selective reconstruction
- Can measure size contribution of each layer

### GUID-Based Change Detection
- Track changes by comparing IFC GlobalId between versions
- Change types: added, removed, modified, geometry_changed, property_changed

### Graph Storage in PostgreSQL
- Store relationships as edges in `graph_edges` table
- PostgreSQL handles graph queries well for our scale
- Can migrate to Neo4j later if needed

### Separate Geometry Storage
- Geometry in separate table with BYTEA (compressed numpy arrays)
- Enables measuring size separately, optional loading

### React SPA (Not Next.js)
- Client-side React app (no server-rendering needed)
- Dashboard app (no SEO needed)
- Better for interactive UIs

---

## File Organization

```
sprucelab/
├── CLAUDE.md                    # This file - rules and context
├── PLAN.md                      # Implementation roadmap (MVP phases)
├── backend/                     # Django API (Project/Model metadata, user mgmt)
│   ├── config/                 # Django settings + Celery config
│   ├── apps/                   # Django apps
│   │   ├── projects/          # Project CRUD
│   │   ├── models/            # Model management + upload
│   │   ├── entities/          # IFC entities, properties (read-only from FastAPI)
│   │   ├── warehouse/         # ⭐ NEW: Material/Type library models
│   │   ├── lca/               # ⭐ NEW: Design scenarios, LCA workflows
│   │   ├── scripting/         # Scripting system (run predefined scripts)
│   │   ├── viewers/           # 3D viewer groups
│   │   ├── bep/               # BEP system (not MVP priority)
│   │   └── graph/             # Graph queries (not MVP priority)
│   ├── ifc-service/            # ⭐ NEW: FastAPI microservice (IFC processing)
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── endpoints/
│   │   │   ├── ifc_operations.py    # POST /ifc/open, /ifc/export
│   │   │   ├── property_editor.py   # POST /ifc/properties/bulk-edit
│   │   │   ├── validator.py         # POST /ifc/validate
│   │   │   └── excel_integration.py # POST /ifc/import-excel, /ifc/export-excel
│   │   ├── services/
│   │   │   ├── ifc_parser.py        # ifcopenshell file operations
│   │   │   ├── bulk_editor.py       # Bulk property editing logic
│   │   │   ├── validation_engine.py # Validation rules execution
│   │   │   └── ifc_exporter.py      # IFC reconstruction
│   │   ├── models/              # Pydantic models for API
│   │   ├── utils/
│   │   └── Dockerfile           # Docker container for deployment
│   └── manage.py
├── frontend/                    # React + TypeScript frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── PropertyEditor.tsx   # ⭐ Bulk property editing grid
│   │   │   ├── WarehouseLibrary.tsx # ⭐ Material/Type library UI
│   │   │   ├── ExcelImport.tsx      # ⭐ Excel upload/download
│   │   │   ├── LCADashboard.tsx     # ⭐ LCA scenarios + charts
│   │   │   ├── ValidationReport.tsx # ⭐ Validation results
│   │   │   └── UnifiedBIMViewer.tsx # ThatOpen viewer (existing)
│   │   └── ...
│   └── package.json
├── django-test/                 # Standalone test scripts
├── docs/                        # ⭐ Project documentation hub
│   ├── worklog/                # Session notes (yyyy-mm-dd-hh-mm format)
│   ├── plans/                  # Implementation plans
│   ├── research/               # Research materials
│   ├── todos/                  # TODO lists
│   ├── knowledge/              # Technical documentation, architecture decisions
│   └── archive/                # Old/superseded docs
└── archive/                     # Legacy scripts and setup files
```

---

## API Design Patterns

### Django REST API (Project/Model Metadata)

**Standard Endpoints**:
```
GET    /api/{resource}/                    # List (paginated)
POST   /api/{resource}/                    # Create
GET    /api/{resource}/{id}/               # Detail
PATCH  /api/{resource}/{id}/               # Partial update
DELETE /api/{resource}/{id}/               # Delete
GET    /api/{resource}/{id}/{action}/      # Custom action
```

**File Upload Flow**:
1. POST /api/models/upload/ → Returns model_id, starts Celery task
2. GET /api/models/{id}/status/ → Poll for status
3. GET /api/models/{id}/ → Get full model data when ready

### FastAPI Microservice (IFC Processing)

**IFC Operations**:
```
POST   /ifc/open                          # Load IFC file, return element tree
GET    /ifc/{file_id}/elements            # List elements with properties (paginated)
GET    /ifc/{file_id}/elements/{guid}    # Get single element details
```

**Property Editing**:
```
POST   /ifc/{file_id}/properties/bulk-edit    # Bulk update properties
POST   /ifc/{file_id}/psets/add                # Add property set to elements
POST   /ifc/{file_id}/psets/remove             # Remove property set from elements
GET    /ifc/{file_id}/properties/preview      # Preview changes before applying
```

**Validation**:
```
POST   /ifc/{file_id}/validate                # Run validation rules
GET    /ifc/{file_id}/validation/report      # Get validation report
POST   /ifc/{file_id}/validate/custom        # Run custom validation rules
```

**Excel Integration**:
```
POST   /ifc/{file_id}/export-excel           # IFC → Excel template
POST   /ifc/import-excel                     # Excel → IFC objects
GET    /ifc/templates/excel                  # Download blank Excel template
```

**Export**:
```
POST   /ifc/{file_id}/export                 # Write modified IFC
GET    /ifc/exports/{export_id}/status       # Poll export status
GET    /ifc/exports/{export_id}/download     # Download exported IFC
```

**Communication:** Django → FastAPI via internal HTTP or message queue (Redis)

---

## Quick Start

**Backend Setup**:
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Load BEP Templates** (Session 010+):
```bash
cd backend
python manage.py load_bep_templates --template=all
```

**Run Test Scripts**:
```bash
# From project root
python django-test/verify_mmi_templates.py
```

---

## Important Constraints

**Backend**:
- **Max File Upload**: 1GB IFC files
- **Processing Timeout**: 30 minutes per Celery task
- **Parallel Processing**: Sequential mode for large files (>100MB)
- **Database Pooling**: Use Supabase connection pooler (port 6543)

**Frontend**:
- **CORS**: Whitelist React dev server (localhost:5173)
- **Bundle Size**: ~1.2MB is expected for BIM platform (Three.js, graph libs)
- **Optimization**: Use dynamic imports for heavy features
- **Dev Server**: `yarn dev` (Vite), builds in ~9s with `yarn build`
- **Dashboard Layout**: All dashboards MUST fit dynamically within the viewport - users should not need to scroll to see the complete UI.
  - **Container**: `h-[calc(100vh-X)]` for height (X = header/nav), `overflow-hidden`, `p-[clamp(0.5rem,2vw,1.5rem)]`
  - **Grid**: `flex-1` with `min-h-0`, CSS Grid with `fr` units for proportional rows
  - **Cards**: `flex flex-col overflow-hidden`, `flex-1 overflow-y-auto min-h-0` for content
  - **Content sizing with clamp()**: ALL text, icons, spacing, and padding MUST use `clamp(min, preferred, max)` for dynamic scaling:
    - Headings: `text-[clamp(1rem,3vw,1.5rem)]`
    - Body text: `text-[clamp(0.625rem,1.2vw,0.75rem)]`
    - Small text: `text-[clamp(0.5rem,1vw,0.625rem)]`
    - Icons: `h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]`
    - Padding/gaps: `p-[clamp(0.5rem,1.5vw,1rem)]`, `gap-[clamp(0.5rem,1.5vw,1rem)]`
    - Metrics: `text-[clamp(1.5rem,4vw,2rem)]`

### Internationalization (i18n)

**CRITICAL**: ALL user-facing text MUST use the i18n system. NEVER hardcode strings.

**Setup**: `react-i18next` with locale files in `frontend/src/i18n/locales/`
- `en.json` - English (fallback)
- `nb.json` - Norwegian Bokmål (primary)

**Usage in components**:
```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return <p>{t('common.save')}</p>;  // ✅ Correct
  // return <p>Save</p>;             // ❌ Wrong - hardcoded
}
```

**Adding new translations**:
1. Add key to BOTH `en.json` AND `nb.json`
2. Use nested keys for organization: `"section.subsection.key"`
3. Use interpolation for dynamic values: `t('stats.count', { count: 5 })`

**Backend API messages**:
- Return translation keys, not translated strings
- Frontend handles translation based on user language
- Example: `{ "error_key": "model.upload.olderVersion" }`

**Structure in locale files**:
```json
{
  "common": { "save": "Lagre", "cancel": "Avbryt" },
  "nav": { "home": "Hjem", "projects": "Prosjekter" },
  "model": {
    "upload": {
      "title": "Last opp IFC-modell",
      "olderVersion": "Denne modellen er eldre enn nåværende versjon"
    }
  }
}
```

---

## When Continuing Work

1. Read latest session worklog: `/docs/worklog/`
2. Check TODO list: `/docs/todos/current.md`
3. Review planning docs if needed: `/docs/plans/`
4. Create new planning document for major features (use timestamp format)
5. Update worklog and TODO as you progress

## Error Handling

**CRITICAL**: Follow these principles from root standards:
- **NEVER create fallbacks or use mock data** that obscures errors or real issues
- **Fail loudly and explicitly** when something goes wrong
- **Surface errors** to make problems visible during development
- **Real problems are better than fake solutions** - expose them immediately
- Log errors with sufficient context for troubleshooting

---

## SpruceKit Learning Integration

This project is part of the SpruceKit Learning curriculum. When working on Sprucelab:

**Document Learnings**: When specific examples, edge cases, or lessons emerge during development, add them to `/home/edkjo/dev/SpruceLearning/` in the appropriate location:
- Architecture decisions and rationale
- Framework-specific gotchas (Django, FastAPI, React, IfcOpenShell)
- BIM/IFC domain knowledge and patterns
- Performance optimizations discovered
- Common mistakes and how to avoid them

**Examples to capture**:
- "Django ORM N+1 query issue when loading IFC entities with properties"
- "IfcOpenShell memory leak when not closing file handles"
- "Why validation belongs in FastAPI, not Django"
- "Pydantic vs Django serializers: when to use which"

**Format**: Create concise, practical entries with:
1. The problem/question
2. The solution/answer
3. Code example if applicable
4. Why it matters

---

## Django vs FastAPI: When to Use Which

**Common Misconception**: Django is NOT designed for heavy file processing or CPU-intensive work.

### Django is for:
- User authentication, sessions, permissions
- CRUD operations on relational data
- Admin interfaces
- ORM-based queries and relationships
- Request/response web patterns
- Project/model metadata management

### FastAPI is for:
- Heavy file I/O (large IFC files, streaming)
- CPU-bound processing (IfcOpenShell parsing)
- Async operations (validation pipelines)
- Stateless processing services
- Operations that need horizontal scaling
- Long-running tasks without Celery overhead

### Why This Matters for BIM:
- IFC files can be 500MB+; Django's request/response cycle isn't built for this
- IfcOpenShell parsing is blocking/CPU-bound; FastAPI handles process pools better
- Validation is stateless; doesn't need Django's ORM
- FastAPI services can scale independently from the Django coordination layer

**Rule**: Django coordinates, FastAPI processes.

---

**Last Updated**: 2025-12-12 (Architecture clarification: Django vs FastAPI roles)
**Framework**: ifcopenshell + Norwegian Standards (MMI-veileder 2.0, NS-3451)
**Platform**: POP!_OS Linux
**Architecture**: Django + FastAPI Microservices + React + PostgreSQL
