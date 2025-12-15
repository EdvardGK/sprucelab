"""
Health check endpoints for monitoring service status.
"""

from datetime import datetime
from fastapi import APIRouter
import asyncpg
import redis.asyncio as redis

from config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Basic health check - returns immediately if service is running."""
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/health/detailed")
async def detailed_health():
    """
    Detailed health check - verifies all dependencies.

    Checks:
    - Database (Supabase PostgreSQL)
    - Redis (for IFC caching)
    - ifcopenshell (IFC processing library)
    """
    checks = {
        "service": "healthy",
        "database": await _check_database(),
        "redis": await _check_redis(),
        "ifcopenshell": _check_ifcopenshell(),
    }

    # Overall status - check if any value starts with "unhealthy" or is "unavailable"
    all_healthy = all(
        v.startswith("healthy") or v == "not_configured"
        for v in checks.values()
    )
    overall = "healthy" if all_healthy else "degraded"

    return {
        "status": overall,
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks,
    }


async def _check_database() -> str:
    """Check PostgreSQL (Supabase) connection."""
    if not settings.DATABASE_URL:
        return "not_configured"

    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)
        await conn.execute("SELECT 1")
        await conn.close()
        return "healthy"
    except Exception as e:
        return f"unhealthy: {str(e)[:50]}"


async def _check_redis() -> str:
    """Check Redis connection."""
    try:
        client = redis.from_url(settings.REDIS_URL)
        await client.ping()
        await client.close()
        return "healthy"
    except Exception as e:
        return f"unhealthy: {str(e)[:50]}"


def _check_ifcopenshell() -> str:
    """Check if ifcopenshell is available."""
    try:
        import ifcopenshell

        return f"healthy (v{ifcopenshell.version})"
    except ImportError:
        return "unavailable"
    except Exception as e:
        return f"error: {str(e)[:50]}"
