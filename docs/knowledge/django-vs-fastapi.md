# Django vs FastAPI: When to Use Which

**Rule**: Django coordinates, FastAPI processes.

## Django is for:
- User authentication, sessions, permissions
- CRUD operations on relational data
- Admin interfaces
- ORM-based queries and relationships
- Project/model metadata management

## FastAPI is for:
- Heavy file I/O (large IFC files, streaming)
- CPU-bound processing (IfcOpenShell parsing)
- Async operations (validation pipelines)
- Stateless processing services
- Operations that need horizontal scaling

## Why This Matters for BIM:
- IFC files can be 500MB+; Django's request/response cycle isn't built for this
- IfcOpenShell parsing is blocking/CPU-bound; FastAPI handles process pools better
- Validation is stateless; doesn't need Django's ORM
- FastAPI services can scale independently from the Django coordination layer
