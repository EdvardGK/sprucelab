# BIM Coordinator Platform - Quick Start Guide

## What's Been Created

✅ **Supabase Project** - Database and storage ready
✅ **Django Backend Structure** - Complete project setup
✅ **Database Schema** - 15 tables for complete IFC representation
✅ **API Framework** - REST endpoints configured
✅ **Celery Integration** - Background task processing ready

## Project Structure

```
ifc-extract-3d-mesh/
├── .env                           # Environment variables (ADD YOUR DB PASSWORD!)
├── backend/                       # Django API
│   ├── config/                    # Settings and configuration
│   ├── apps/
│   │   ├── projects/              # Project management ✅
│   │   ├── models/                # IFC model management ✅
│   │   ├── entities/              # All 15 database models ✅
│   │   ├── changes/               # Change detection (placeholder)
│   │   └── graph/                 # Graph queries (placeholder)
│   ├── manage.py
│   ├── requirements.txt
│   └── README.md                  # Detailed backend docs
├── ifc_mesh_extractor.py          # Existing extraction script
├── simplify_and_recreate_ifc.py   # Mesh simplification
├── json_to_ifc.py                 # IFC recreation
└── project-management/
    ├── planning/
    │   ├── session-001-mesh-extractor.md
    │   └── session-002-bim-coordinator-platform.md  # Full architecture
    ├── to-do/
    │   ├── current.md
    │   └── phase-1-foundation.md   # Detailed checklist
    └── worklog/
        ├── session-001.md
        └── session-002.md

## Next Steps (Do This Now!)

### 1. Add Database Password to .env

Open `.env` file and replace `[YOUR-PASSWORD]` with your Supabase database password:

```env
DATABASE_URL=postgresql://postgres.mwcjhbvzhnzslnatglcg:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

**Get password from:** Supabase Dashboard → Project Settings → Database → Connection String

### 2. Activate Python Environment & Install Dependencies

```bash
# Activate your sprucelab conda environment
conda activate sprucelab

# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt
```

This will install:
- Django 5.0
- Django REST Framework
- Celery + Redis
- ifcopenshell
- Open3D
- PostgreSQL driver
- and more...

**Note**: Make sure you're using Python 3.11 in the sprucelab environment.

### 3. Run Database Migrations

```bash
# Create migration files from models
python manage.py makemigrations

# Apply migrations to Supabase database
python manage.py migrate

# Create admin user
python manage.py createsuperuser
```

This creates all 15 tables in your Supabase database:
- projects
- models
- ifc_entities
- spatial_hierarchy
- property_sets
- systems, system_memberships
- materials, material_assignments
- ifc_types, type_assignments
- geometry
- graph_edges
- change_log
- storage_metrics

### 4. Start Django Server

```bash
python manage.py runserver
```

Visit:
- **API**: http://127.0.0.1:8000/api/
- **Admin**: http://127.0.0.1:8000/admin/

### 5. Test API

Try these endpoints:

```bash
# List projects
curl http://127.0.0.1:8000/api/projects/

# Create a project
curl -X POST http://127.0.0.1:8000/api/projects/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "description": "My first BIM project"}'
```

## What Works Right Now

- ✅ Database schema created
- ✅ Projects API (CRUD operations)
- ✅ Admin panel for database management
- ✅ Supabase connection
- ⏳ File upload (not implemented yet)
- ⏳ IFC processing (not implemented yet)
- ⏳ Change detection (not implemented yet)
- ⏳ Frontend (not created yet)

## Database Schema Overview

```sql
-- Core Tables
projects              → Top-level containers
models                → IFC file versions
ifc_entities          → Building elements (walls, doors, etc.)

-- Metadata
spatial_hierarchy     → Project/Site/Building/Storey structure
property_sets         → Psets and properties
systems               → HVAC, Electrical, Plumbing systems
materials             → Material library
ifc_types             → Type definitions

-- Relationships
system_memberships    → Elements ↔ Systems
material_assignments  → Elements ↔ Materials
type_assignments      → Elements ↔ Types
graph_edges           → All IFC relationships

-- Analysis
geometry              → Mesh data (vertices, faces)
change_log            → Version comparison
storage_metrics       → File size breakdown
```

## Common Commands

```bash
# Environment (ALWAYS activate first!)
conda activate sprucelab         # Activate Python environment

# Backend
cd backend
python manage.py runserver       # Start server
python manage.py makemigrations  # Create migrations
python manage.py migrate         # Apply migrations
python manage.py createsuperuser # Create admin user
python manage.py shell           # Django shell

# Celery (for background tasks)
redis-server                     # Start Redis
celery -A config worker -l info  # Start Celery worker

# Database
python manage.py dbshell         # PostgreSQL shell
python manage.py showmigrations  # Show migration status
```

## Troubleshooting

### Can't connect to database

```bash
# Check your .env file has the correct password
# Test connection:
psql "postgresql://postgres.mwcjhbvzhnzslnatglcg:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
```

### Import errors

```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Migration conflicts

```bash
# Delete all migrations
find . -path "*/migrations/*.py" -not -name "__init__.py" -delete

# Recreate
python manage.py makemigrations
python manage.py migrate
```

## Development Workflow

1. **Make changes** to models/views
2. **Create migrations**: `python manage.py makemigrations`
3. **Apply migrations**: `python manage.py migrate`
4. **Test**: Visit http://127.0.0.1:8000/api/
5. **Check logs**: `backend/logs/django.log`

## What's Next?

See `project-management/to-do/phase-1-foundation.md` for the complete checklist.

**Immediate next tasks:**
1. ✅ Django project created
2. ✅ Database schema implemented
3. ⏳ **Run migrations** ← You are here!
4. ⏳ Implement file upload endpoint
5. ⏳ Create IFC → Database extraction
6. ⏳ Build Celery task for processing
7. ⏳ Create React frontend

## Files to Reference

- **Backend docs**: `backend/README.md`
- **Full architecture**: `project-management/planning/session-002-bim-coordinator-platform.md`
- **Phase 1 TODO**: `project-management/to-do/phase-1-foundation.md`
- **Session notes**: `project-management/worklog/session-002.md`

## Questions?

Check the planning documents or refer to:
- [Django Docs](https://docs.djangoproject.com/)
- [DRF Docs](https://www.django-rest-framework.org/)
- [Supabase Docs](https://supabase.com/docs)

---

**Status**: Backend structure complete, ready to run migrations! 🚀
