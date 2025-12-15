"""
Authentication for Django <-> FastAPI communication.

Uses a shared API key for service-to-service authentication.
This is simpler than JWT for internal services and sufficient for our use case.
"""

from fastapi import HTTPException, Header, Depends
from typing import Optional

from config import settings


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
) -> bool:
    """
    Verify the API key from request header.

    For production, this key should be a strong secret shared between Django and FastAPI.
    """
    if settings.DEBUG and not x_api_key:
        # Allow unauthenticated access in debug mode
        return True

    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Include X-API-Key header.",
        )

    if x_api_key != settings.IFC_SERVICE_API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid API key.",
        )

    return True


async def optional_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
) -> bool:
    """
    Optional API key verification - doesn't fail if missing in debug mode.
    Use this for endpoints that should be accessible during development.
    """
    if not x_api_key:
        return settings.DEBUG  # Allow if debug mode

    return x_api_key == settings.IFC_SERVICE_API_KEY


# Dependency for protected endpoints
require_api_key = Depends(verify_api_key)
