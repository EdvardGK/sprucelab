# BIM Coordinator Platform - Backend

Django REST API backend for the BIM Coordinator Platform.

## Tech Stack

- **Django 5.0** - Web framework
- **Django REST Framework** - API framework
- **PostgreSQL** (Supabase) - Database
- **Celery** - Background task processing
- **Redis** - Message broker for Celery
- **ifcopenshell** - IFC file processing
- **Open3D** - Geometry processing

## Project Structure

```
backend/
├── config/              # Django settings and configuration
│   ├── settings.py      # Main settings
│   ├── urls.py          # URL routing
│   ├── celery.py        # Celery configuration
│   ├── wsgi.py          # WSGI application
│   └── asgi.py          # ASGI application
├── apps/
│   ├── projects/        # Project management
│   ├── models/          # IFC model management
│   ├── entities/        # IFC entities and related models
│   ├── changes/         # Change detection
│   └── graph/           # Graph queries
├── manage.py            # Django management script
└── requirements.txt     # Python dependencies
```

## Database Schema

The platform uses 15 PostgreSQL tables:

1. **projects** - Top-level project containers
2. **models** - IFC file versions
3. **ifc_entities** - Building elements (walls, doors, etc.)
4. **spatial_hierarchy** - Project/Site/Building/Storey structure
5. **property_sets** - IFC property sets
6. **systems** - HVAC, Electrical, etc.
7. **system_memberships** - Element-system relationships
8. **materials** - Material library
9. **material_assignments** - Element-material relationships
10. **ifc_types** - Type objects (WallType, DoorType, etc.)
11. **type_assignments** - Element-type relationships
12. **geometry** - Mesh geometry data
13. **graph_edges** - Relationships for visualization
14. **change_log** - Version comparison results
15. **storage_metrics** - File size breakdown

## Setup Instructions

### 1. Prerequisites

- Python 3.11 (via conda)
- PostgreSQL (Supabase account)
- Redis server
- Existing `sprucelab` conda environment

### 2. Environment Setup

**Using existing sprucelab environment:**

```bash
# Activate your existing sprucelab environment
conda activate sprucelab

# Verify Python version
python --version  # Should show Python 3.11.x
```

**If you don't have sprucelab environment yet:**

```bash
# Create it
conda create -n sprucelab python=3.11
conda activate sprucelab
```

### 3. Install Dependencies

**Option A: Using pip (Recommended)**
```bash
cd backend
pip install -r requirements.txt
```

**Option B: Using conda environment file**
```bash
conda env update -f environment.yml --prune
```

### 4. Configure Environment Variables

Edit the `.env` file in the project root:

```env
# .env
# Database (Supabase)
DATABASE_URL=postgresql://postgres.mwcjhbvzhnzslnatglcg:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# Celery (default: Redis on localhost)
CELERY_BROKER_URL=redis://localhost:6379/0
```

Get your Supabase password from:
**Supabase Dashboard → Project Settings → Database → Connection String**

### 5. Run Migrations

```bash
# Create migration files
python manage.py makemigrations

# Apply migrations to database
python manage.py migrate

# Create superuser for admin panel
python manage.py createsuperuser
```

### 6. Start Development Server

```bash
# Start Django server
python manage.py runserver

# Server will be available at http://127.0.0.1:8000
```

### 7. Start Celery Worker (separate terminal)

```bash
# Make sure Redis is running first
redis-server

# Start Celery worker
celery -A config worker --loglevel=info
```

## API Endpoints

### Projects

- `GET /api/projects/` - List all projects
- `POST /api/projects/` - Create project
- `GET /api/projects/{id}/` - Get project detail
- `PATCH /api/projects/{id}/` - Update project
- `DELETE /api/projects/{id}/` - Delete project
- `GET /api/projects/{id}/models/` - Get all models in project
- `GET /api/projects/{id}/statistics/` - Get project statistics

### Models

- `GET /api/models/` - List models
- `POST /api/models/upload/` - Upload IFC file
- `GET /api/models/{id}/` - Get model detail
- `GET /api/models/{id}/status/` - Get processing status
- `DELETE /api/models/{id}/` - Delete model

### Entities

- `GET /api/entities/?model_id={id}` - List entities
- `GET /api/entities/{id}/` - Get entity detail with properties

### Changes

- `GET /api/changes/{model_id}/` - Get changes for model
- `POST /api/changes/compare/` - Compare two model versions

### Graph

- `GET /api/graph/{model_id}/nodes/` - Get graph nodes
- `GET /api/graph/{model_id}/edges/` - Get graph edges

## Admin Panel

Access the Django admin panel at http://127.0.0.1:8000/admin

Login with the superuser credentials you created.

## Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=apps --cov-report=html
```

## Development Workflow

1. Make changes to models/views/serializers
2. Create migrations if models changed: `python manage.py makemigrations`
3. Apply migrations: `python manage.py migrate`
4. Test API with Django browsable API or Postman
5. Check logs in `logs/django.log`

## Troubleshooting

### Database Connection Error

- Check that you've added the correct password to `.env`
- Verify Supabase project is running
- Check connection string format

### Celery Not Working

- Ensure Redis is running: `redis-cli ping` (should return PONG)
- Check Celery worker logs
- Verify REDIS_URL in `.env`

### Migration Errors

- Delete all migration files except `__init__.py`
- Run `python manage.py makemigrations` again
- If still failing, check model field definitions

### Import Errors

- Verify all dependencies installed: `pip list`
- Check Python version: `python --version`
- Try reinstalling: `pip install -r requirements.txt --force-reinstall`

## Project Status

- [x] File upload endpoint with Supabase storage
- [x] IFC processing with layered architecture (Parse → Geometry → Validate)
- [x] Celery task system for async processing
- [x] BEP (BIM Execution Plan) system with MMI scale
- [x] Change detection service
- [x] 3D viewer integration (frontend)
- [ ] API authentication
- [ ] API documentation with Swagger/OpenAPI

## Documentation

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Celery Documentation](https://docs.celeryproject.org/)
- [Supabase Documentation](https://supabase.com/docs)
