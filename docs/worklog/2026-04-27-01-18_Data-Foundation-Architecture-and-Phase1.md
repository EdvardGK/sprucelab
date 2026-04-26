# Session: Data Foundation Architecture + Phase 1 IFC Hardening

## Summary
Designed and planned the evolution of Sprucelab from an IFC-only pipeline into a universal data platform (7-phase plan). Then implemented Phase 1: IFC Foundation Hardening, fixing 7 known parsing deficiencies. This session established the architectural vision (SourceFile -> ExtractionRun -> Extracted Data -> Intelligence layers) and the design principles (agent-first, no orphan files, no silent data loss).

## Changes

### Architecture & Planning
- Updated `CLAUDE.md` with agent-first design principle, multi-format data foundation architecture, layered processing model
- Created `docs/plans/2026-04-26-data-foundation-plan.md` — 7-phase plan covering IFC hardening, SourceFile/ExtractionRun abstraction, ProjectScope, IfcGrid, drawing extraction, document extraction, cross-format intelligence
- Saved key design decisions to memory: agent-first design, Speckle positioning, AECO market reality, drawing extraction (title block templates + axis registration), project scopes (footprint polygons, storey scoping)

### Phase 1: IFC Foundation Hardening (all 7 tasks complete)
- **1a Untyped elements**: `ifc_parser.py` — both `parse_types_only()` and `_extract_types()` now create synthetic types for elements without IfcTypeObject, grouped by (ifc_class, ObjectType). No more silent 10-30% data loss.
- **1b Type property extraction**: New `_extract_type_properties()` method extracts IsExternal, LoadBearing, FireRating, ThermalTransmittance, AcousticRating, Reference from Pset_*Common on IfcTypeObject. Values are typed (bool/float/str). Wired into both extraction paths.
- **1c Processing log**: `TypesOnlyResult` gains `log_entries` (structured JSON) and `quality_report` (summary dict). Every stage emits machine-readable entries. Flows through orchestrator to ProcessingReport.
- **1d Typed property storage**: `PropertySet` model gains `value_number` FloatField and `value_boolean` BooleanField. Parser populates typed columns alongside text fallback. Migration `0033_typed_property_values.py`.
- **1e File checksum**: `Model.checksum_sha256` CharField(64). SHA-256 computed streaming during upload (no OOM risk). Migration `0017_model_checksum_sha256.py`.
- **1f TypeBank transaction safety**: Already wrapped in `get_transaction()`. Added `link_failures` counter to stats for visibility.
- **1g Spatial containment**: Parses `IfcRelContainedInSpatialStructure`. Extracts storey elevations (with unit conversion). Builds `storey_type_distribution` mapping storey GUIDs to type instance counts.

## Technical Details
- The `parse_types_only()` path is what production uses. It iterates IfcTypeObject entities. The untyped tracking adds a second pass that builds a set of typed element GUIDs, then finds all IfcElement GUIDs not in that set, groups them by (ifc_class, ObjectType), and creates synthetic TypeData entries with deterministic GUIDs.
- Unit detection in processing log infers human-readable unit name from length_unit_scale (0.001 -> mm, 0.3048 -> ft, etc.)
- The storey-type distribution cross-references IfcRelContainedInSpatialStructure (element->storey) with IfcRelDefinesByType (element->type) to produce per-storey type counts.

## Next
- Run migrations (`0033_typed_property_values`, `0017_model_checksum_sha256`)
- Start Phase 2: SourceFile + ExtractionRun models
- Test Phase 1 changes with a real IFC file upload

## Notes
- The `_extract_types()` full-parse path was also updated (untyped elements + type properties) for consistency, though `parse_types_only()` is the production path.
- Storey elevations are now converted using `length_unit_scale`, fixing potential 1000x errors on mm-based Revit exports.
- Major strategic decisions captured in memory: Speckle positioning (we are workspace + PM they lack), AECO market reality (users not data-savvy, Excel/Word/PDF are the real interfaces), drawing title block templates as schemas, project scopes with footprint polygons for multi-building storey resolution.
