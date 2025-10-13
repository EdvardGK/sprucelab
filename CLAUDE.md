# BIM Coordinator Platform - Development Guide

> **For detailed project status, session history, and planning documents:**
> See `/project-management/` directory

---

## Project Overview

Professional BIM coordination platform for managing IFC model versions, tracking changes, and analyzing building data.

**Tech Stack:**
- **Backend**: Django 5.0 + DRF, PostgreSQL (Supabase), ifcopenshell 0.8.x
- **Frontend**: React 18 + TypeScript + Vite, Tailwind v4 + shadcn/ui
- **Infrastructure**: Supabase (database + storage), Redis (Celery)

**Current Phase**: Backend + Frontend operational, BEP system complete (Session 010-011)

**Key Documentation**:
- Project status: `project-management/worklog/` (latest session)
- Planning docs: `project-management/planning/`
- TODO lists: `project-management/to-do/`
- Architecture: `project-management/planning/session-002-bim-coordinator-platform.md`

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
- Celery for long operations (IFC processing)
- Never process IFC in Django request/response cycle
- Geometry NOT returned in list endpoints (too large)
- Use pagination for large element lists (100 per page)

### 3. BEP System (Session 010+)

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

### 4. Development Workflow

**Before Writing Code**:
1. Create planning document in `/project-management/planning/`
2. Update TODO list in `/project-management/to-do/`

**When Modifying Code**:
1. Save current version to `/versions/` with timestamp
2. Make changes to main file
3. Update session worklog in `/project-management/worklog/`

**Database Changes**:
1. Modify models in `apps/*/models.py`
2. Run `python manage.py makemigrations`
3. Review migration file
4. Run `python manage.py migrate`
5. Update documentation if schema changed

**Code Modularity** ⭐:
- **300-line limit**: Files exceeding 300 lines should be refactored
- Focus on modularity: extract functions, create separate modules
- Keep scripts short and sweet rather than massive behemoths
- Single responsibility principle: one file, one purpose
- If a file is hard to understand or maintain, it's too long

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
ifc-extract-3d-mesh/
├── CLAUDE.md                    # This file - rules and context
├── backend/                     # Django API
│   ├── apps/                    # Django apps
│   │   ├── bep/                # BEP system (Session 010)
│   │   ├── projects/           # Project CRUD
│   │   ├── models/             # Model management
│   │   └── entities/           # IFC entities, properties, etc.
│   └── manage.py
├── django-test/                 # Standalone test scripts
│   ├── README.md               # Script documentation
│   └── *.py                    # Test scripts
├── frontend/                    # React app (to be created)
├── versions/                    # Backup versions
├── project-management/          # ⭐ Project documentation hub
│   ├── planning/               # Implementation plans
│   ├── worklog/                # Session notes
│   ├── to-do/                  # TODO lists
│   └── quality-control/        # QC documentation
└── output/                      # Generated files (gitignored)
```

---

## API Design Patterns

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

---

## When Continuing Work

1. Read latest session worklog: `/project-management/worklog/`
2. Check TODO list: `/project-management/to-do/current.md`
3. Review planning docs if needed: `/project-management/planning/`
4. Create new planning document for major features
5. Update worklog and TODO as you progress

---

**Last Updated**: Session 011 (2025-10-13)
**Framework**: ISO 19650 + buildingSMART Norway POFIN + MMI-veileder 2.0
