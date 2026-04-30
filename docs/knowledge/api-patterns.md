# API Design Patterns

## Django REST API (Project/Model Metadata)

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
1. POST /api/models/upload/ -> Returns model_id, starts Celery task
2. GET /api/models/{id}/status/ -> Poll for status
3. GET /api/models/{id}/ -> Get full model data when ready

## FastAPI Microservice (IFC Processing)

**IFC Operations**:
```
POST   /ifc/open                          # Load IFC file, return element tree
GET    /ifc/{file_id}/elements            # List elements with properties (paginated)
GET    /ifc/{file_id}/elements/{guid}     # Get single element details
```

**Validation**:
```
POST   /ifc/{file_id}/validate            # Run validation rules
GET    /ifc/{file_id}/validation/report   # Get validation report
```

**Communication:** Django -> FastAPI via internal HTTP. Redis for caching.
