"""
FastAPI IFC Service Configuration.

Loads settings from environment variables, with defaults for development.
"""

from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Service configuration loaded from environment."""

    # Service identity
    SERVICE_NAME: str = "ifc-service"
    VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8100

    # Database (Supabase PostgreSQL - shared with Django)
    DATABASE_URL: str = ""

    # Redis (for caching loaded IFC files)
    REDIS_URL: str = "redis://localhost:6379/1"

    # Django backend URL (for callbacks/status updates)
    DJANGO_URL: str = "http://localhost:8000"

    # Internal API key for Django <-> FastAPI communication
    # This should match the key configured in Django settings
    IFC_SERVICE_API_KEY: str = "dev-api-key-change-in-production"

    # CORS origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
    ]

    # IFC Processing limits
    MAX_FILE_SIZE_MB: int = 1024  # 1GB
    IFC_CACHE_TTL_SECONDS: int = 3600  # 1 hour
    MAX_ELEMENTS_PER_REQUEST: int = 1000

    # Temp file storage
    TEMP_DIR: str = "/tmp/ifc-service"

    class Config:
        env_file = "../../.env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Create settings instance
settings = Settings()

# Ensure temp directory exists
os.makedirs(settings.TEMP_DIR, exist_ok=True)
