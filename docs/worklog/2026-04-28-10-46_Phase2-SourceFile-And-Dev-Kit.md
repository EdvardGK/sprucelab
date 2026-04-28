# Session: Phase 2 — SourceFile + ExtractionRun, plus an agent-first dev kit

## Summary

Built the Phase 2 layer of the data-foundation plan and an end-to-end harness
that proves it. Every uploaded file is now a `SourceFile` (Layer 0) with one
or more `ExtractionRun` records (Layer 1). The legacy `/api/models/upload/`
keeps working and silently creates the new rows. New universal endpoint
`/api/files/` is live. `ProcessingReport` is replaced as the live data source
by `ExtractionRun`; a compat shim keeps the old dev page working.

Alongside, dropped the dev kit: `Justfile`, `tools/python` shim (auto-activates
the `sprucelab` conda env), `tools/api` curl wrapper, `tools/routes.py`
URL-conf inventory, `pytest.ini` + `tests/conftest.py` with a session-scoped
FastAPI subprocess fixture pointed at pytest-django's test DB, and a synthetic
IFC factory that builds a real IFC4 file in tmp per session (no committed
binaries).

Three e2e tests pass end-to-end: universal upload, legacy upload, dedup.

## Changes

### Phase 2 schema + code

- `backend/apps/models/models.py` — added `SourceFile` + `ExtractionRun`
  classes, plus `Model.source_file` FK (nullable, `SET_NULL`).
- `backend/apps/models/migrations/0018_create_source_file_and_extraction_run.py`
  — generated; new tables + FK on Model.
- `backend/apps/models/migrations/0019_backfill_source_files.py` — hand-written
  RunPython data migration: creates a `SourceFile` per existing `Model`,
  resolves `parent_file` from `Model.parent_model`, and projects each
  `ProcessingReport` into a corresponding `ExtractionRun`.
- `backend/apps/models/serializers.py` — added `SourceFileSerializer`,
  `SourceFileListSerializer`, `ExtractionRunSerializer`,
  `ExtractionRunListSerializer`, `SourceFileUploadSerializer`.
- `backend/apps/models/files_views.py` — new `SourceFileViewSet`
  (list/retrieve/upload/extractions/reprocess) and `ExtractionRunViewSet`
  (read-only). Includes `store_uploaded_file` + `get_or_create_source_file`
  helpers reused by the legacy upload paths.
- `backend/apps/models/files_urls.py` — `/api/files/` router.
- `backend/config/urls.py` — wired `path('api/files/', include(...))`.
- `backend/apps/models/views.py` — `upload()`, `confirm_upload()`,
  `upload_with_metadata()` now create / reuse a SourceFile and an
  ExtractionRun, and forward `source_file_id` + `extraction_run_id` to the
  FastAPI dispatcher.

### Orchestrator + repository

- `backend/ifc-service/repositories/ifc_repository.py` — new
  `create_extraction_run` / `update_extraction_run` writing to the new
  `extraction_runs` table.
- `backend/ifc-service/services/processing_orchestrator.py` —
  `process_model_types_only` accepts `source_file_id` + `extraction_run_id`,
  resolves the run via `_resolve_extraction_run` (request → SourceFile →
  Model.source_file fallback → None), drives `running → completed/failed`,
  and writes `quality_report` + `log_entries` + discovered length-unit via
  `_finalize_extraction_run`. `_create_types_only_report` removed —
  `processing_reports` is no longer written by the production path.
- `backend/ifc-service/api/ifc_process.py` — `ProcessRequest` plumbed through
  background task + sync endpoints; `ProcessResponse` now carries
  `extraction_run_id` (with `processing_report_id` aliased to it for one
  cycle).
- `backend/ifc-service/models/schemas.py` — added the new optional fields
  to `ProcessRequest` / `ProcessResponse`.

### Compat shim

- `backend/apps/entities/views/legacy.py` — `ProcessingReportViewSet` rewritten
  as a `viewsets.ViewSet` that pulls `ExtractionRun` rows and re-shapes them
  into the `ProcessingReportSerializer` wire format. Frontend dev page keeps
  working unchanged.

### Latent-bug cleanups

- `backend/apps/automation/migrations/0001_initial.py` — generated; the app
  had `models.py` but no migrations, breaking fresh DB setup.
- `backend/ifc-service/services/validation/__init__.py` — dropped the dead
  import of `bep_loader` (file deleted in the simplification sprint).

### Dev kit

- `Justfile` (root) — `up`, `down`, `nuke`, `dev`, `dev-stop`, `migrate`,
  `migrations`, `psql`, `seed`, `reset-db`, `test`, `test-e2e`, `test-all`,
  `api`, `routes`, `logs`, `status`, `shell`. Recipes that touch a DB run
  through `_safety-check`, which refuses to run unless `DATABASE_URL` points
  at localhost / the dev container.
- `tools/python` — Bash shim that auto-activates the `sprucelab` conda env so
  recipes work from any shell.
- `tools/api` — curl wrapper that prepends `/api/` and the active
  `DJANGO_URL`.
- `tools/routes.py` — flat URL conf inventory (`--json` for machine output).
- `pytest.ini` — `DJANGO_SETTINGS_MODULE=config.settings`, `pythonpath=backend`,
  markers `e2e` / `slow`.
- `tests/conftest.py` — pytest-config-time SAFETY check (refuses non-localhost
  DBs); auto-fixtures opening permissions and aligning `DJANGO_URL` /
  `IFC_SERVICE_URL` with `live_server` and the FastAPI subprocess; the
  subprocess fixture itself; `project` and `sample_ifc_path` factories.
- `tests/fixtures/ifc_factory.py` — builds a tiny IFC4 file (project, site,
  building, storey, one wall + type, one untyped proxy) per session.
- `tests/e2e/test_upload_pipeline.py` — three e2e tests: universal upload,
  legacy upload, byte-level dedup.
- `.env.test.example` — committed template.

### Misc

- `.env.dev` restored from `.env.dev.bak` so local dev (and pytest-django's
  test DB creation) actually points at local Postgres. Without this Django
  fell through to `backend/.env.local` which points at production Supabase.

## Verification

- `tools/python -m pytest tests/ -v` → 6 passed (3 unit smoke + 3 e2e).
- `tools/python tools/routes.py | grep '^api/files'` → 12 routes registered.
- The migration chain (0001 → 0019) applies cleanly to a fresh test DB
  built by pytest-django.

## Next

- Frontend Dev page (`/dev/processing-reports`) is on the compat shim. Phase
  2.5: migrate `frontend/src/hooks/use-processing-reports.ts` to call
  `/api/files/.../extractions/` directly, then drop the shim and the
  `processing_reports` table.
- `Model.file_url` / `file_size` / `original_filename` are denormalized over
  `Model.source_file`. Pick a phase to remove them once frontend stops reading
  them directly.
- Phase 3 (`ProjectScope`) — adds `scope` FK to `SourceFile`, `Model`,
  `ViewerGroup`. Plan section already drafted.
- The user's local `.env.dev` was missing — they may have rolled back to prod
  intentionally. Worth a chat next session.

## Notes

- The conftest's `_safety-check` is paranoid by design. Combined with the
  Justfile's `_safety-check`, it's effectively impossible to run the harness
  against the production Supabase even if `DATABASE_URL` leaks in.
- The synthetic IFC strategy (no committed binaries) keeps the test data
  honest against the current ifcopenshell version. ~5 KB built fresh per
  session, deterministic.
- `just` is in Arch's official repos: `sudo pacman -S just`. The Justfile
  works without it via `bash` invocations of the same recipes if needed —
  but it's worth installing.
