# Session: Verification Engine v1, Viewer Filtering Fix, Export Wiring

## Summary
Built the Verification Engine v1 (B2 sprint critical path) — a Django-only service that checks TypeMapping DB records against rules from ProjectConfig. Also fixed the TypeInstanceViewer 3D filtering bug (was using mesh.visible instead of ThatOpen Hider API), and wired the TypeLibraryPage export button to the existing useExportTypeBankExcel hook (B1 complete). Three sprint items knocked out in one session.

## Changes
- `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx` — Fixed filtering: replaced `fragment.mesh.visible` with `hider.set(false)` + `hider.set(true, fragmentIdMap)`. ThatOpen packs multiple IFC elements into shared fragment meshes, so mesh-level visibility can't isolate individual instances. Also refactored `zoomToVisibleInstances` → `zoomToFragments(fragmentIdMap)` since Hider doesn't affect Three.js mesh.visible.
- `frontend/src/pages/TypeLibraryPage.tsx` — Wired Export Excel button to `useExportTypeBankExcel()`. Removed dead Import button and Reduzer export (per-model features, not global TypeBank). Cleaned up unused imports (DropdownMenu, Upload, Loader2, CheckCircle2, useRef, useCallback).
- `backend/apps/entities/services/verification_engine.py` — **NEW**: Core verification engine with dataclass-based results, 4 default rules (has_ns3451, has_unit, has_material_layers, type_name_not_empty), custom rule loading from ProjectConfig.config['verification']['rules'], bulk TypeMapping updates.
- `backend/apps/entities/views.py` — Added `verify` action on IFCTypeViewSet: `POST /api/types/verify/?model={id}`
- `backend/apps/entities/models.py` — Added `verification_issues` JSONField + `verified_engine_at` DateTimeField to TypeMapping
- `backend/apps/entities/serializers.py` — Added new fields to TypeMappingSerializer (read-only)
- `backend/apps/entities/migrations/0031_verification_engine_fields.py` — Migration created (pending Supabase connection)
- `frontend/src/hooks/use-warehouse.ts` — Added `useVerifyModel()` mutation hook, `VerificationIssue` and `ModelVerificationResult` types, added verification_status/verification_issues/verified_engine_at to TypeMapping interface
- `frontend/src/i18n/locales/{en,nb}.json` — Added verification engine i18n keys (runVerification, running, complete, healthScore, passed/warnings/failed/skipped, rule names) + common.exporting

## Technical Details
**Viewer fix**: The UnifiedBIMViewer correctly uses `OBC.Hider` component which manipulates instanced rendering to show/hide individual elements within fragment meshes. TypeInstanceViewer was incorrectly toggling `fragment.mesh.visible` which shows/hides entire fragment meshes (multiple IFC elements share a mesh). The fix mirrors the UnifiedBIMViewer pattern exactly.

**Verification Engine architecture**: Django-only (no FastAPI needed) since it checks DB data, not IFC files. Rule types: `has_field` (mapping/type field is truthy), `has_related` (e.g., definition_layers count >= N), `regex` (field matches pattern), `value_in` (field in allowed set). Custom rules override defaults by ID. Health score = % types passing (no errors). Types with ownership_status ghost/reference or mapping_status ignored are skipped.

**Verification status mapping**: errors → flagged, warnings only → auto, no issues → auto (engine-verified, not human-verified). Human verification (→ verified) remains a manual process.

## Next
- Run pending migration when Supabase is reachable
- Test verification endpoint with real model data
- B3: Dashboard Enhancement — "Run Verification" button, verification summary widget, HealthScoreRing segments
- Wire useVerifyModel into TypeMappingWorkspace or model dashboard UI

## Notes
- Supabase was unreachable during session (no route to host) — migration created but not applied
- TypeInstanceViewer filtering still depends on FastAPI running to provide instance GUIDs via useTypeInstances hook
- TypeLibraryPanel.tsx remains orphaned dead code — cleanup opportunity
- No auth on verify endpoint yet (MVP acceptable)
