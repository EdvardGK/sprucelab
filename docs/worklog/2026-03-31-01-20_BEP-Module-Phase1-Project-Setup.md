# Session: BEP Module Phase 1 — Project Setup UI

## Summary
Built the frontend BEP (BIM Execution Plan) module for Sprucelab — a dedicated page for configuring project fundamentals: coordinate system, storey definitions, discipline assignments, technical IFC requirements, and MMI scale. The backend was already fully built (11 Django models, full CRUD APIs at `/api/bep/*`), so this session was primarily frontend work plus minor backend serializer fixes. The Skiplum BEP template (`~/skiplum/internal/bep/docs/maler/bep-mal.md`) served as the reference for what a BEP should contain.

## Changes

### Backend (minor fixes)
- `backend/apps/bep/serializers.py` — Added missing `bep` field to `TechnicalRequirementSerializer` and `MMIScaleDefinitionSerializer`. Without this, creating these resources via API was impossible.
- `backend/apps/bep/views.py` — Added `?bep=` query filter to `TechnicalRequirementViewSet` (was missing, unlike all other ViewSets).

### Frontend (new)
- `frontend/src/hooks/use-bep.ts` — Complete rewrite. Added TypeScript interfaces for `ProjectCoordinates`, `ProjectDiscipline`, `ProjectStorey`, `TechnicalRequirement`. Added query hooks + mutation hooks for all BEP resources (create, update, delete). Added `STANDARD_DISCIPLINES` constant with Norwegian codes.
- `frontend/src/pages/ProjectBEP.tsx` — Main BEP page with vertical sidebar navigation (6 sections) and content area. Handles BEP creation flow if none exists.
- `frontend/src/components/features/bep/BEPOverview.tsx` — Quick reference summary card mirroring the Skiplum "Hurtigreferanse" format.
- `frontend/src/components/features/bep/CoordinateSystemForm.tsx` — EPSG code selection (13 Norwegian NTM/UTM zones), vertical datum, local origin, global position, rotation, tolerances.
- `frontend/src/components/features/bep/StoreyTable.tsx` — Editable table for storey definitions with inline editing, add/delete, bulk save.
- `frontend/src/components/features/bep/DisciplineTable.tsx` — Editable table for discipline assignments with standard code dropdown, company/contact/software fields.
- `frontend/src/components/features/bep/TechnicalRequirementsForm.tsx` — IFC version, MVD, units, geometry tolerance, max file size.

### Routing & Navigation
- `frontend/src/App.tsx` — Added `/projects/:id/bep` route.
- `frontend/src/components/Layout/Sidebar.tsx` — Changed BEP link from workbench tab to dedicated page at `/projects/:id/bep`.

### i18n
- `frontend/src/i18n/locales/nb.json` — Added comprehensive BEP translation keys (sections, status, coordinates, storeys, disciplines, technical, MMI).
- `frontend/src/i18n/locales/en.json` — Same in English.

## Technical Details
- Session started with strategic discussion about AEC data needs (IFC-native vs external inputs), which informed the BEP module scope.
- Existing BEP Django models (created months ago, marked "deprioritized") turned out to be well-structured and fully API-ready — just needed the `bep` FK field added to two serializers.
- Design decision: BEP gets its own route (`/projects/:id/bep`) rather than remaining a workbench tab, since it will grow significantly (IDS, naming conventions, validation rules, milestones in Phase 2+).
- All forms use optimistic local state with explicit save — no auto-save, consistent with the "save when ready" pattern.
- DecimalField values from Django come as strings — typed accordingly in TypeScript interfaces.

## Next
- Test the BEP page in browser (not tested this session — frontend wasn't running)
- Wire up MMITableMaker save (existing component still has `console.log` placeholder)
- Phase 2: Naming conventions, required property sets, validation rules, milestones
- Phase 3: IDS import/export (user chose "both import and export")

## Notes
- The existing BEP models are comprehensive (ISO 19650 / POFIN compliant) — good foundation for the full BEP module
- MMITableMaker save still not wired up (was a TODO before this session too). Needs to create MMI levels via POST to `/api/bep/mmi-scale/`
- IDS support was explicitly requested as "both import and export" — buildingSMART IDS XML parsing will be Phase 3
