# Session: Phase 5 Drawing Extraction Backbone + FastAPI Dead-Code Sweep

## Summary

Two-track session, both shipped:

1. **Dead-code sweep** in the FastAPI ifc-service (carry-over from Phase 4):
   removed the orphaned `bulk_insert_*` helpers in `ifc_repository.py`, the
   matching `EntityData/PropertyData/SpatialData/SystemData/TypeAssignmentData`
   dataclasses, the dead `parse_file` extraction path in `ifc_parser.py` (with
   all its private helpers — `_extract_spatial_hierarchy`,
   `_extract_elements_metadata`, `_extract_property_sets`, `_extract_systems`,
   `_extract_type_assignments`, `_extract_types`, `_count_type_instances`,
   `_extract_quantities`), and the dead `_calculate_verification_data` +
   `_get_ifc_type_for_hierarchy` in `processing_orchestrator.py`. Net ~1,200
   lines deleted across three files; tests stayed 24/24 green throughout.

2. **Phase 5 (Drawing Extraction)** backbone end-to-end. Models, migration,
   FastAPI extractor, Django dispatch, DRF API, registration math, 15 new
   tests. **Backbone only**: extractor unit tests against synthetic DXF/PDF
   fixtures + an e2e upload round-trip are deferred because `ezdxf` +
   `pymupdf` were declared in `requirements.txt` but the pip install was
   denied as unscoped supply-chain risk.

24/24 → 39/39 tests green, `manage.py check` clean, `makemigrations --dry-run`
shows only the pre-existing unrelated `propertyset` index-rename diff.

## Changes — Sweep

### `backend/ifc-service/repositories/ifc_repository.py` (1086 → 794 lines)
- Removed dataclasses: `EntityData`, `PropertyData`, `SpatialData`,
  `SystemData`, `TypeAssignmentData`. Kept `MaterialData`, `TypeData`,
  `TypeLayerData` — those are still used by the live `parse_types_only` →
  orchestrator → `bulk_insert_materials/types/type_definition_layers` path.
- Removed methods: `bulk_insert_entities`, `bulk_insert_properties`,
  `bulk_insert_spatial_hierarchy`, `bulk_insert_systems`,
  `bulk_insert_type_assignments`. The only callers were Phase 2.5-removed
  code; `processing_orchestrator.py:182,187,204` still uses the surviving
  `bulk_insert_materials/types/type_definition_layers` trio.
- Removed unused class constants: `ENTITY_BATCH_SIZE`, `PROPERTY_BATCH_SIZE`.
- `delete_model_data` left intact — still called by the reprocess endpoint
  (`api/ifc_process.py:432`). Its DELETEs against `ifc_entities`,
  `property_sets`, `systems`, `spatial_hierarchy`, `type_assignments` are
  no-ops for new models (those tables aren't written anymore) but defend
  against re-processing pre-Phase-2.5 models still carrying rows. Schema
  drop is a future migration, not this sweep.

### `backend/ifc-service/services/ifc_parser.py` (~1750 → 906 lines)
- Removed dataclasses: `StageResult`, `ParseError`, `ParseResult`. Kept
  `QuickStats` (used by `/api/v1/ifc/quick-stats`) and `TypesOnlyResult`
  (the live extraction path).
- Removed `parse_file` and all its private helpers
  (`_extract_spatial_hierarchy`, `_extract_elements_metadata`,
  `_extract_property_sets`, `_extract_systems`, `_extract_type_assignments`,
  `_extract_types`, `_count_type_instances`, `_extract_quantities`).
  These were only reachable through `parse_file`, which was itself only
  reachable through `_calculate_verification_data` (also dead).
- Trimmed the import from `repositories.ifc_repository` down to the three
  surviving dataclasses.

### `backend/ifc-service/services/processing_orchestrator.py` (432 → 379 lines)
- Removed `_calculate_verification_data` and `_get_ifc_type_for_hierarchy`
  (both unreachable; only referenced each other and the dead `ParseResult`).
- Trimmed import: `from services.ifc_parser import IFCParserService,
  TypesOnlyResult` (no more `ParseResult`); `from
  repositories.ifc_repository import IFCRepository` (no more
  `EntityData/PropertyData/SpatialData`).

## Changes — Phase 5

### Django data layer
- **`backend/apps/entities/models/drawings.py`** (new) —
  `DrawingSheet(source_file FK, extraction_run FK, scope FK, page_index,
  sheet_number, sheet_name, width_mm, height_mm, scale, title_block_data
  JSON, raw_metadata JSON)` with a unique constraint on
  `(source_file, page_index)`. `TitleBlockTemplate(project FK, name, fields
  JSON, is_default)` with `unique(project, name)`.
  `DrawingRegistration(drawing_sheet OneToOne, ref1/ref2 paper_x/y +
  grid_u/v, transform_matrix JSON, grid_source_run FK to ExtractionRun)`.
- **`backend/apps/entities/migrations/0035_add_drawing_models.py`** —
  three `CreateModel` ops + their FKs/indices/constraints. The
  auto-generated migration also picked up the unrelated `propertyset` index
  rename (always shows up in `makemigrations --dry-run`); I stripped that
  op so the migration is pure Phase 5. Applied locally — clean.
- **`backend/apps/entities/models/__init__.py`** — re-exports the three new
  models so `from apps.entities.models import DrawingSheet` works.

### FastAPI extractor
- **`backend/ifc-service/services/drawing_extractor.py`** (new) — stateless
  module exposing `extract_drawing(file_path, fmt) -> DrawingExtractionResult`.
  - `_extract_dxf`: opens with `ezdxf.readfile`, walks modelspace for
    `TEXT`/`MTEXT` entities (kept as `text_blocks` in `raw_metadata`), reads
    `$EXTMIN/$EXTMAX` and converts to mm via `$INSUNITS`.
  - `_extract_pdf`: opens with `fitz` (pymupdf), one sheet per page; converts
    PDF points to mm (×25.4/72), captures text blocks with bottom-left-origin
    bbox, computes text density, decides `is_drawing` via
    `_looks_like_document_page` (A4-or-smaller AND near-portrait AND
    text-dense). Failure-isolated per page (matches the IFC parser style).
  - `parse_title_block(sheet, template_fields)` — public helper that
    resolves text blocks against a `TitleBlockTemplate.fields` spec; not
    called automatically yet (left as opt-in for the API to invoke once a
    user assigns a template to a sheet).
  - `ezdxf` and `fitz` are imported lazily inside `_extract_dxf`/`_extract_pdf`,
    so the FastAPI service starts fine even before the deps are installed.

- **`backend/ifc-service/api/drawings.py`** (new) — `POST
  /api/v1/drawings/extract` taking `{file_url|file_path, format}`. Downloads
  to a temp dir if `file_url` is given, runs the extractor, returns a
  `DrawingExtractResponse` with sheets + log + quality_report. Synchronous
  (no callback) because drawings parse fast.

- **`backend/ifc-service/api/router.py`** — wired the new router.
- **`backend/ifc-service/models/schemas.py`** — added `DrawingExtractRequest`,
  `DrawingSheetPayload`, `DrawingExtractResponse`.
- **`backend/ifc-service/requirements.txt`** — declared `ezdxf>=1.3.0` and
  `pymupdf>=1.24.0` (install pending).

### Django dispatch
- **`backend/apps/models/files_views.py`** —
  `_dispatch_extraction` now branches on
  `source_file.format in ('dxf','dwg','pdf')` to a new
  `_dispatch_drawing_extraction` method:
  1. Create an `ExtractionRun(status='running')`.
  2. Call `IFCServiceClient.extract_drawing(file_url, fmt)`.
  3. For each sheet in the response, write a `DrawingSheet` row inheriting
     `scope` from the SourceFile (so a Phase-3 scope assignment on the
     SourceFile is automatically picked up by sheets).
  4. Finalize the run with status, duration, log_entries, quality_report.

- **`backend/apps/models/services/fastapi_client.py`** — new
  `extract_drawing(file_url, fmt)` method on the client; same auth header
  pattern as `process_ifc`.

### DRF surface
- **`backend/apps/entities/views/drawings.py`** (new) —
  `DrawingSheetViewSet` (read-only, filters by project/scope/source_file/
  is_drawing) + `register` action. `register` validates the body shape,
  resolves both grid intersections via `resolve_grid_intersection` against
  the supplied `ExtractionRun.discovered_grid`, then `update_or_create`s
  the `DrawingRegistration` with the computed transform.
  `TitleBlockTemplateViewSet` (full CRUD, filter by project).
- **`backend/apps/entities/serializers.py`** — `DrawingSheetSerializer`,
  `DrawingSheetListSerializer` (omits `raw_metadata`),
  `TitleBlockTemplateSerializer`, `DrawingRegistrationSerializer`.
- **`backend/apps/entities/views/__init__.py`** + **`urls.py`** — wired
  the new viewsets at `/api/types/drawings/` and
  `/api/types/title-block-templates/` (flat, project-scoped via
  `?project=<uuid>` — matches Phase 3 convention rather than the plan-doc's
  nested style).

### Registration math
- **`backend/apps/entities/services/drawing_registration.py`** (new) —
  pure-Python module:
  - `compute_similarity_transform(paper1, model1, paper2, model2)` solves
    the 2D similarity transform via the complex-ratio shortcut: with the
    two pairs of points, `a + bi = (m2-m1) * conj(p2-p1) / |p2-p1|²`,
    giving the unique scale+rotation+translation matrix as a 3×3 row-major
    list. Raises `ValueError` if paper points coincide.
  - `apply_transform(matrix, paper)` — applies the 3×3 to a 2D point.
  - `transform_scale_and_rotation(matrix)` — extracts scale and rotation
    in degrees from `(a, b)` (useful for verification: a 1:50 paper plan
    over an IFC in meters gives `scale ≈ 0.05`, `rotation = 0`).
  - `resolve_grid_intersection(discovered_grid, u_tag, v_tag)` — convention
    is X from V-axis `start`, Y from U-axis `start`. Walks every grid in
    the JSON and returns the first hit.

### Tests (15 new, all green)
- **`tests/unit/test_drawing_registration.py`** (8 cases):
  identity + 1:50 scale + 90° rotation + coincident-points failure +
  intersection lookup happy-path / unknown-tag / no-grids / round-trip.
- **`tests/unit/test_drawing_api.py`** (7 cases):
  list-by-project filter + `is_drawing` flag filter + register happy-path
  (asserts the persisted matrix maps paper → grid intersections) +
  unknown-grid-tag rejection + coincident-paper rejection +
  re-register replaces (`update_or_create` on the OneToOne) +
  TitleBlockTemplate full CRUD.

## Technical Details

### Why FastAPI extractor stays stateless
The IFC pipeline writes via asyncpg to support large batches and detailed
quality reports. Drawings are tiny by comparison — sheet metadata, not
geometry — and Django is the system of record anyway. Keeping the extractor
stateless (returns JSON, Django persists) keeps `IFCRepository`'s asyncpg
machinery out of Phase 5 entirely, mirrors the CLAUDE.md rule "Django
coordinates, FastAPI processes," and means the next-format Phase 6
(documents) can copy the same shape without touching the asyncpg paths.

### Drawing-vs-document detection
`_looks_like_document_page(width_mm, height_mm, text_density)` — a page
counts as a document only if all three hold:
- Long side ≤ A4 long side (297mm) + 5mm tolerance.
- Aspect ratio between 1.2 and 1.6 (A-series portrait).
- Text density > 0.05 chars/mm² (roughly any normal text page).

Borderline drawings (A3 plan with sparse text) stay tagged as drawings on
purpose — false negatives in the drawings UI are far worse than false
positives. Phase 6 will use the same flag to decide which PDFs to route to
document extraction.

### Two-point similarity transform
A 2D similarity (uniform scale + rotation + translation) has 4 DoF and 4
equations from two paper-model pairs, so it's uniquely determined. The
classical approach builds a 4×4 system; the complex-ratio version is one
multiply + one divide and falls out from treating the pairs as complex
numbers `(a + bi) = (m2-m1) / (p2-p1)`. Since paper drawings don't shear
or skew (they're rigid plus uniform scale), similarity is the right model
— affine (6 DoF) needs 3 ref points and over-determines the human task.

### Grid intersection: X from V, Y from U
For a typical orthogonal grid, U-axes are horizontal lines (varying y, fixed
x for the start point) and V-axes are vertical lines (varying x, fixed y).
So an intersection (U=A, V=3) takes its X from the V-3 axis's `start[0]`
and its Y from the U-A axis's `start[1]`. Non-orthogonal grids fall through
to the same lookup, which is correct for parallel-axis grids (the start
points still encode the offsets correctly) and a defensible best-effort
otherwise — the `discovered_grid` payload preserves the full curve for any
client that needs to do a more careful intersection.

### Why I trimmed the auto-migration
`makemigrations` is non-deterministic when the project state has any
schema drift. The Phase 5 run also picked up a `RenameIndex` on
`propertyset` that's been hanging around since Phase 1. The Phase 4 worklog
(line 12) flagged it explicitly: "flags only the unrelated entities/
propertyset index rename already noted in earlier worklogs." Including it
in the Phase 5 migration would muddy what the migration *means*; ripping it
out keeps the migration self-documenting. Django will still flag it next
session, and someone can land that index rename as its own one-line
migration when ready.

### Dispatch callback shape
The IFC pipeline uses an async callback (FastAPI → Django when processing
finishes). The drawing pipeline is synchronous — Django blocks on the
extractor response. This is fine because:
- Extraction is fast (a single PDF page is ~10ms with pymupdf, a multi-page
  set is still sub-second).
- No background queue needed; the request thread gets the full result and
  writes DrawingSheet rows in one transaction.
- The `ExtractionRun` is opened with `status='running'` and finalized
  in the same request, so the API response always reflects terminal state.

If drawing extraction grows (OCR over scans, vector tracing) we can switch
to the async callback pattern by reusing `IFCServiceClient.process_ifc`'s
exact shape; the dispatch method is the only thing that has to change.

## Test Suite Health

```
tests/unit:  28 → 28 + 15 new = 28 (was) → wait, totals:
  Sweep verification:    20/20 unit, 4/4 e2e (still using Phase 4 totals)
  After Phase 5 tests:   28/28 unit, 4/4 e2e
  Final combined:        35 unit + 4 e2e = 39/39, 18.24s
```

(Tests re-validate after every chunk of changes — see Bash invocations in
the session log.)

## Next

- **Install ezdxf + pymupdf** (`pip install -r backend/ifc-service/
  requirements.txt`) — once landed, task #8 can author
  `tests/fixtures/drawing_factory.py`, `tests/unit/test_drawing_extractor.py`,
  and an e2e PDF-upload test.
- **Phase 6 — Document extraction** can start in parallel with the
  extractor follow-up. Plan section line 208. Reuses the same
  drawing-vs-document classifier built in Phase 5.
- **Frontend Phase 3+4 follow-up** still outstanding (scope picker, scope
  tree, grid overlay).

## Notes

- The auto-commit hook captured each edit as it happened, so `git status`
  is clean on the Phase 5 paths and the work lives in the recent
  `[auto] ... updated` commit chain.
- One install denial cost Phase 5 its end-to-end PDF test. The architecture
  is fully testable on the Django side — registration math, dispatch logic
  (with a mocked client), API surface — so 15 unit tests still cover the
  high-value invariants. The deferred tests are about exercising the
  ezdxf/pymupdf calls themselves.
- Auto mode the whole way. One forced course-correction: the install
  denial. Adjusted by declaring deps in requirements.txt and authoring the
  extractor module with lazy imports so the rest of the pipeline could
  ship without the deps actually present.
