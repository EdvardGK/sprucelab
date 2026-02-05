# Sprucelab - Type-Centric BIM Intelligence Platform

> **For detailed project status, session history, and planning documents:**
> See `/docs/` directory

---

## Project Overview

**"Drop your IFC → See all your types → Verify, classify, and track."**

A platform for BIM professionals who **USE** models, not create them. IFC is treated as a simple "Layer 1" data source that powers BIM-centric workflows.

**Core Insight**: Types are the unit of coordination in BIM, not individual entities. A building has 50,000 entities but only 300-500 unique types.

**Core Value Proposition:**
- **Type Warehouse**: Extract, classify, and track types across models
- **Verification Engine**: Core rules + custom rules (per-project via ProjectConfig)
- **TypeBank**: Cross-project type intelligence (classify once, apply everywhere)
- **Excel Workflows**: Bidirectional type classification via Excel
- **LCA Export**: Material layers → Reduzer/OneClickLCA
- **3D Viewer**: Type instance navigation and filtering

**What We Are NOT:**
- NOT a modeling tool (we don't create IFC)
- NOT a clash detection platform (Solibri/Navisworks territory)
- NOT a general property editor (too broad, Excel workflows sufficient)

**Tech Stack:**
- **Backend**: Django 5.0 + DRF (TypeBank, TypeMapping, ProjectConfig) + **FastAPI** (IFC parsing, validation)
- **Database**: PostgreSQL (Supabase)
- **IFC Processing**: ifcopenshell 0.8.x (types-only extraction, 2 seconds)
- **Frontend**: React 18 + TypeScript + Vite, Tailwind v4 + shadcn/ui
- **Viewer**: ThatOpen Components + Three.js (load IFC directly, type filtering)

**Current Phase**: MVP - Type Dashboard, Verification Engine, Sandwich View

**MVP Priorities (Feb 2026):**
1. Type Dashboard - health scores, progress bars, at-a-glance status
2. Verification Engine - FastAPI validator + ProjectConfig rule resolution
3. Sandwich View - 2D material section diagram per type
4. Rule Configuration - GUI builder + JSON/YAML config files
5. Version Change Badges - new/removed/changed type indicators

**Key Documentation**:
- **PRD v2.0**: `docs/plans/PRD_v2.md` ⭐
- Project status: `docs/worklog/` (latest session)
- Planning docs: `docs/plans/`
- TODO lists: `docs/todos/`

---

## ⭐ Types-Only Architecture

### **Processing Model: Parse → Classify → Validate → Export**

**CRITICAL:** Sprucelab uses a **types-only architecture** (Session 031 breakthrough):

```
Layer 1 (Parse):    Extract TYPES ONLY (not individual entities)
                    → Fast: 2 seconds for 100MB model
                    → Stores: IFCType + instance_count + key properties
                    → Links to TypeBank (global type intelligence)
                    → Service: FastAPI /ifc/parse

Layer 2 (Classify): Type → NS3451/OmniClass classification
                    → Per-model TypeMapping
                    → Material layer composition
                    → Excel import/export
                    → Service: Django /api/types/

Layer 3 (Validate): Per-type verification against ProjectConfig rules
                    → Core rules (required Psets, properties)
                    → Custom rules (JSON/YAML or GUI)
                    → Reports issues per type
                    → Service: FastAPI /ifc/validate

Layer 4 (Export):   LCA export (Reduzer, OneClickLCA)
                    → BCF export (Phase 2)
                    → Service: Django /api/types/export-*
```

### **What We DON'T Store:**

- Individual entity data (viewer loads IFC directly)
- Entity-level properties (query FastAPI on-demand)
- Geometry (viewer handles this)

### **Key Models:**

- `IFCType`: Per-model type with instance_count
- `TypeMapping`: Type → classification (NS3451, unit, notes)
- `TypeDefinitionLayer`: Material sandwich composition
- `TypeBankEntry`: Global canonical type (cross-project)
- `TypeBankObservation`: Where types were observed
- `ProjectConfig`: Per-project validation rules

### **Performance Gains:**

| Metric | Before (Session 030) | After (Session 031) |
|--------|---------------------|---------------------|
| Parse time | 10-30 seconds | 2 seconds |
| DB rows per model | 1000s | ~100-500 types |
| Type consolidation | N/A | 63% reduction (974 → 357) |

### **Key Benefits:**
- ✅ 10-15x faster parsing (types only, not entities)
- ✅ TypeBank accumulates knowledge across projects
- ✅ Excel ↔ type classification bidirectional workflow
- ✅ Verification at type level (not entity level)
- ✅ Viewer loads IFC directly (no preprocessing)

### **Key Files:**
- `backend/apps/entities/models.py` - IFCType, TypeMapping, TypeBank models
- `backend/apps/projects/models.py` - ProjectConfig (validation rules)
- `backend/ifc-service/` - FastAPI microservice
  - `endpoints/` - IFC parsing, property queries
  - `services/` - Validation engine (to be built)
- `frontend/src/components/features/warehouse/` - Type UI components

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

### 3. Type Warehouse (TypeBank Architecture) ⭐

**Purpose:** Type-centric classification and cross-project intelligence.

**Per-Model Types:**

**IFCType** - Types extracted from each model:
- `type_guid`, `type_name`, `ifc_type` (IfcWallType, etc.)
- `instance_count` - How many entities use this type
- `has_ifc_type_object` - Whether type exists in IFC schema

**TypeMapping** - Classification per type:
- `ns3451_code` - Norwegian building classification
- `representative_unit` - pcs/m/m2/m3
- `discipline` - Derived from NS3451 (ARK/RIB/RIV/RIE)
- `mapping_status` - pending/mapped/ignored/review/followup

**TypeDefinitionLayer** - Material sandwich:
- `layer_order`, `material_name`, `thickness_mm`
- `epd_id` - Link to EPD for LCA
- Compose type's material breakdown

**Global TypeBank:**

**TypeBankEntry** - Canonical type definition:
- Identity: `(ifc_class, type_name, predefined_type, material)`
- Classification: `ns3451_code`, `discipline`, `canonical_name`
- Statistics: `total_instance_count`, `source_model_count`
- Confidence scoring based on observation count

**TypeBankObservation** - Where types appear:
- Links TypeBankEntry ↔ IFCType
- Tracks instances per observation

**TypeBankAlias** - Alternative names for same type

**Key Rules:**
- Types are identified by signature tuple, not GUID
- Same type across projects → classify once, reuse everywhere
- TypeBank is classification-only; verification rules are in ProjectConfig
- Materials/Types can exist in library WITHOUT instances (templates)
- Instances can exist WITHOUT library link (unmatched objects)

### 4. Type Classification Workflow ⭐

**Core Workflow:**
1. Upload IFC → types extracted in 2 seconds
2. Dashboard shows all types grouped by IFC class
3. User classifies types (NS3451 code, unit, notes)
4. Excel export for batch classification
5. Excel import to apply classifications

**Classification UI Modes:**
- **Focused View**: One type at a time, keyboard shortcuts (arrow keys, A=save, I=ignore)
- **Grid View**: Airtable-style editable grid for power users
- **List View**: Grouped by IFC class with 3D preview

**Keyboard Shortcuts:**
- Arrow keys: Navigate types
- `A`: Save and advance
- `F`: Flag for follow-up
- `I`: Mark as ignored
- `Shift+F`: Fullscreen viewer

### 5. Excel Integration ⭐

**Bidirectional Type Classification:**

**Types → Excel:**
1. Select model
2. Export types to Excel template
3. Template columns: IFC Class, Type Name, Instance Count, NS3451 Code, Unit, Notes, Status
4. 4 editable columns, 14 read-only metadata columns

**Excel → Types:**
1. Fill NS3451 codes in Excel (familiar tool)
2. Upload Excel
3. Backend bulk-updates TypeMapping records
4. Result dialog shows imported/updated/skipped counts

**Endpoints:**
- `GET /api/types/export-excel/?model={id}` - Download template
- `POST /api/types/import-excel/` - Upload classifications

**Rule:** Excel workflow is for TYPE CLASSIFICATION, not property editing

### 6. LCA Export (Type-Based) ⭐

**Material Composition:**
- Each type can have material layers (TypeDefinitionLayer)
- Layers define: material name, thickness (mm), EPD reference
- "Sandwich view" shows composition visually (2D diagram)

**Export Workflow:**
1. Classify types with NS3451 codes
2. Define material layers per type
3. Link layers to EPD data (optional)
4. Export to LCA tools

**Export Formats:**
- **Reduzer**: Type, Material, Quantity (instance_count × unit), EPD
- **OneClickLCA**: Similar structure with OneClickLCA field mapping

**Endpoint:** `GET /api/types/export-reduzer/?model={id}`

**Rule:** LCA export requires:
- NS3451 classification (for categorization)
- Material layers (for carbon calculation)
- Representative unit (pcs/m/m2/m3)

**Note:** Design scenarios (A/B/C comparison) are Phase 2

### 7. Verification Engine (MVP Priority) ⭐

**Per-Project Rules via ProjectConfig:**
- Core rules (built-in): Required Psets, required properties, classification completeness
- Custom rules (user-defined): Property constraints, naming conventions

**Rule Configuration:**
- GUI builder for visual rule editing
- JSON/YAML config files for power users and version control
- Both read/write same ProjectConfig model

**Output:**
- Per-type validation status (green/yellow/red)
- Issue list with rule ID, message, severity
- Health score (% types verified)

**Phase 2:** BCF export from verification failures

### 8. BEP System - DEPRIORITIZED

*The BEP system (Session 010) is too complex for MVP. Core validation concepts moved to simpler ProjectConfig + Verification Engine.*

**If needed later:**
- MMI Scale based on Norwegian MMI-veileder 2.0
- 7 BEP models exist in codebase (BEPConfiguration, ValidationRule, etc.)
- Can be re-enabled if market demands full BEP compliance

### 9. Development Workflow

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

**Git Push** (when authentication fails):
```bash
# Use GITHUB_SECRET from .env
git push https://<GITHUB_SECRET>@github.com/EdvardGK/sprucelab.git main
```

---

## 3D Viewer Controls (ThatOpen Components)

The BIM viewer uses ThatOpen Components v2.4.11 with Three.js. These controls apply to all viewer instances (UnifiedBIMViewer, TypeInstanceViewer, etc.).

### Mouse Controls

| Action | Effect |
|--------|--------|
| **Left click** | Select element |
| **Left drag** | Rotate camera (orbit) |
| **Right drag** | Pan camera |
| **Scroll wheel** | Zoom in/out |
| **Double-click (left)** | Select + Zoom to element (animated) |
| **Double-click (middle)** | Fit all models to view |
| **Right-click on surface** | Open context menu (section plane options) |

### Selection Behavior

Selection uses drag detection to prevent accidental selections during camera movement:
- `CLICK_THRESHOLD_PX = 5` - Max pixels moved to count as click
- `CLICK_THRESHOLD_MS = 250` - Max milliseconds for a click

### Section Plane Controls

Up to 4 color-coded section planes (red, green, blue, yellow).

**Creating Section Planes:**
- Right-click on any surface → Context menu → Add section plane
- Plane orientation: Horizontal, Vertical-X, Vertical-Z, or Parallel to clicked surface

**Keyboard Shortcuts (when section plane is active):**

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete active section plane |
| `Escape` | Deselect active plane |
| `1-4` | Quick-select planes 1-4 |
| `←` / `→` | Rotate horizontally (around Y axis) |
| `↑` / `↓` | Tilt vertically (up/down) |
| `F` | Flip plane direction |
| `Q` | Rotate 90° horizontally |
| `E` | Push plane (clip more, see deeper) |
| `R` | Pull plane (clip less, see more) |
| + `Shift` | 50% finer control for rotation/movement |

**Mouse + Keyboard:**
- `Shift + Scroll` on active plane: Move plane along its normal (distance scales with camera distance)

### Camera Configuration

```typescript
// Camera controls
controls.dollySpeed = 1.5;
controls.minDistance = 0.1;  // Allow very close zoom
controls.maxDistance = 2000; // Handle large models

// Clipping planes
camera.near = 0.01;  // 1cm - allows detail inspection
camera.far = 5000;   // 5km - handles large sites
```

### Zoom-to-Element Logic

When double-clicking or navigating instances:
1. Compute bounding box of selected element(s)
2. Use 2x size multiplier for comfortable viewing
3. Maintain current camera viewing angle
4. Animate transition with `controls.setLookAt(..., true)`

```typescript
const maxDim = Math.max(size.x, size.y, size.z, 2); // Min 2m
const distance = Math.max(maxDim * 2.0, 5);         // At least 5m away
```

### Implementation Files

- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` - Main viewer
- `frontend/src/hooks/useSectionPlanes.ts` - Section plane logic
- `frontend/src/components/features/viewer/ViewerContextMenu.tsx` - Context menu
- `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx` - Instance preview

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
