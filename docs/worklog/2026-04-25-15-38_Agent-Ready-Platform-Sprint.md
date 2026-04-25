# Session: Agent-Ready Platform Sprint

## Summary
Massive productivity session: completed 13 items across both codebase quality (agent-ready) and product features (B1-B5 sprint). Discovered B1 (Excel Workflow UI) and B2 (Verification Engine) were already done from prior sessions -- the TODO was stale from March. Built the remaining sprint items (B3 Dashboard Enhancement, B4 Version Change Detection, B5 Sandwich View) and all planned agent-ready infrastructure (API Surface Map, CLAUDE.md patterns, script execution endpoint, batch classification API, views.py split). Dropped the MCP server plan in favor of CLI expansion -- redundant infrastructure when the CLI already exists. MVP completion moved from ~50% to ~80%.

## Changes
- **`docs/knowledge/API_SURFACE.md`** (new) -- Complete endpoint reference: 40+ Django ViewSets, 30+ FastAPI endpoints, all custom actions documented
- **`CLAUDE.md`** -- Added `## Common Patterns` section with DRF ViewSet, FastAPI endpoint, and React Query hook recipes
- **`backend/apps/scripting/views.py`** -- Wired `execute` action on ScriptViewSet calling existing ScriptRunner service
- **`backend/apps/scripting/serializers.py`** -- Updated ExecuteScriptRequestSerializer: `script_id` -> `model_id` (script comes from URL)
- **`backend/apps/scripting/services/context.py`** -- Removed stale `Geometry` model import (deleted in types-only migration)
- **`backend/apps/entities/views.py`** -> **`backend/apps/entities/views/`** -- Split 2855 lines into 8 modules (types.py, typebank.py, library.py, classification.py, materials.py, legacy.py, analysis.py, __init__.py)
- **`backend/apps/entities/views/types.py`** -- Enhanced `bulk-update` to accept all classification fields (ns3451_code, representative_unit, discipline, type_category, notes). Updated `dashboard-metrics` with 4-weight health score (classification 30%, unit 15%, material 25%, verification 30%), verification counts, and action items list. Added `version-changes` endpoint.
- **`backend/apps/entities/services/version_compare.py`** (new) -- Type-level version comparison by signature tuple (ifc_class, type_name, predefined_type)
- **`frontend/src/hooks/use-warehouse.ts`** -- Added `VersionDiff`, `TypeChange`, `ActionItem` types. Added `versionChanges` query key. Enhanced `DashboardMetrics` with verification fields.
- **`frontend/src/hooks/use-type-mapping.ts`** -- Added `useVersionChanges()` hook
- **`frontend/src/components/features/warehouse/TypeDashboard.tsx`** -- 4th completeness bar (Verification), ActionItemsList component with severity icons
- **`frontend/src/components/features/warehouse/SandwichDiagram.tsx`** (new) -- SVG stacked rectangle diagram with heuristic material colors and thickness labels
- **`frontend/src/i18n/locales/{en,nb}.json`** -- Added dashboard.verification, dashboard.actionItems, sandwich.* keys
- **`docs/todos/current.md`** -- Full rewrite: marked B1-B5 as complete, added agent-ready items, MVP 50% -> 80%

## Technical Details
- The views.py split was delegated to a general-purpose agent which handled the 2855-line file in one pass, creating proper per-module imports and a re-exporting __init__.py. `urls.py` unchanged.
- Version comparison uses signature tuples `(ifc_class::type_name::predefined_type)` for matching -- not GUIDs, since types don't have stable GUIDs across versions. Instance count changes are tracked as "changed".
- Dashboard health score weights changed from (40/20/40) to (30/15/25/30) to incorporate verification. Action items query returns top 20 flagged/review/followup types with their top 3 verification issues.
- Decided to drop MCP server in favor of CLI expansion. The `cli/spruce/` package already has auth, pipelines, runs, and dev commands. Adding types/verify/scripts commands is more practical than maintaining a parallel MCP process.

## Next
- Wire SandwichDiagram into TypeDetailPanel Materials tab
- Wire version change badges (NEW/REMOVED/CHANGED) into TypeBrowser list view rows
- Event/Webhook system (WebhookSubscription model + dispatch_event utility)
- CLI expansion: `spruce types list/classify/export`, `spruce verify`, `spruce scripts run`
- Test infrastructure bootstrap (pytest + conftest + smoke tests)
- Frontend: start dev server and test all new features in browser

## Notes
- B1 and B2 were already complete -- current.md TODO was stale from 2026-03-29. Future sessions should verify TODO items against code before starting implementation.
- The `Geometry` model was removed during the types-only migration but `context.py` still imported it. Fixed as part of wiring the script execution endpoint.
- `types.py` in the views split is 1001 lines (over the 800-line guideline) but contains 3 tightly coupled ViewSets (IFCType, TypeMapping, TypeDefinitionLayer). Splitting further would break cohesion.
