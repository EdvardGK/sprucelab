# Session: Local Dev Fixes, Sidebar Restructure & Production Deployment

## Summary

Full local dev environment testing and bugfixing, sidebar navigation reorganization, and production deployment fixes. End-to-end flow now works: upload IFC, process, run analysis, view dashboard, 3D viewer.

## Changes

### Local Dev Bugfixes
- `backend/ifc-service/repositories/ifc_repository.py` - Added `ownership_status='primary'` to `bulk_insert_types` raw SQL (NOT NULL constraint violation, same pattern as `reused_status` fix from prior session)
- `backend/apps/entities/views.py` - `run_analysis`: convert HTTP `file_url` to local file path for `type_analysis()` (expects filesystem path, not URL)
- `frontend/src/pages/ModelWorkspace.tsx` - Treemap layout: fixed fraction calculation (`item.value / rowSum` not `item.value / rowArea`) causing cells >100% height
- `frontend/.env.local` - Added `VITE_IFC_SERVICE_URL=http://localhost:8001/api/v1` (was defaulting to port 8100)
- Installed `ifc-toolkit` in `sprucelab` conda env (was only in base env, Django couldn't import it)

### Sidebar Restructure
- Split "Data" section into **Files** (Models, Drawings, Documents) and **Data** (Type Library, Material Library, Spaces, QTO)
- Replaced Modules + Workbench sub-nav with always-visible **BIM Workbench** section: Classification, Verification, IFC Editing, BEP Config
- Removed Scripting from sidebar nav, removed unused `isInWorkbench` variable
- Added translation keys: `spaces`, `qto`, `verification`, `ifcEditing` (en + nb)

### Production Deployment Fixes
- `backend/apps/entities/views.py` - `run_analysis` now handles three URL types:
  - Local file path (passthrough)
  - Local dev media URL (resolve to MEDIA_ROOT)
  - Remote URL / Supabase (download to temp file, clean up after)
- Vendored `ifc-toolkit` into `backend/lib/ifc_toolkit/` (2500 LOC, 12 modules)
  - Added `sys.path.insert(0, str(BASE_DIR / 'lib'))` to `config/settings.py`
  - Removed `ifc-toolkit>=0.2.0` from `requirements.txt` (not on PyPI)
- Fixed Vercel build: removed unused `isInWorkbench` variable (TS6133)

### Dashboard Fixes
- Units card: extract `symbol` from unit objects instead of showing `[object Object]`
- Coordinates card: format structured data (true north angle, site lat/lng, WCS origin) into readable strings
- Layout: changed `overflow-hidden` to `overflow-y-auto`, added min-heights (`10rem` storeys, `12rem` treemap) to prevent crushing

## Key Insight: Vendored Dependencies

`backend/lib/` is the vendored packages directory. Local-only Python packages go here, not in `requirements.txt`. Django settings adds it to `sys.path`. Source of truth remains in `~/dev/resources/ifc-toolkit/` - must re-copy after changes.

## Key Insight: FastAPI Raw SQL

Any Django model field with `default=X` but NOT NULL must be explicitly set in FastAPI's raw SQL INSERTs in `ifc_repository.py`. Fixed so far: `reused_status` (materials), `ownership_status` (ifc_types). Check this when adding new NOT NULL fields to Django models.

## Deployment Status
- **Railway Django**: SUCCESS (vendored ifc-toolkit, analysis endpoint working)
- **Railway FastAPI**: SUCCESS (ownership_status fix)
- **Vercel Frontend**: Deployed (sidebar restructure, dashboard fixes)

## Current State
- Local dev: fully working (upload, process, analyze, view)
- Production: analysis endpoint working, dashboard rendering with minor layout tuning needed
- 3D viewer: loads IFC via ThatOpen (~28s for test model), "No camera initialized" warning on click during load (harmless)

## Next
- Dashboard layout still feels compressed - may need further viewport/height tuning
- Spaces and QTO pages are nav-only placeholders (routes will 404)
- Verification and IFC Editing workbench views need implementation
- Consider adding `ifc-toolkit` to a private GitHub repo for cleaner dependency management
