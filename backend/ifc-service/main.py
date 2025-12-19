"""
Sprucelab IFC Service - FastAPI Microservice for Heavy IFC Processing.

This service handles:
- IFC file loading and caching
- Bulk property editing
- Validation
- IFC export/reconstruction

Django handles coordination (auth, project metadata, user management).
FastAPI handles processing (file I/O, CPU-bound IFC operations).
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events."""
    # Startup
    print(f"Starting {settings.SERVICE_NAME} v{settings.VERSION}")
    print(f"Debug mode: {settings.DEBUG}")
    print(f"Listening on {settings.HOST}:{settings.PORT}")

    # Initialize database pool
    if settings.DATABASE_URL:
        from core.database import DatabasePool
        await DatabasePool.create_pool()
    else:
        print("WARNING: DATABASE_URL not configured, database features disabled")

    yield

    # Shutdown
    if settings.DATABASE_URL:
        from core.database import DatabasePool
        await DatabasePool.close_pool()
    print(f"Shutting down {settings.SERVICE_NAME}")


app = FastAPI(
    title="Sprucelab IFC Service",
    description="Heavy IFC processing microservice for bulk editing, validation, and export.",
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware
# Allow specific origins + regex pattern for Vercel preview deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https://sprucelab.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint - service info."""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "status": "running",
        "docs": "/docs" if settings.DEBUG else "disabled",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
