# Sprucelab Data Foundation Plan

## Context

Sprucelab currently has an IFC-only pipeline: upload IFC -> extract types -> classify -> verify -> dashboard. The current parsing layer has real deficiencies (silent data loss, untyped elements dropped, no processing visibility) and the Model is hardcoded to IFC.

The goal is to evolve into a universal data platform where any file dropped in becomes a searchable, queryable data stream. Not a file manager with a viewer -- a data platform that happens to store files.

**Design principles:**
- Agent-first, human-second (APIs/CLI/pipeline serve automation; GUI serves AECO users who work in Excel/Word/PDF)
- No file is an orphan -- every format feeds the whole
- No silent data loss -- every extraction produces a visible quality report
- CRS and units are discovered during extraction (Layer 1), not assumed at upload (Layer 0)

---

## Architecture

```
Layer 0 - SourceFile:     Filesystem facts (name, size, format, checksum)
Layer 1 - ExtractionRun:  What the extractor discovered (CRS, units, structure, log, quality report)
Layer 2 - Extracted Data:  Format-specific (IFCType, DrawingSheet, DocumentContent, etc.)
Layer 3 - Intelligence:    TypeBank, classification, cross-format search, project health
```

---

## Phase 1: IFC Foundation Hardening

**Goal:** Fix known parsing deficiencies before adding complexity.

**Files to modify:**
- `backend/ifc-service/services/ifc_parser.py` -- all extraction fixes
- `backend/ifc-service/repositories/ifc_repository.py` -- transaction safety, typed writes
- `backend/apps/entities/models/core.py` -- typed property fields
- `backend/apps/models/models.py` -- checksum field

### 1a. Untyped element tracking
- Elements without ObjectType get synthetic types per ifc_class (e.g., `IfcBuildingElementProxy::<untyped>`)
- Uses existing `has_ifc_type_object=False` pattern. No schema change needed.

### 1b. Type property set extraction
- Extract Pset_*Common from IfcTypeObject (IsExternal, LoadBearing, FireRating, ThermalTransmittance)
- Populate `IFCType.properties` JSON (field exists, currently sparse)
- Feed into `TypeBankEntry.pct_is_external` / `pct_load_bearing` / `pct_fire_rated`

### 1c. Processing log visibility
- Each parsing stage emits structured log entries: `{stage, level, message, count, details}`
- Log: elements dropped (count + reasons), properties skipped, unit conversions, CRS detection
- Exposed via existing ProcessingReport API

### 1d. Typed property storage
- Add to PropertySet: `value_number` FloatField(null), `value_boolean` BooleanField(null)
- `property_value` (text) always populated as fallback
- Parser infers type and populates typed column alongside text

### 1e. File checksum
- Add `checksum_sha256` CharField(64) to Model
- Compute on upload, verify before processing

### 1f. TypeBank transaction safety
- Wrap `link_types_to_typebank()` in database transaction
- On failure, roll back entire batch (no partial writes)

### 1g. Spatial containment parsing
- Parse `IfcRelContainedInSpatialStructure` during types-only extraction
- Build storey-type distribution: `{storey_guid: {type_guid: count}}`
- Critical prerequisite for scope-based storey filtering

**Verify:** Upload known IFC before/after. Type count should increase (untyped visible). Properties should have typed values. Processing log shows drop counts. Checksum stored.

---

## Phase 2: SourceFile + ExtractionRun

**Goal:** Format-agnostic file layer. Existing Model keeps working via backward-compatible FK.

**Files to create/modify:**
- `backend/apps/models/models.py` -- add SourceFile, ExtractionRun models + FK on Model
- `backend/apps/models/views.py` -- upload creates SourceFile first
- `backend/ifc-service/services/processing_orchestrator.py` -- writes to ExtractionRun

### New models

**SourceFile** (Layer 0):
- `id`, `project`, `original_filename`, `file_url`, `file_size`, `checksum_sha256`
- `format` (ifc|las|laz|e57|dwg|dxf|pdf|docx|xlsx|pptx|csv|json|xml|svg)
- `mime_type`, `version_number`, `parent_file`, `is_current`
- `uploaded_by`, `uploaded_at`
- `scope` FK (nullable, assigned after extraction or manually -- Phase 3)

**ExtractionRun** (Layer 1):
- `id`, `source_file` FK, `status` (pending|running|completed|failed)
- `started_at`, `completed_at`, `duration_seconds`
- `discovered_crs`, `crs_source`, `crs_confidence`
- `discovered_units` JSON (`{length: "mm", area: "m2", angle: "deg"}`)
- `quality_report` JSON (`{total_elements, typed, untyped, dropped: [{class, count, reason}]}`)
- `log_entries` JSON (`[{timestamp, level, stage, message, details}]`)
- `error_message`, `extractor_version`, `task_id`

### Migration strategy
1. Create `source_files` and `extraction_runs` tables
2. Add nullable `source_file` FK to `Model`
3. Data migration: backfill SourceFile for every existing Model, create completed ExtractionRun for each

### New API endpoints
- `GET/POST /api/files/` -- list/upload SourceFiles (universal upload, format auto-detected)
- `GET /api/files/{id}/` -- detail with extraction runs
- `GET /api/files/{id}/extractions/` -- ExtractionRun list
- `GET /api/files/{id}/extractions/{run_id}/` -- run detail with log + quality report

**Verify:** Upload IFC -> SourceFile + ExtractionRun created. Existing `/api/models/` unchanged. Re-extract same file produces new ExtractionRun.

---

## Phase 3: ProjectScope

**Goal:** Nestable scope hierarchy replacing ViewerGroup as organizational foundation. Scoped storey resolution for multi-building projects.

**Files to create/modify:**
- `backend/apps/projects/models.py` -- add ProjectScope
- `backend/apps/models/models.py` -- add scope FK to SourceFile and Model
- `backend/apps/viewers/models.py` -- add scope FK to ViewerGroup
- `backend/apps/projects/services/scope_assignment.py` -- auto-assignment logic

### ProjectScope model
- `id`, `project`, `parent` (self-FK, nestable), `name`, `scope_type` (project|building|wing|floor|zone|custom)
- `axis_grid_bounds` JSON (`{from_u: "A", to_u: "F", from_v: "1", to_v: "12"}`)
- `storey_elevation_min`, `storey_elevation_max`
- `footprint_polygon` JSON (`[[x,y], ...]` -- from ARK model exterior + offset)
- `storey_merge_tolerance_m` FloatField (default 0.2, applies WITHIN this scope only)

### Storey scoping logic
- Storeys assigned to scopes via footprint polygon containment
- Merge tolerance applies within scope, never across scopes
- Building A floor 1 at +0.00m and Building B floor 1 at +0.30m stay separate

### ViewerGroup migration
- ViewerGroup gains nullable `scope` FK
- Existing groups unaffected. New groups optionally reference a scope.
- ViewerGroup becomes a display concern; scope is the data concern.

### API endpoints
- `GET/POST /api/projects/{id}/scopes/` -- scope tree CRUD
- `POST /api/projects/{id}/scopes/{id}/assign-files/` -- assign files to scope
- `GET /api/projects/{id}/scopes/{id}/files/` -- all files in scope (any format)

**Verify:** Create 2-building project. Assign models per scope. Storeys resolve independently. ViewerGroup filters by scope.

---

## Phase 4: IfcGrid Extraction + Storey Scoping

**Goal:** Extract building axis grids from IFC. Required for drawing registration (Phase 5).

**Files to modify:**
- `backend/ifc-service/services/ifc_parser.py` -- IfcGrid extraction
- Possibly new model or JSON storage on ExtractionRun

### What to extract
- IfcGrid entities: U-axes and V-axes with labels and positions
- Store as `ExtractionRun.discovered_grid` JSON: `{u_axes: [{label, position}], v_axes: [{label, position}]}`
- Grid positions in project coordinates (resolved from IfcObjectPlacement)

**Verify:** Upload IFC with IfcGrid -> grid data visible in ExtractionRun. Axis labels match source model.

---

## Phase 5: Drawing Extraction

**Goal:** DWG/DXF and PDF drawings become structured, searchable data with title block parsing and axis registration.

**Files to create:**
- `backend/ifc-service/services/drawing_extractor.py` -- extraction service
- `backend/apps/entities/models/drawings.py` -- DrawingSheet, TitleBlockTemplate, DrawingRegistration

### DrawingSheet model
- `source_file` FK, `extraction_run` FK
- `sheet_number`, `sheet_name`, `page_index` (for multi-page PDF)
- `width_mm`, `height_mm`, `scale`
- `title_block_data` JSON (parsed against template)
- `scope` FK (auto-assigned from title block)

### TitleBlockTemplate model (per project, defined in setup)
- `project` FK, `name`
- `fields` JSON: `[{name, label, region: {x,y,w,h}, type: "text"|"lookup", maps_to: "scope.floor"|"discipline"|"mmi_level"}]`
- Title block fields link to project entities (storeys, disciplines, MMI)

### DrawingRegistration model
- `drawing_sheet` OneToOne
- Two reference points: `ref1_paper_x/y`, `ref1_grid_u/v`, `ref2_paper_x/y`, `ref2_grid_u/v`
- Grid labels (e.g., "A", "3") resolved to model coordinates via IfcGrid from Phase 4
- Computed `transform_matrix` (affine, paper -> grid space)

### Extraction libraries
- DWG/DXF: `ezdxf` (layers, blocks, text entities, dimensions)
- PDF drawings: `pdfplumber` / `pymupdf` (text with coordinates, line geometry)

### API endpoints
- `GET /api/projects/{id}/drawings/` -- all drawing sheets
- `GET/POST /api/projects/{id}/title-block-templates/` -- template CRUD
- `POST /api/projects/{id}/drawings/{id}/register/` -- submit axis reference points

**Verify:** Upload DWG -> DrawingSheet records with layers/text. Define title block template -> upload PDF drawing -> title block auto-parsed. Register two axis crosses -> transform computed.

---

## Phase 6: Document Extraction (parallel with Phase 5)

**Goal:** PDF, Word, Excel, PowerPoint become searchable markdown/JSON content.

**Files to create:**
- `backend/ifc-service/services/document_extractor.py`
- `backend/apps/entities/models/documents.py` -- DocumentContent

### DocumentContent model
- `source_file` FK, `extraction_run` FK
- `markdown_content` TextField (for PDF/DOCX/PPTX)
- `structured_data` JSON (for XLSX/CSV: `{sheets: [{name, columns, rows, types}]}`)
- `page_count`, `structure` JSON (sections, tables, headings)
- `extracted_images` JSON (`[{url, page, description}]`)
- `search_text` TextField (normalized for full-text search)
- `scope` FK

### Extraction rules
- PDF: detect drawing vs document (page dimensions, text density). Drawings -> Phase 5. Documents -> markdown.
- Scanned PDFs: flag `extraction_method: "ocr"` vs `"text_layer"` in quality report
- DOCX -> markdown preserving headings, lists, tables
- XLSX -> typed JSON (numbers stay numbers, dates stay dates)
- PPTX -> markdown per slide + extracted images
- Original SourceFile always untouched. Conversion is Layer 1 output.

### API endpoints
- `GET /api/projects/{id}/documents/` -- all document content
- `GET /api/projects/{id}/documents/{id}/content/` -- raw markdown or JSON
- `GET /api/projects/{id}/search/?q=...` -- full-text search across all documents

**Verify:** Upload PDF -> markdown extraction, searchable. Upload Excel -> typed JSON, multi-sheet. Search returns cross-document results.

---

## Phase 7: Cross-Format Intelligence

**Goal:** Connect data across all formats. Universal search. Project health per scope.

### Universal search
- PostgreSQL full-text search across: document markdown, drawing title blocks, IFC type names, TypeBank entries
- `GET /api/projects/{id}/search/?q=...&format=ifc,pdf,xlsx&scope={id}`
- Unified result format: `{source_file, format, match_context, scope, relevance}`

### Cross-format linking
- Document references mentioning type names -> linked to TypeBank entries
- Drawing title block metadata -> linked to scopes and IFC storeys
- "REI60" in a PDF spec + "REI60" in IFC wall type -> connected

### Project health per scope
- Unified health score: IFC classification coverage + drawing completion + document freshness
- "Building A: 5 IFC models (92% classified), 12 drawings (all registered), 3 specs (extracted)"

---

## Dependency Graph

```
Phase 1 (IFC Hardening)
    │
Phase 2 (SourceFile + ExtractionRun)
    │
Phase 3 (ProjectScope)
   ╱ ╲
Phase 4    Phase 5         Phase 6
(Grid)     (Drawings)      (Documents)
   ╲          ╲              ╱
     Phase 7 (Cross-Format Intelligence)
```

Phases 5 and 6 are parallel tracks. Phase 4 is small and can ship alongside Phase 5.

## Migration Strategy

All phases use additive migrations. No columns dropped. No breaking changes.

| Phase | Tables created | FKs added | Data migration |
|-------|---------------|-----------|----------------|
| 1 | None | None | None (code changes only + 2 fields on PropertySet, 1 on Model) |
| 2 | source_files, extraction_runs | Model.source_file | Backfill SourceFile + ExtractionRun for existing Models |
| 3 | project_scopes | SourceFile.scope, Model.scope, ViewerGroup.scope | None |
| 4 | None (JSON on ExtractionRun) | None | None |
| 5 | drawing_sheets, title_block_templates, drawing_registrations | DrawingSheet.scope | None |
| 6 | document_content | DocumentContent.scope | None |
| 7 | None (search indexes) | None | Build FTS indexes |
