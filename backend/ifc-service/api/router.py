"""
Main API router - combines all endpoint routers.
"""

from fastapi import APIRouter

from api.health import router as health_router
from api.ifc_operations import router as ifc_router
from api.ifc_process import router as process_router
from api.fragments import router as fragments_router

api_router = APIRouter()

# Health endpoints (no prefix)
api_router.include_router(health_router)

# IFC operations (load, query, etc.)
api_router.include_router(ifc_router)

# IFC processing (Django integration - parse and write to DB)
api_router.include_router(process_router)

# Fragment generation (IFC to ThatOpen Fragments)
api_router.include_router(fragments_router)
