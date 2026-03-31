# Session: EIR + IDS + BEP Response Backend Foundation

## Summary
Built the complete backend foundation for the EIR (Employer's Information Requirements) + IDS (Information Delivery Specification) + BEP Response system. This implements the ISO 19650 information management loop: client defines requirements (EIR), team responds (BEP Response), IDS validates IFC models. The existing BEP system (disciplines, coordinates, storeys, etc.) becomes the implementation layer linked through BEPResponse.bep_configuration.

## Changes
- **Split `bep/models.py` into package**: `models/__init__.py`, `models/bep.py`, `models/eir.py`, `models/response.py`, `models/validation.py`. Zero migration changes, all existing imports unaffected.
- **6 new Django models** (migration 0005 applied):
  - `EIR` - project-scoped, versioned, status lifecycle (draft→issued→responded→agreed)
  - `EIRRequirement` - categorized requirements with severity, scope, optional IDS link
  - `IDSSpecification` - dual storage (ids_xml + structured_specs JSON), supports import/authored/library
  - `BEPResponse` - formal response linked to EIR + existing BEPConfiguration
  - `BEPResponseItem` - per-requirement compliance (will_comply/partially/cannot_comply/not_applicable/pending) with method, issues, wishes
  - `IDSValidationRun` - validation result storage with summary stats + full JSON report
- **Serializers**: Detail + List variants for all models. BEPResponse includes compliance_summary aggregation.
- **ViewSets**: Full CRUD for all models. Custom actions: `eir/{id}/issue/`, `eir/{id}/compliance/`, `ids/{id}/validate/`, `responses/{id}/submit/`, `responses/{id}/auto-populate/`
- **Routes**: 6 new router registrations at `/api/bep/eir/`, `/api/bep/eir-requirements/`, `/api/bep/ids/`, `/api/bep/responses/`, `/api/bep/response-items/`, `/api/bep/ids-runs/`
- **FastAPI IDS service** (`ifc-service/services/ids_service.py`): IDSService class wrapping ifctester for parse/build/validate/generate operations
- **FastAPI endpoints** (`ifc-service/api/ifc_ids.py`): POST `/ifc/ids/validate`, `/ifc/ids/parse`, `/ifc/ids/generate`
- **Pydantic schemas** (`ifc-service/models/ids_schemas.py`)
- **ifctester** installed in sprucelab conda env (v0.8.4), added to `ifc-service/requirements.txt`

## Technical Details
- ifctester is part of ifcopenshell ecosystem. `ids.Ids` is the container, `ids.Specification` holds applicability + requirements with 6 facet types (Entity, Attribute, Classification, Property, Material, PartOf).
- `structured_specs` JSON format maps 1:1 to ifctester's object model. Can round-trip: JSON → ifctester objects → IDS XML → parse back to JSON.
- IDS validation runs in FastAPI (CPU-bound ifcopenshell work). Django orchestrates: creates IDSValidationRun, calls FastAPI, stores results. The validate action on IDSSpecificationViewSet has a TODO placeholder for the actual FastAPI call (Task 6).
- Compliance endpoint aggregates: per EIR requirement, shows response compliance_status + latest IDS validation pass/fail.
- Tested: model imports, serializer imports, view imports, Django system check (0 issues), ifctester build+generate XML (1144 chars valid IDS).

## Next
- Wire Django→FastAPI IDS validation flow (Task 6: the validate ViewSet action needs to POST to FastAPI)
- Build frontend: use-eir.ts hooks, 10 EIR components, ProjectBEP sidebar sections (eir/response/compliance)
- Add i18n keys for eir.* namespace (nb.json + en.json)

## Notes
- Plan approved at `~/.claude/plans/twinkly-wondering-clock.md`
- The IDS validate action currently returns a placeholder response with run_id. The actual FastAPI call needs httpx integration similar to existing validation flow.
- pyproj still not in requirements.txt (from previous session)
- Org chart system was deprioritized in favor of EIR/IDS
