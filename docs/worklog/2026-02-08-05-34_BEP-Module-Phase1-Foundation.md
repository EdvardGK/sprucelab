# Session: BEP Module Phase 1 - Foundation Complete

**Date**: 2026-02-08
**Status**: Complete

---

## Summary

Implemented Phase 1 of the BEP (BIM Execution Plan) Module data layer based on analysis of Kistefos BEP requirements. Added 4 new models to support EIR (Employer's Information Requirements) generation: BEPTemplate for global template library, ProjectDiscipline for per-project discipline assignments, ProjectCoordinates for coordinate system configuration, and ProjectStorey for storey structure definitions.

## Context

Analysis of Kistefos BEP identified 6 key EIR components:
1. Project Identity & Disciplines
2. Coordinate System (Geolocation)
3. Naming Standards (Syntax Builder)
4. Responsibility Matrix (NS3451)
5. Level Structure (Vertical Control)
6. MMI/LOD Requirements

Existing infrastructure already covered: NamingConvention, NS3451OwnershipMatrix, MMIScaleDefinition, RequiredPropertySet. Gaps identified: discipline assignments, coordinates, storeys, and template inheritance.

---

## Changes

### New Models (`backend/apps/bep/models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `BEPTemplate` | Global template library | name, framework (pofin/iso19650/custom), is_system, default_* JSONFields |
| `ProjectDiscipline` | Per-project discipline assignments | discipline_code, company_name, contact_email, software, source_code_mapping |
| `ProjectCoordinates` | Coordinate system config | horizontal_crs_epsg (25833), vertical_crs (NN2000), local_origin_*, true_north_rotation |
| `ProjectStorey` | Expected storey structure | storey_name, storey_code, elevation_m, tolerance_m, order |

### BEPConfiguration Update
- Added `template` FK to `BEPTemplate` (SET_NULL, optional)
- Enables template inheritance: BEPTemplate → BEPConfiguration → EIR

### New API Endpoints

| Endpoint | ViewSet | Purpose |
|----------|---------|---------|
| `/api/bep/library/` | BEPTemplateViewSet | Global BEP templates CRUD |
| `/api/bep/disciplines/` | ProjectDisciplineViewSet | Project discipline assignments |
| `/api/bep/coordinates/` | ProjectCoordinatesViewSet | Project coordinate systems |
| `/api/bep/storeys/` | ProjectStoreyViewSet | Project storey structures |

### Files Modified/Created

| File | Change |
|------|--------|
| `backend/apps/bep/models.py` | Added BEPTemplate, ProjectDiscipline, ProjectCoordinates, ProjectStorey |
| `backend/apps/bep/serializers.py` | Added serializers for all 4 new models |
| `backend/apps/bep/views.py` | Added ViewSets with filtering, system template protection |
| `backend/apps/bep/urls.py` | Registered new routes |

### Migration Applied
- `bep.0003_add_bep_template_and_project_configs`

---

## Design Considerations

### Template Inheritance Pattern
```
BEPTemplate (Global)
    ↓ inherits defaults
BEPConfiguration (Per-Project)
    ↓ generates
EIR Document (PDF/Word/JSON)
```

Projects select a template (POFIN, ISO 19650, custom) and override as needed.

### System Templates Protection
- `BEPTemplate.is_system=True` → read-only (403 on update/delete)
- User templates can be freely modified

### Coordinate System Defaults
- `horizontal_crs_epsg=25833` (ETRS89/UTM33N - Norwegian standard)
- `vertical_crs='NN2000'` (Norwegian vertical datum)
- `position_tolerance_m=0.1`, `rotation_tolerance_deg=0.1` for validation

### ProjectStorey for Validation
- Stores expected elevations with tolerances
- Enables validation: compare IfcBuildingStorey.Elevation against ProjectStorey.elevation_m
- Tolerance field allows ±deviation before flagging

---

## References

| Document | Path |
|----------|------|
| Plan file | `/home/edkjo/.claude/plans/peppy-gathering-peacock.md` |
| Kistefos BEP analysis | Summarized in plan file |
| Existing BEP models | `backend/apps/bep/models.py` (7 original models) |
| NS3451 matrix | `backend/apps/entities/models.py` → NS3451OwnershipMatrix |

---

## Next Steps

### Phase 2: Template Fixtures
- Convert `bep_defaults.py` to JSON fixtures
- Create `load_bep_templates` management command
- Load POFIN and ISO 19650 system templates

### Phase 3: Validation Executors
- `CoordinateExecutor` - Validate georef against ProjectCoordinates
- `StoreyExecutor` - Validate elevations against ProjectStorey

### Phase 4: EIR Generation
- `eir_generator.py` service
- Aggregate BEP config → render PDF/Word
- Jinja2 templates for document sections

---

## Architecture Note

BEP Module sits alongside TypeBank (Type Library) and BIM Workbench as data-layer components. Model viewer location unchanged - this is data/backend focused work. EIR generation is the core value proposition: structured BEP data → professional EIR documents.
