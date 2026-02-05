# Session: Phase 1 - Configuration Foundation Complete

## Summary

Completed Phase 1 of the BIM-first architecture plan. Implemented ProjectConfig model with EIR/BEP JSON structure, TypeBankScope model for context-aware scopes, and BEP defaults service with Norwegian MMI scale.

## Changes

### New Files
- `backend/apps/projects/services/bep_defaults.py` - BEP template defaults (MMI scale, required Psets, validation rules)
- `backend/apps/projects/services/__init__.py` - Service exports
- `backend/apps/projects/migrations/0002_projectconfig.py` - ProjectConfig migration
- `backend/apps/entities/migrations/0020_typebankscope.py` - TypeBankScope migration
- `backend/apps/entities/services/defaults.py` - Entity defaults service
- `backend/apps/entities/data/auto_excluded.json` - Auto-excluded types for scoping

### Modified Files
- `backend/apps/projects/models.py` - Added EIR/BEP accessor methods to ProjectConfig
- `backend/apps/projects/serializers.py` - Added config validation, import/export, template serializers
- `backend/apps/projects/views.py` - Added ProjectConfigViewSet with full CRUD + custom actions
- `backend/apps/projects/urls.py` - Added `/configs/` route
- `backend/apps/entities/models.py` - TypeBankScope model (TFM/LCA/QTO/Clash scopes)
- `backend/apps/entities/serializers.py` - TypeBankScope serializers

### API Endpoints Added
```
GET    /api/projects/configs/              # List configs
POST   /api/projects/configs/              # Create config
GET    /api/projects/configs/{id}/         # Get config detail
PATCH  /api/projects/configs/{id}/         # Update config
DELETE /api/projects/configs/{id}/         # Delete config
POST   /api/projects/configs/from-template/  # Create from BEP template
POST   /api/projects/configs/validate/     # Validate config structure
GET    /api/projects/configs/template/     # Get blank template
GET    /api/projects/configs/mmi-scale/    # Get MMI scale definitions
GET    /api/projects/configs/{id}/export/  # Export as JSON/YAML
POST   /api/projects/configs/import/       # Import from JSON/YAML
POST   /api/projects/configs/{id}/activate/   # Set as active config
POST   /api/projects/configs/{id}/duplicate/  # Create new version
```

## Next Steps

### Phase 2: Validation Engine (Priority)
1. **Build MMI-aware validator in FastAPI** (`backend/ifc-service/services/validator.py`)
   - Load active ProjectConfig for validation context
   - Implement rule resolution based on MMI level
   - Property presence checks (required_properties per MMI level)
   - Pset completeness checks (required_psets per IFC type)
   - Value constraint validation

2. **Connect to ProjectConfig for rule resolution**
   - FastAPI endpoint to fetch active config from Django
   - Cache config to avoid repeated DB calls
   - Watch for config changes (webhook or polling)

3. **Generate BCF issues from validation failures**
   - Map validation errors to BCF issue format
   - Include element GUID, rule ID, message, severity
   - Export BCF XML for coordination tools

4. **Add validation_status to IFCEntity model**
   - Track per-element validation state (valid/invalid/warning)
   - Store last validation timestamp
   - Link to failed rule IDs

### Phase 3: TypeBank Enhancement
- Implement scope filtering (TFM, LCA, QTO, Clash)
- Add alias management UI
- Build observation review workflow
- Connect to classification (NS3451, NS3457)

### Phase 4: Export Integrations
- Reduzer export endpoint
- OneClickLCA export endpoint
- Excel bidirectional workflow
- BCF generation from validation

### Phase 5: Workbench UX
- BIM Coordinator dashboard
- BIM Manager overview
- QTO export interface

## Notes

- Norwegian MMI scale implemented: 100 (Konsept) → 600 (Som bygget)
- Config structure validated before save (bep, eir, type_scope, tfm sections)
- TypeBankScope supports custom scope types beyond TFM/LCA/QTO/Clash
- BEP defaults based on KNM_BEP.md reference document

## Commit

`5e5e88b` - Add ProjectConfig + TypeBankScope models for BIM-first architecture
