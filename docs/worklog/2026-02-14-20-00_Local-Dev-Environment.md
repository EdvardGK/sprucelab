# Session: Local Development Environment

## Summary

Set up a fully local development stack isolated from production Supabase. One command (`./dev.sh`) now starts PostgreSQL, Redis, Django, FastAPI, and the Vite frontend with hot reload on all code services. Also fixed a `reused_status` NOT NULL bug in the FastAPI material insertion.

## Changes

### Bug Fix
- `backend/ifc-service/repositories/ifc_repository.py` - Added `reused_status='new'` to `bulk_insert_materials` raw SQL INSERT (was missing the column, causing NOT NULL constraint violation on re-process)

### Local Dev Environment (new)
- `docker-compose.dev.yml` - PostgreSQL 16 + Redis 7 in Docker (infrastructure only, code runs natively)
- `.env.dev` - Local env config pointing to local DB, no Supabase S3 keys (forces local file storage)
- `dev.sh` - Full orchestration script: starts Docker infra, waits for PG, runs migrations, starts Django (8000) + FastAPI (8001 with --reload) + Frontend (5173)
- `backend/apps/models/management/commands/seed_dev_data.py` - Idempotent seed command creating test project, 2 models, 10 IFC types, 6 materials
- `dev-data/README.md` - Directory for test IFC files (gitignored)

### Config Changes
- `backend/config/settings.py` - `.env.dev` loaded as highest priority (before `.env.local` and `.env`)
- `backend/ifc-service/config.py` - `.env.dev` added to pydantic-settings env_file tuple
- `.gitignore` - Added `.env.dev`

## Key Decisions
- **Hybrid approach**: Heavy infrastructure (PG, Redis) in Docker, code runs natively for fast hot reload
- **`.env.dev` priority**: When present, overrides all other env files - production Supabase never touched
- **FastAPI on port 8001**: Matches what Django and frontend expect (config default was 8100)
- **No auth bypass needed**: DRF uses AllowAny permissions currently

## Next
- Test full IFC upload + re-process flow against local DB
- Consider adding a `--reset` flag to dev.sh that drops and recreates the local DB
