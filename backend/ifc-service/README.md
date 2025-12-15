# Sprucelab IFC Service

FastAPI microservice for heavy IFC processing operations.

## Purpose

This service handles CPU-intensive IFC operations that don't belong in Django:
- Loading and caching IFC files
- Bulk property editing
- Validation
- IFC export/reconstruction

Django handles coordination (auth, project metadata, user management).
FastAPI handles processing (file I/O, CPU-bound operations).

## Quick Start

### Development (without Docker)

```bash
# From this directory
cd /home/edkjo/dev/sprucelab/backend/ifc-service

# Create/activate conda environment
conda activate sprucelab

# Install dependencies (if needed)
pip install -r requirements.txt

# Run the service
uvicorn main:app --reload --port 8001
```

### With Docker

```bash
# From project root
cd /home/edkjo/dev/sprucelab

# Start all services
docker-compose up -d

# Or just IFC service + Redis
docker-compose up -d redis ifc-service
```

## API Endpoints

Once running, visit http://localhost:8001/docs for interactive API documentation.

### Health Checks
- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/detailed` - Check all dependencies

### IFC Operations
- `POST /api/v1/ifc/open` - Upload and load IFC file
- `POST /api/v1/ifc/open/url` - Load IFC from URL
- `GET /api/v1/ifc/{file_id}/info` - Get file info
- `GET /api/v1/ifc/{file_id}/elements` - List elements (paginated)
- `GET /api/v1/ifc/{file_id}/elements/{guid}` - Element detail with properties
- `DELETE /api/v1/ifc/{file_id}` - Unload file from cache
- `GET /api/v1/ifc/loaded` - List loaded files

## Configuration

Environment variables (from `.env` or docker-compose):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (required) | Supabase PostgreSQL URL |
| `REDIS_URL` | `redis://localhost:6379/1` | Redis for IFC caching |
| `IFC_SERVICE_API_KEY` | `dev-api-key...` | API key for Django communication |
| `DEBUG` | `True` | Enable debug mode |
| `PORT` | `8001` | Service port |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (5173)                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
┌───────────────────┐             ┌───────────────────────┐
│  Django (8000)    │             │  FastAPI IFC (8001)   │
├───────────────────┤             ├───────────────────────┤
│ • Auth/Sessions   │             │ • IFC loading         │
│ • Project CRUD    │   shared    │ • Property editing    │
│ • Model metadata  │◄───────────►│ • Validation          │
│ • User prefs      │     DB      │ • Export              │
└───────────────────┘             └───────────────────────┘
        │                                   │
        └───────────────┬───────────────────┘
                        ▼
              ┌─────────────────┐
              │ Supabase        │
              │ PostgreSQL      │
              └─────────────────┘
```

## File Structure

```
ifc-service/
├── main.py           # FastAPI app entry point
├── config.py         # Settings (Pydantic)
├── requirements.txt  # Python dependencies
├── Dockerfile        # Container definition
│
├── api/              # API endpoints
│   ├── router.py     # Main router
│   ├── health.py     # Health checks
│   └── ifc_operations.py  # IFC CRUD
│
├── services/         # Business logic
│   └── ifc_loader.py # IFC file operations
│
├── models/           # Pydantic schemas
│   └── schemas.py    # Request/response models
│
├── core/             # Core utilities
│   └── auth.py       # API key validation
│
└── tests/            # Test files
```

## Testing

```bash
# Run tests
pytest tests/ -v

# Test health endpoint manually
curl http://localhost:8001/api/v1/health

# Test IFC upload
curl -X POST http://localhost:8001/api/v1/ifc/open \
  -F "file=@test.ifc"
```
