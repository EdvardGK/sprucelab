"""
Database connection management for FastAPI IFC Service.

Uses asyncpg for async PostgreSQL operations on the shared Supabase database.
"""

import asyncpg
from typing import Optional
from contextlib import asynccontextmanager

from config import settings


class DatabasePool:
    """Manages asyncpg connection pool lifecycle."""

    _pool: Optional[asyncpg.Pool] = None

    @classmethod
    async def create_pool(cls) -> asyncpg.Pool:
        """Create the connection pool on startup."""
        if cls._pool is not None:
            return cls._pool

        if not settings.DATABASE_URL:
            raise ValueError("DATABASE_URL is not configured")

        # Parse the DATABASE_URL - asyncpg uses slightly different format
        # Django format: postgresql://user:pass@host:port/dbname
        # asyncpg format: postgresql://user:pass@host:port/dbname (same, but may need adjustments)
        dsn = settings.DATABASE_URL

        print(f"Connecting to database...")
        cls._pool = await asyncpg.create_pool(
            dsn,
            min_size=2,
            max_size=10,
            command_timeout=60,
            statement_cache_size=0,  # Disable for Supabase connection pooler compatibility
        )
        print(f"Database pool created (min=2, max=10)")
        return cls._pool

    @classmethod
    async def close_pool(cls) -> None:
        """Close the connection pool on shutdown."""
        if cls._pool is not None:
            await cls._pool.close()
            cls._pool = None
            print("Database pool closed")

    @classmethod
    def get_pool(cls) -> asyncpg.Pool:
        """Get the current pool. Raises if not initialized."""
        if cls._pool is None:
            raise RuntimeError("Database pool not initialized. Call create_pool() first.")
        return cls._pool


@asynccontextmanager
async def get_connection():
    """Get a database connection from the pool."""
    pool = DatabasePool.get_pool()
    async with pool.acquire() as connection:
        yield connection


@asynccontextmanager
async def get_transaction():
    """Get a database connection with an active transaction."""
    pool = DatabasePool.get_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection


async def execute_query(query: str, *args) -> str:
    """Execute a query and return status."""
    async with get_connection() as conn:
        return await conn.execute(query, *args)


async def fetch_all(query: str, *args) -> list:
    """Fetch all rows from a query."""
    async with get_connection() as conn:
        return await conn.fetch(query, *args)


async def fetch_one(query: str, *args) -> Optional[asyncpg.Record]:
    """Fetch a single row from a query."""
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args)


async def fetch_val(query: str, *args):
    """Fetch a single value from a query."""
    async with get_connection() as conn:
        return await conn.fetchval(query, *args)
