# Session: Stakeholder MVP Requirements - All 3 Sprints COMPLETE

**Date**: 2026-02-07
**Status**: All 3 Sprints COMPLETE (core features)

---

## Summary

Received comprehensive stakeholder feedback defining 3 sprints for MVP. Analyzed alignment with existing architecture (~70% already built). Completed all three sprints: The Vault (data integrity), The Gatekeeper (discipline filtering), and The Mapper (spatial stitching).

## Stakeholder Requirements (Key Points)

1. **BIM Manager**: NS3451 "Firewall" - auto-demote types outside model's discipline
2. **Proptech**: "Shadow Types" (= TypeBankEntry), hash-based matching, material normalization
3. **Project Manager**: Immutable audit trail - data survives model deletion
4. **Operator**: Spatial stitching - link MEP objects to rooms via point-in-volume

## Confirmed Decisions

1. **Sprint Order**: Vault → Gatekeeper → Mapper (fix data loss first)
2. **Discipline Source**: Extract from IFC filename patterns
3. **Model-level discipline**: Explicit `Model.discipline` field + `is_primary_for_discipline` flag
4. **ARK model = source of truth** for rooms/zones

---

## What Was Completed

### Sprint 2: The Vault (Data Integrity) - COMPLETE

**✅ Done:**
- Changed `TypeBankObservation.source_model` from `CASCADE` to `SET_NULL`
- Changed `TypeBankObservation.source_type` from `CASCADE` to `SET_NULL`
- Added `is_historical` and `archived_at` fields to TypeBankObservation
- Added `phase` and `block_on_new_types` fields to ProjectConfig
- Created migrations:
  - `apps/entities/migrations/0026_sprint2_vault_immutable_audit.py`
  - `apps/projects/migrations/0003_sprint2_vault_immutable_audit.py`
- **Migrations applied successfully**
- Created `ingestion_gate.py` service with:
  - `check_ingestion_gate()` - Phase gate enforcement
  - `mark_observations_historical()` - Audit trail preservation
  - `get_project_type_health()` - Health KPI metrics

**⏳ Deferred to Later:**
- Hash-based type matching fallback (in ifc_repository.py) - optional enhancement

---

### Sprint 1: The Gatekeeper (Discipline Filtering) - COMPLETE

**✅ Done:**
- Added `discipline` and `is_primary_for_discipline` to Model model
- Added `infer_discipline_from_filename()` helper function
- Added `discipline_color` property and `set_as_primary()` method
- Created `NS3451OwnershipMatrix` model (maps NS3451 codes to disciplines)
- Added `ownership_status` field to IFCType (primary/reference/ghost)
- Created `discipline_filter.py` service with:
  - `apply_discipline_firewall()` - Auto-demote types outside discipline
  - `get_discipline_ownership_summary()` - Dashboard metrics
  - `infer_discipline_from_types()` - Fallback discipline detection
- Created migrations and applied successfully:
  - `apps/models/migrations/0014_sprint1_gatekeeper_discipline.py`
  - `apps/entities/migrations/0027_sprint1_gatekeeper_ownership.py`

---

### Sprint 3: The Mapper (Spatial Stitching) - COMPLETE

**✅ Done:**
- Added `RoomAssignment` model for cross-model MEP→ARK room linking
  - Links discrete entities (vents, valves, fixtures) to containing rooms
  - Stores basepoint (x, y, z) for recalculation on re-upload
  - Confidence scoring (1.0 = clearly inside, <1.0 = estimated)
- Created migration and applied successfully:
  - `apps/entities/migrations/0028_sprint3_mapper_room_assignment.py`
- Added shapely to ifc-service requirements for point-in-polygon operations
- Created `room_stitch.py` service in `ifc-service/services/` with:
  - `DISCRETE_IFC_TYPES` - List of point-based MEP elements
  - `point_in_room()` - Z-range + 2D point-in-polygon check
  - `get_room_volumes_from_model()` - Extract IfcSpace footprints + Z bounds
  - `get_discrete_entities_from_model()` - Extract discrete entity centroids
  - `stitch_entities_to_rooms()` - Core assignment logic
  - `stitch_model_to_rooms()` - Stitch single model
  - `stitch_project_to_rooms()` - High-level project API

---

## Key Files Modified/Created

| File | Changes |
|------|---------|
| `backend/apps/entities/models.py` | TypeBankObservation: SET_NULL, is_historical, archived_at; IFCType: ownership_status; NS3451OwnershipMatrix; RoomAssignment |
| `backend/apps/projects/models.py` | ProjectConfig: phase, block_on_new_types |
| `backend/apps/models/models.py` | Model: discipline, is_primary_for_discipline, infer_discipline_from_filename() |
| `backend/apps/entities/services/ingestion_gate.py` | **NEW**: Phase gate enforcement, health KPIs |
| `backend/apps/entities/services/discipline_filter.py` | **NEW**: NS3451 firewall service |
| `backend/ifc-service/services/room_stitch.py` | **NEW**: Spatial stitching service |
| `backend/ifc-service/requirements.txt` | Added shapely>=2.0.0 |

---

## Migrations Status

✅ **All Applied Successfully** on 2026-02-07:
- `entities.0026_sprint2_vault_immutable_audit`
- `projects.0003_sprint2_vault_immutable_audit`
- `models.0014_sprint1_gatekeeper_discipline`
- `entities.0027_sprint1_gatekeeper_ownership`
- `entities.0028_sprint3_mapper_room_assignment`

---

## What Remains

### Optional Enhancements
- Hash-based type matching fallback in ifc_repository.py
- Frontend: Color-coded model cards with discipline "ear"
- Background task for spatial stitching after upload

### Future Work
- API endpoints for spatial queries (e.g., "What's in Room 101?")
- BCF export from verification failures (Phase 2)
- Natural language search (Phase 2)

---

## Reference Documents

- **Plan file**: `/home/edkjo/.claude/plans/melodic-launching-plum.md` (full implementation details)
- **Stakeholder feedback**: Embedded in plan file
