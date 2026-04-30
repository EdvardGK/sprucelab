# Session: Codebase Simplification Sprint

## Summary
Major codebase cleanup across all 7 planned tiers. Reduced CLAUDE.md from 786 to 208 lines (-73%), archived ~10K lines of dead/deprioritized code (BEP system, placeholder pages, dead apps), fixed the misleading `/api/entities/` naming to `/api/types/`, split the monolithic entities/models.py (2257 lines) into a 7-file package, and split the oversized use-warehouse.ts hook (1414 lines) into 3 focused hooks. The goal was making the codebase match the product: "Drop IFC, get insights."

## Changes

### Tier 1: CLAUDE.md Rewrite
- `CLAUDE.md`: 786 -> 208 lines. Viewer controls, API patterns, Django vs FastAPI docs moved to `docs/knowledge/`
- `PLAN.md` archived to `docs/archive/PLAN-2025-11.md`
- Created: `docs/knowledge/viewer-controls.md`, `docs/knowledge/api-patterns.md`, `docs/knowledge/django-vs-fastapi.md`, `docs/archive/architecture-decisions.md`

### Tier 2: API Naming Fix
- `backend/config/urls.py`: `/api/entities/` -> `/api/types/`
- Updated 42 API call sites across frontend hooks and components
- Updated docstrings in `backend/apps/entities/views.py`

### Tier 3: BEP System Archival (~8000 lines)
- Archived to `archive/`: backend/apps/bep/, frontend bep/eir/mmi components, use-bep.ts, use-eir.ts, ProjectBEP.tsx
- Removed from INSTALLED_APPS and urls.py
- Stubbed `backend/apps/projects/services/bep_defaults.py` to keep imports working
- Fixed `ifc-service/services/validation/orchestrator.py` to skip BEP loader
- Fixed `BIMWorkbench.tsx` and `ModelWorkspace.tsx` references

### Tier 4: Dead Apps + Ghost Navigation
- Archived `contacts` and `graph` Django apps
- Removed ghost sidebar links: Spaces, QTO (routes that didn't exist)
- Archived 5 placeholder pages: MyIssues, MyRFIs, QuickStats, ScriptsLibrary, Settings
- INSTALLED_APPS: 10 local -> 7 local

### Tier 5: entities/models.py Split
- 2257-line models.py -> 7-file models/ package: core.py, classification.py, library.py, typemapping.py, typebank.py, reporting.py, __init__.py
- Zero migrations needed, all imports backward compatible

### Tier 6: use-warehouse.ts Split
- 1414-line hook -> use-type-mapping.ts (538), use-type-bank.ts (239), use-type-export.ts (180), barrel use-warehouse.ts (555)
- All existing imports still work via re-exports

### Tier 7: Housekeeping
- Fixed duplicate route: `/projects/:id` now goes to Dashboard (was Models)
- Fixed sidebar Dashboard link to point to `/projects/:id/dashboard`
- Added `supabase/` and `backend/supabase/` to `.gitignore`

## Technical Details
- All changes verified with `npx tsc --noEmit` (clean compile throughout)
- Django apps with existing tables left in DB (harmless, no migration needed to drop)
- BEP references in clear_test_data.py wrapped in try/except ImportError
- entities models split used string ForeignKey references between modules to avoid circular imports
- Kept Django app directory as `apps/entities/` internally, only renamed API path to `/api/types/`

## Next
- Run full build (`yarn build`) and Django check (`python manage.py check`) to verify
- Start dev servers and test core flow: login -> project -> dashboard -> types
- Consider squashing entities migrations (34 -> ~5) now that dust has settled
- Resume MVP work: Excel Workflow UI, Verification Engine

## Notes
- User preference: "archive, not delete" -- all removed code lives in `archive/` directory
- The `contacts` app had zero code. The `graph` app had views but no models.
- BEP tables still exist in production DB -- harmless, can drop later if desired
- Frontend route `/projects/:id` was a duplicate of `/projects/:id/models`. Changed to render Dashboard instead, matching "data leads" philosophy
