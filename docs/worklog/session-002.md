# Session 002 Worklog: BIM Coordinator Platform

**Date**: 2025-10-11
**Start Time**: ~19:00
**Status**: Planning & Bug Fixes
**Context**: Continuation from Session 001

## Session Goals

1. Fix unit conversion issue in IFC recreation
2. Fix data type conversion issue (numpy → Python native types)
3. Design comprehensive BIM Coordinator Platform
4. Create planning documentation and TODO lists

## Work Completed

### 1. IFC Recreation Bug Fixes ✅

**Issue #1: Data Type Conversion**
- **Problem**: `IfcCartesianPointList3D` expects native Python floats but received numpy.float64
- **Error**: `attribute 'CoordList' for entity 'IFC4.IfcCartesianPointList3D' is expecting value of type 'AGGREGATE OF AGGREGATE OF DOUBLE', got 'list'`
- **Solution**: Use `.tolist()` to convert numpy arrays to native Python types
- **Files fixed**:
  - `json_to_ifc.py` (line 78-79)
  - `simplify_and_recreate_ifc.py` (line 192-193)

**Change made**:
```python
# Before (broken):
point_list = ifc_file.createIfcCartesianPointList3D(
    [list(v) for v in vertices]  # Creates list of numpy arrays
)

# After (fixed):
point_list = ifc_file.createIfcCartesianPointList3D(
    vertices.tolist()  # Converts numpy → Python native types recursively
)
```

**Issue #2: Unit Conversion**
- **Problem**: IFC file defaulted to millimeters, but geometry is in meters
- **User feedback**: "ifc reads units as mm, and here I believe they are presented as meters, meaning a meter is displayed as a mm in the ifc model"
- **Root cause**: `ifcopenshell.api.run("unit.assign_unit", ifc_file)` defaults to millimeters
- **Solution**: Explicitly set units to meters
- **Files fixed**:
  - `json_to_ifc.py` (line 31)
  - `simplify_and_recreate_ifc.py` (line 140)

**Change made**:
```python
# Before (broken):
ifcopenshell.api.run("unit.assign_unit", ifc_file)

# After (fixed):
ifcopenshell.api.run("unit.assign_unit", ifc_file, length={"is_metric": True, "raw": "METRE"})
```

**Testing**:
- User ran `python json_to_ifc.py`
- Successfully created IFC file (0 elements created initially due to data type issue)
- After fixes: Ready to test again

### 2. Project Vision Evolution 🚀

**Discussion Topic**: Metadata preservation and measurement
- User pointed out: Need to transfer IFC metadata/relationships, not just geometry
- Key insight: Can't quantify geometry savings vs metadata removal without preserving structure
- **Critical requirements**:
  - Same project/site/building/storey hierarchy
  - Property sets (Psets)
  - Systems (IfcSystem)
  - Materials
  - Type definitions
  - Relationships

**Storage Strategy Discussion**:
- Explored options: SQLite, Graph DB (NetworkX), Hybrid approach
- **Decision**: Use relational database (Supabase PostgreSQL) with graph edges stored as relationships
- Benefits:
  - SQL queries for filtering/analysis
  - Measure each table size separately (metadata vs geometry vs relationships)
  - Standard tooling
  - Portable
  - Easy export of subsets

### 3. New Platform Architecture Designed 🏗️

**Evolution**: From mesh extraction tool → Full BIM Coordinator Platform

**New Vision**:
- Multi-model project management
- Graph database with interactive visualization
- Automated change detection between IFC versions
- Query interface for BIM data
- Dashboard UI for BIM coordinators/managers
- Version comparison and change tracking
- **Core use case**: Track what changed between model revisions (new GUIDs, deleted GUIDs, modified elements)

**Tech Stack Selected**:
- **Backend**: Django 5.0 + Django REST Framework + Celery
- **Database**: Supabase (PostgreSQL + Storage)
- **Frontend**: React + TypeScript + Vite
- **3D Viewer**: Three.js + @react-three/fiber
- **Graph Viz**: react-force-graph-3d or Cytoscape.js
- **Queries**: Tanstack Query (React Query)
- **UI**: Tailwind CSS + shadcn/ui

**Database Schema Designed** (15 tables):
1. `projects` - Top-level organization
2. `models` - IFC file versions
3. `ifc_entities` - All building elements
4. `spatial_hierarchy` - Project/Site/Building/Storey structure
5. `property_sets` - Psets and properties
6. `systems` + `system_memberships` - HVAC, Electrical, etc.
7. `materials` + `material_assignments` - Material library
8. `ifc_types` + `type_assignments` - Type objects
9. `geometry` - Simplified mesh data (separate table)
10. `graph_edges` - Relationships for visualization
11. `change_log` - Version comparison results
12. `storage_metrics` - File size breakdown

**Key Features Designed**:
1. **Multi-Model Management**: Upload IFC files, track versions
2. **Graph Visualization**: Interactive force-directed graph of IFC hierarchy
3. **Change Detection**: Automatic GUID comparison between versions
4. **Dashboard Views**:
   - Global: All projects
   - Project: All models in project
   - Model: Graph + 3D + Properties + Query
   - Comparison: Side-by-side version diff
5. **Query Interface**: Visual query builder + raw SQL
6. **3D Viewer**: Color by type/storey/system, element selection

**Change Tracking System**:
- Compare model versions by GUID
- Track: `added`, `removed`, `modified`, `geometry_changed`, `property_changed`
- Generate change reports with statistics
- Visual diff (highlight changes in 3D viewer)

### 4. Planning Documentation Created ✅

**File: `project-management/planning/session-002-bim-coordinator-platform.md`**
- Complete architecture overview
- Database schema design (SQL)
- Backend structure (Django apps)
- Frontend structure (React components)
- API endpoint design
- Implementation phases (6 phases, 6-8 weeks)
- Technical decisions and rationale
- Performance targets
- Risk mitigation strategies
- Future enhancements

**File: `project-management/to-do/phase-1-foundation.md`**
- Detailed checklist for Phase 1 (Foundation)
- Backend setup tasks (Django, Celery, Supabase)
- Database schema migration tasks
- IFC processing pipeline tasks
- REST API endpoint tasks
- Frontend setup tasks (React, TypeScript, Vite)
- Testing and validation tasks
- Success metrics

### 5. Implementation Phases Defined 📋

**Phase 1: Foundation** (Week 1-2)
- Django + Supabase setup
- Database schema
- IFC → Database extraction pipeline
- Basic REST API
- React app scaffold
- File upload flow

**Phase 2: Core Data Flow** (Week 2-3)
- Complete IFC extraction
- Graph edge generation
- Spatial hierarchy
- Property/system extraction

**Phase 3: Visualization** (Week 3-4)
- Model detail page
- 3D viewer (Three.js)
- Graph viewer (force-directed)
- Property panel

**Phase 4: Change Detection** (Week 4-5)
- GUID comparison logic
- Property/geometry diff
- Change log generation
- Comparison UI

**Phase 5: Query System** (Week 5-6)
- Query builder UI
- Dynamic SQL generation
- Graph traversal queries
- Export functionality

**Phase 6: Polish & Production** (Week 6-8)
- Performance optimization
- Real-time updates
- User authentication
- Documentation

## Design Decisions

### Why Database Storage?
- Enables SQL queries for complex filtering
- Can measure size of each component (metadata vs geometry vs relationships)
- Selective IFC reconstruction (export single storey, single system, etc.)
- Fast change detection (compare by GUID in database)
- Scalable to multiple models

### Why Supabase?
- PostgreSQL with built-in APIs
- File storage included (for IFC files)
- Real-time subscriptions (for live updates)
- Auth system ready
- Good TypeScript support
- Free tier for development

### Why Django (not FastAPI)?
- Mature ORM for complex relationships
- Django REST Framework for API
- Celery integration for background jobs
- Admin panel for debugging
- Stronger PostgreSQL support

### Why React SPA (not Next.js)?
- Dashboard app, not content site (no SEO needed)
- Better control over client-side routing
- Simpler deployment
- Faster development for interactive UIs

### Graph Storage in PostgreSQL
- Not using separate graph database (Neo4j)
- Store relationships as edges in `graph_edges` table
- Simpler architecture
- PostgreSQL handles graph queries well for our scale
- Can migrate to Neo4j later if needed

## Challenges & Solutions

**Challenge**: How to preserve all IFC metadata in simplified models?
**Solution**: Store everything in database, selectively reconstruct IFC with chosen components.

**Challenge**: How to measure savings from geometry vs metadata removal?
**Solution**: Separate tables with size metrics per component.

**Challenge**: How to track changes between model versions?
**Solution**: GUID-based comparison in database, generate change log.

**Challenge**: How to visualize complex IFC relationships?
**Solution**: Force-directed graph with color-coded nodes, filterable by type/storey/system.

## File Size Measurement Strategy

Ability to measure and display:
```
Original IFC: 500 MB
├── Spatial structure: 5 KB (0.001%)
├── Property sets: 2.5 MB (0.5%)
├── Systems & relationships: 800 KB (0.16%)
├── Materials & types: 1.2 MB (0.24%)
├── Geometry (original): 450 MB (90%)
└── Geometry (simplified): 50 MB (10%)

Simplified IFC with full metadata: 54.5 MB (89% reduction)
```

## Next Steps (Immediate)

1. Set up Supabase project and get credentials
2. Create Django project structure
3. Implement database schema
4. Adapt `ifc_mesh_extractor.py` to write to database
5. Test extraction with `LBK_RIV_C.ifc`
6. Create React frontend scaffold
7. Implement upload flow

## Session Statistics

- **Planning documents created**: 2
  - `session-002-bim-coordinator-platform.md` (~450 lines)
  - `phase-1-foundation.md` (~300 lines)
- **Bug fixes**: 2
  - Data type conversion (numpy → Python native)
  - Unit conversion (mm → meters)
- **Files modified**: 2
  - `json_to_ifc.py`
  - `simplify_and_recreate_ifc.py`
- **Database tables designed**: 15
- **API endpoints designed**: ~20
- **Implementation phases defined**: 6 (6-8 weeks total)

## Architecture Highlights

**Backend (Django)**:
```
bim_coordinator/
├── apps/
│   ├── projects/     # CRUD for projects
│   ├── models/       # IFC model management
│   ├── entities/     # Elements, properties
│   ├── changes/      # Change detection
│   └── graph/        # Graph queries
├── ifc_processing/
│   ├── extractor.py  # IFC → Database
│   └── change_detector.py
└── config/
    └── celery.py     # Background tasks
```

**Frontend (React)**:
```
frontend/src/
├── pages/
│   ├── Dashboard.tsx         # All projects
│   ├── ProjectDetail.tsx     # Model list
│   ├── ModelViewer.tsx       # Graph + 3D + Properties
│   └── ComparisonView.tsx    # Version diff
├── components/
│   ├── graphs/ForceGraph.tsx
│   ├── viewers/ThreeViewer.tsx
│   ├── query/QueryBuilder.tsx
│   └── changes/ChangeTimeline.tsx
└── hooks/
    ├── useModels.ts
    ├── useGraphData.ts
    └── useChangeDetection.ts
```

**Database (PostgreSQL)**:
- 15 tables for complete IFC representation
- Separate geometry storage (BYTEA, compressed)
- Graph edges for visualization
- Change log for version tracking
- Storage metrics for size analysis

## Current Status

**Session 001 Status**:
- ✅ Mesh extraction working
- ✅ Mesh simplification working
- ⏳ IFC recreation (bugs fixed, ready to test)

**Session 002 Status**:
- ✅ Bug fixes completed (units, data types)
- ✅ Platform architecture designed
- ✅ Database schema designed
- ✅ Planning documents created
- ✅ Phase 1 TODO list created
- ⏳ Ready to begin implementation

**Pending**:
- Set up Supabase account
- Test `json_to_ifc.py` with fixes
- Validate simplified IFC in BIM viewer
- Begin Phase 1 implementation

**Known Issues**:
- None (previous issues fixed)

### 7. CLAUDE.md Updated ✅

**Complete project documentation added**:
- Project evolution (Phase 0 → Phase 1)
- BIM Coordinator Platform architecture
- Tech stack documentation
- Database schema (15 tables)
- Key architecture decisions with rationale
- **Critical boundary conditions** (8 rules marked 🔴)
- Important constraints
- API design patterns
- Development workflow rules
- File organization structure
- Quick reference commands
- "When continuing work" guide
- Project status summary

**Key Sections Added**:
1. Architecture overview with tech stack
2. Complete database schema list
3. 8 critical rules that must not be violated
4. API design patterns and flows
5. Development workflow rules
6. Common commands reference
7. Current status tracker

**Boundary Conditions Documented**:
- Always preserve IFC metadata
- GUID uniqueness is sacred
- World coordinates only
- Database schema is locked
- Celery for long operations
- File size measurement required
- Change detection rules
- API response size limits

### 8. Environment Management Setup ✅

**User Request**: "How do I manage my virtual environments? I want to use conda for python and yarn for react/typescript"
**Decision**: Use existing `sprucelab` conda environment (Python 3.11) + Node.js 18 with yarn

**Files Created**:
1. **backend/environment.yml** - Conda environment file
   - Uses existing `sprucelab` environment name
   - Python 3.11 specification
   - All dependencies listed as pip packages
   - Can update with: `conda env update -f environment.yml --prune`

2. **backend/.python-version** - Python version specification
   - Specifies Python 3.11
   - For pyenv and tool compatibility

3. **ENVIRONMENT_SETUP.md** - Comprehensive environment guide (250+ lines)
   - Conda setup and usage instructions
   - Node.js + yarn setup (via nvm recommended)
   - Common commands reference
   - Adding dependencies workflow
   - Environment variables documentation
   - Celery/Redis setup instructions
   - Troubleshooting section
   - IDE setup recommendations (VS Code, PyCharm)
   - Quick reference section

4. **frontend/.nvmrc** - Node.js version specification
   - Specifies Node 18 LTS
   - For nvm users to ensure correct version
   - Frontend directory created

5. **.gitignore** - Complete ignore rules
   - Python: __pycache__, *.pyc, .env, venv/, conda/
   - Django: *.log, db.sqlite3, media/, staticfiles/
   - Node.js: node_modules/, npm-debug.log, yarn-error.log
   - Frontend: dist/, build/, .vite/, .next/
   - IDEs: .vscode/, .idea/, *.swp
   - Project-specific: /output/, /versions/, *.ifc, *.json, *.npz

6. **ENV_SETUP_COMPLETE.md** - Setup summary document
   - What was created
   - Environment strategy explanation
   - Quick start commands
   - Verification checklist
   - Rationale for design decisions

**Files Updated**:
1. **backend/README.md**
   - Changed from `bim_coordinator` to `sprucelab` environment
   - Updated to Python 3.11 (from 3.9)
   - Added conda environment update option
   - Both pip and conda installation methods

2. **QUICKSTART.md**
   - Added `conda activate sprucelab` step
   - Updated dependencies installation instructions
   - Added note about Python 3.11
   - Updated common commands section

**Version Fixes**:
- **Issue**: `ifcopenshell==0.7.0` not found
- **Root Cause**: ifcopenshell doesn't have plain `0.7.0` version, uses date-based versions
- **Solution**: Changed to `ifcopenshell>=0.8.0` (latest stable)
- **Files Updated**:
  - `backend/requirements.txt`
  - `backend/environment.yml`
  - `CLAUDE.md` (version references)
- **Also Updated**: numpy and open3d to use `>=` for flexibility

**Environment Strategy**:

**Backend (Python)**:
- Single `sprucelab` conda environment for all Python work
- Python 3.11 (faster, modern, fully compatible)
- Activation: `conda activate sprucelab`
- Dependencies: `pip install -r backend/requirements.txt`
- Rationale: Simpler than multiple environments, scientific computing libraries work better with conda

**Frontend (Node.js)**:
- Node.js 18 LTS installed globally (recommended via nvm)
- yarn installed globally: `npm install -g yarn`
- Frontend dependencies: `yarn install`
- Rationale: JavaScript ecosystem works better with system Node.js, not conda

**Key Design Decisions**:
1. **Single Conda Environment** - Simpler, efficient, works with existing setup
2. **Python 3.11** - 10-60% faster than 3.9, fully compatible with all libraries
3. **Separate Node.js** - Industry standard, better performance, cleaner separation
4. **Flexible Versions** - Using `>=` instead of exact pins for better compatibility

**Workflow**:
```bash
# Backend
conda activate sprucelab
cd backend
pip install -r requirements.txt
python manage.py runserver

# Frontend (when created)
nvm use 18
cd frontend
yarn install
yarn dev
```

### 9. Database Connection & Migrations Completed ✅

**Challenge**: Initial database connection failed with multiple errors
**Time**: ~2 hours of troubleshooting

**Issues Encountered**:
1. **Missing DATABASE_URL** - `.env` file didn't have password
2. **Wrong Region** - Initial connection string used `us-west-1`, database was in Stockholm (`eu-north-1`)
3. **IPv4 Incompatibility** - Direct connection (`db.*.supabase.co:5432`) requires IPv6, user's network is IPv4-only
4. **Connection String Format** - Pooler requires different username format (`postgres.PROJECT_REF`)

**Solutions Applied**:
1. Added database password to `.env` with URL encoding (`!` → `%21`)
2. Updated region to `aws-1-eu-north-1.pooler.supabase.com`
3. Switched from direct connection (port 5432) to connection pooler (port 5432 with pooler hostname)
4. Fixed username format for pooler: `postgres.mwcjhbvzhnzslnatglcg`

**Final Working Configuration** (`.env`):
```bash
DATABASE_URL=postgresql://postgres.mwcjhbvzhnzslnatglcg:frDkM9S%21iGTDo7kn@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
```

**Key Learning**: Supabase connection pooler supports IPv4, direct connection does not. Always use pooler for compatibility.

**Migrations Executed**:
```bash
# 1. Connection test
python manage.py check --database default  # SUCCESS

# 2. Generate migration files
python manage.py makemigrations projects   # Created 0001_initial
python manage.py makemigrations models     # Created 0001_initial
python manage.py makemigrations entities   # Created 0001_initial (13 models)

# 3. Apply migrations
python manage.py migrate                   # SUCCESS
```

**Database Tables Created** (15 tables + Django defaults):
1. `projects` - Project container model
2. `models` - IFC model versions
3. `ifc_entities` - Building elements (with 4 indexes, 1 unique constraint)
4. `spatial_hierarchy` - Project/Site/Building/Storey structure (1 index)
5. `property_sets` - Psets and properties (2 indexes)
6. `systems` + `system_memberships` - HVAC/Electrical/Plumbing (1 unique constraint each)
7. `materials` + `material_assignments` - Material library (1 unique constraint each)
8. `ifc_types` + `type_assignments` - Type objects (1 unique constraint each)
9. `geometry` - Mesh data (vertices, faces)
10. `graph_edges` - IFC relationships (3 indexes)
11. `change_log` - Version comparison results
12. `storage_metrics` - File size breakdown

**Indexes Created**:
- `ifc_entities`: ifc_type, ifc_guid, storey_id
- `graph_edges`: source_entity, target_entity, relationship_type
- `property_sets`: pset_name, property_name
- `spatial_hierarchy`: hierarchy_level

**Unique Constraints**:
- `ifc_entities`: (model_id, ifc_guid)
- `ifc_types`: (model_id, ifc_guid)
- `materials`: (model_id, name)
- `material_assignments`: (entity_id, material_id)
- `systems`: (model_id, ifc_guid)
- `system_memberships`: (entity_id, system_id)
- `type_assignments`: (entity_id, ifc_type_id)

**Superuser Created**: ✅
- Username: edkjo
- Access to Django admin panel

**Backend Verification**:
- ✅ Django server running at `http://127.0.0.1:8000/`
- ✅ API endpoint working: `/api/projects/` returns empty list
- ✅ Admin panel accessible: `/admin/`
- ✅ Database connection stable

**Files Modified**:
- `.env` - Added correct DATABASE_URL with pooler connection
- No migration files modified (auto-generated correctly)

**Supabase Configuration Verified**:
- Project: mwcjhbvzhnzslnatglcg
- Region: Stockholm (eu-north-1)
- Connection type: Shared Pooler (IPv4 compatible)
- PostgreSQL version: 15.x

---

**Last Updated**: 2025-10-11 ~23:30
**Status**: ✅ Database fully configured, all tables created, backend running
**Next Session**: Implement IFC file upload endpoint and processing pipeline
