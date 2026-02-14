# Session: Local Development Environment

## Summary

Set up a fully local development stack isolated from production Supabase. One command (`./dev.sh`) now starts PostgreSQL, Redis, Django, FastAPI, and the Vite frontend with hot reload on all code services. Fixed several bugs discovered during testing.

## Changes

### Bug Fixes
- `backend/ifc-service/repositories/ifc_repository.py` - Added `reused_status='new'` to `bulk_insert_materials` raw SQL INSERT (was missing the column, causing NOT NULL constraint violation on re-process). **Pushed to main.**
- `frontend/src/hooks/use-model-analysis.ts` - Fixed endpoint path (`/model-analysis/` -> `/entities/model-analysis/`) and action URL (`run_analysis` -> `run`) and body key (`model_id` -> `model`)
- `frontend/src/pages/ModelWorkspace.tsx` - Default tab changed from `3d-viewer` to `overview`
- `backend/ifc-service/config.py` - Fixed pydantic-settings env_file order: `.env` first, `.env.dev` second (last wins in pydantic-settings v2)

### Local Dev Environment (new)
- `docker-compose.dev.yml` - PostgreSQL 16 + Redis 7 in Docker (infrastructure only, code runs natively)
- `.env.dev` - Local env config pointing to local DB, no Supabase S3 keys (forces local file storage)
- `.env.dev.example` - Committed template for `.env.dev`
- `dev.sh` - Full orchestration script: starts Docker infra, waits for PG, runs migrations, starts Django (8000) + FastAPI (8001 with --reload) + Frontend (5173). Flags: `--seed`, `--stop`
- `backend/apps/models/management/commands/seed_dev_data.py` - Idempotent seed command creating test project, 2 models, 10 IFC types, 6 materials
- `dev-data/README.md` - Directory for test IFC files (gitignored)

### Local Upload Flow
- `frontend/src/contexts/UploadContext.tsx` - Upload now tries Supabase presigned URL first; on failure falls back to legacy Django `/models/upload/` endpoint (multipart with progress tracking)
- `backend/apps/models/views.py` - When local storage returns relative URL (e.g. `/media/...`), prepends `DJANGO_URL` to make absolute URL so FastAPI can download the file

### Config Changes
- `backend/config/settings.py` - `.env.dev` loaded as highest priority (before `.env.local` and `.env`)
- `backend/ifc-service/config.py` - env_file tuple: `("../../.env", "../../.env.dev")` - .env.dev overrides .env
- `.gitignore` - Added `.env.dev`, removed `dev.sh` (now tracked)

## Key Decisions
- **Hybrid approach**: Heavy infrastructure (PG, Redis) in Docker, code runs natively for fast hot reload
- **`.env.dev` priority**: When present, overrides all other env files - production Supabase never touched
- **FastAPI on port 8001**: Matches what Django and frontend expect (config default was 8100)
- **No auth bypass needed**: DRF uses AllowAny permissions currently
- **Upload fallback**: Frontend auto-detects local mode by catching `get-upload-url` failure, no env var needed

## Current State
- `./dev.sh --seed` starts full stack, seed data loads correctly
- All services running with hot reload
- **Upload flow**: `get-upload-url` returns 400 (expected, no Supabase) -> falls back to Django upload -> FastAPI API key mismatch was fixed (env_file order) -> **needs re-test**
- Seed data models have no `file_url` (no actual IFC files) - need to upload a real IFC to test viewer

## Next
- Re-test IFC upload through local flow (API key fix should resolve the 403)
- Verify 3D viewer loads after successful local upload
- Consider `--reset` flag for dev.sh (drop + recreate local DB)
