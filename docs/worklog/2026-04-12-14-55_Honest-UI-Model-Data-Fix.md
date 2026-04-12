# Session: Honest UI + Production Model Data Fix

## Summary
Fixed production data pipeline where 3 models (G55_RIV, RIE, ARK) had no type data because they were uploaded from local dev with `localhost:8000` file URLs unreachable from production. Uploaded IFC files to Supabase, patched DB records, ran type analysis. Then implemented "honest UI" changes so the platform never silently fails — errors surface where the data lives, not in console.log.

## Changes

### Production data fix (manual, one-time)
- Uploaded G55_RIV (108MB), G55_RIE (24MB), G55_ARK (164MB) to Supabase storage via presigned URLs
- Patched `file_url` in DB from `localhost:8000/media/...` to Supabase public URLs
- Fixed G55_ARK stuck in `processing/parsing` status → `ready/parsed`
- Ran `type_analysis` + `ingest_type_analysis` locally for all 3 models (166, 259, 4815 types)
- Synced `type_count` and `storey_count` from ModelAnalysis to Model records

### Backend: localhost URL guard
- `backend/apps/models/views.py`: Production rejects uploads with localhost file_url (HTTP 500 with clear message about missing S3 keys). DEBUG mode returns `storage_warning` in response.

### Frontend: Viewer error banner
- `frontend/src/pages/FederatedViewer.tsx`: Wired `onError` callback from UnifiedBIMViewer. Load failures show floating red banner over canvas.

### Frontend: Model cards honesty
- `frontend/src/pages/ProjectModels.tsx`: `type_count=0` on ready models now shows "Typer ikke analysert" (card + table views). Error status always shows error box even without `processing_error` field.

### Frontend: Dashboard stats error
- `frontend/src/pages/ProjectDashboard.tsx`: Changed `_statsError` → `statsError`, renders amber warning banner when stats API fails.

### Viewer improvements (earlier in session)
- `FederatedViewer.tsx`: Fixed sidebar showing UUIDs instead of model names — now uses `useModels` hook to look up `model.name`/`original_filename`. Also populates `elementCount` and fixes `detectDiscipline` to use actual filename.
- `CanvasOverlays.tsx`: Scaled up HUD (34→44px height, 24→32px buttons, 12→16px icons)
- `UnifiedBIMViewer.tsx`: Added `fitToView` and `setViewMode` (perspective/wireframe/xray) to imperative handle. Implemented wireframe (transparent wire material) and xray (15% opacity, double-sided) view modes via Three.js material swapping with original material restore.

### i18n
- Added keys to both `en.json` and `nb.json`: `modelStatus.noTypesAnalyzed`, `modelStatus.processingFailed`, `viewer.loadErrors.title`, `dashboard.statsError`

## Technical Details
- Root cause: `default_storage.url()` returns relative path, Django prepends `DJANGO_URL` (defaults to `localhost:8000`). No S3 keys locally = local filesystem storage.
- Type analysis uses `ifc_toolkit.analyze.type_analysis` which requires ifcopenshell + local IFC file. On Railway (production), the Celery/thread fallback silently fails because files are ephemeral.
- View mode implementation saves original materials in a Map keyed by mesh ID, replaces with MeshBasicMaterial for wireframe/xray, restores on switching back to perspective.
- `useImperativeHandle` had to be moved after `fitAllModelsToView` and `applyViewMode` declarations to fix TypeScript block-scoped variable errors.

## Next
- G55_RIBprefab (old) still has type_count=0 — needs analysis run
- Viewer HUD tools (wireframe/xray/fit) need testing with actual loaded models
- PlatformPanel left panel still uses old stacked model list — needs redesign per wireframe
- Propagate design tokens from wireframe to frontend CSS

## Notes
- Build passes clean
- The `storage_warning` in upload response isn't surfaced in frontend yet — would need UploadContext change
- `ViewerToolbar.tsx` can be deleted — confirmed nothing imports it
