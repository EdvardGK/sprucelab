# Session: Responsibility Matrix and Expanded Disciplines

## Summary
Expanded the discipline system from 6 codes (ARK/RIB/RIV/RIE/LARK/RIG) to 21 codes covering all Norwegian construction industry roles per SAK10 13-5. Created a shared discipline registry with parent-child hierarchy (RIV covers all HVAC sub-disciplines), added a project-level ResponsibilityMatrix model for overriding global defaults, and updated the frontend MetadataTab with grouped discipline selection.

## Changes
- `backend/apps/core/disciplines.py` **NEW**: Single source of truth for 12 model disciplines + 9 advisory roles, with hierarchy helpers, color mapping, and Django choices
- `backend/apps/models/models.py`: Removed inline DISCIPLINE_CHOICES/DISCIPLINE_COLORS, imports from core, discipline field max_length 10 -> 20
- `backend/apps/entities/models.py`: NS3451OwnershipMatrix uses ALL_DISCIPLINE_CHOICES from core, discipline field max_length 10 -> 20
- `backend/apps/projects/models.py`: Added ResponsibilityMatrix model (project-level override of global NS3451 ownership matrix)
- `backend/apps/entities/services/discipline_filter.py`: Added `_lookup_ownership()` with project matrix -> global fallback, hierarchy resolution via `resolve_discipline_for_lookup()`
- `frontend/src/pages/ModelWorkspace.tsx`: MetadataTab shows full discipline list grouped into "Model Disciplines" and "Advisory Roles" with color dots and sub-discipline indentation
- `frontend/src/lib/api-types.ts`: Added `discipline` field to Model interface
- 3 Django migrations generated and applied (entities 0030, models 0015, projects 0004)

## Next
- Responsibility matrix editor UI (project settings page)
- Seed default NS3451 -> discipline mappings for new codes
- Wire up discipline assignment buttons (currently display-only)
- API endpoint for discipline registry (`GET /api/disciplines/`)

## Notes
- Parent-child hierarchy: RIV covers RIVv/RIVp/RIVspr/RIkulde/RIvarme. A model tagged RIV inherits responsibility for all HVAC sub-disciplines. A model tagged RIVp only matches RIVp + parent RIV.
- `apps.core` is NOT in INSTALLED_APPS (no models, just constants/functions) - imports work fine via Python path
- Existing data unchanged - old 6 discipline codes still valid within the expanded set
