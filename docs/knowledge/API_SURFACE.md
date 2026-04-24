# API Surface Map

Quick reference for all REST endpoints. Django serves `/api/`, FastAPI serves `/api/v1/`.

---

## Django REST API (backend/config/urls.py)

### Config (config/views.py)

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/api/health/` | `health_check` | Health check |
| GET | `/api/me/` | `current_user` | Current user profile |
| PATCH | `/api/me/profile/` | `update_profile` | Update profile |

### Projects (apps/projects/) -- prefix: `/api/projects/`

| Method | Path | ViewSet | Serializer |
|--------|------|---------|------------|
| CRUD | `/api/projects/` | `ProjectViewSet` | `ProjectSerializer` |
| CRUD | `/api/projects/configs/` | `ProjectConfigViewSet` | `ProjectConfigSerializer` |

### Models (apps/models/) -- prefix: `/api/models/`

| Method | Path | ViewSet | Serializer |
|--------|------|---------|------------|
| CRUD | `/api/models/` | `ModelViewSet` | `ModelSerializer` |

### Types (apps/entities/) -- prefix: `/api/types/`

**Core Type Management**:

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/types/types/` | `IFCTypeViewSet` | `instances`, `export-excel`, `export-reduzer`, `import-excel`, `dashboard-metrics`, `verify`, `version-changes` |
| CRUD | `/api/types/type-mappings/` | `TypeMappingViewSet` | `summary`, `consolidated`, `map-consolidated`, `bulk-update` (batch classify) |
| CRUD | `/api/types/type-definition-layers/` | `TypeDefinitionLayerViewSet` | `bulk-update` |
| RO | `/api/types/entities/` | `IFCEntityViewSet` | `by-express-id` |
| RO | `/api/types/processing-reports/` | `ProcessingReportViewSet` | |

**Classification**:

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/types/ns3451-codes/` | `NS3451CodeViewSet` | `hierarchy`, `by-category`, `for-ifc-class` |
| CRUD | `/api/types/semantic-types/` | `SemanticTypeViewSet` | `summary` |
| CRUD | `/api/types/materials/` | `MaterialViewSet` | `summary` |
| CRUD | `/api/types/material-mappings/` | `MaterialMappingViewSet` | `summary` |

**TypeBank (cross-project intelligence)**:

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/types/type-bank/` | `TypeBankEntryViewSet` | `add-alias`, `merge-into`, `auto-normalize`, `set-semantic-type`, `verify-semantic-type`, `suggest-semantic-types`, `semantic-summary`, `export-excel`, `export-json` |
| CRUD | `/api/types/type-bank-observations/` | `TypeBankObservationViewSet` | |
| CRUD | `/api/types/type-bank-aliases/` | `TypeBankAliasViewSet` | |

**Library (unified type-centric view)**:

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| RO | `/api/types/type-library/` | `GlobalTypeLibraryViewSet` | `unified-summary`, `empty-types`, `verify`, `flag`, `reset-verification`, `set-auto` |
| CRUD | `/api/types/material-library/` | `MaterialLibraryViewSet` | `categories`, `summary` |
| CRUD | `/api/types/product-library/` | `ProductLibraryViewSet` | `compositions`, `set-compositions`, `summary` |
| CRUD | `/api/types/product-compositions/` | `ProductCompositionViewSet` | |

**Analysis**:

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| RO | `/api/types/model-analysis/` | `ModelAnalysisViewSet` | `run` |

### Scripting (apps/scripting/) -- prefix: `/api/`

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/scripts/` | `ScriptViewSet` | `execute` |
| RO | `/api/script-executions/` | `ScriptExecutionViewSet` | |
| CRUD | `/api/workflows/` | `AutomationWorkflowViewSet` | `activate`, `deactivate` |
| RO | `/api/workflow-executions/` | `WorkflowExecutionViewSet` | |

### Automation (apps/automation/) -- prefix: `/api/automation/`

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/automation/pipelines/` | `PipelineViewSet` | `run`, `duplicate` |
| CRUD | `/api/automation/pipelines/{id}/steps/` | `PipelineStepViewSet` | `reorder` |
| CRUD | `/api/automation/cde-connections/` | `CDEConnectionViewSet` | `test`, `sync` |
| CRUD | `/api/automation/project-configs/` | `ProjectPipelineConfigViewSet` | `enable`, `disable` |
| CRUD | `/api/automation/runs/` | `PipelineRunViewSet` | `cancel`, `logs` |

**Agent API** (for spruce CLI):

| Method | Path | View | Purpose |
|--------|------|------|---------|
| POST | `/api/automation/agent/register/` | `AgentRegisterView` | Register agent |
| POST | `/api/automation/agent/heartbeat/` | `AgentHeartbeatView` | Agent heartbeat |
| GET | `/api/automation/agent/jobs/` | `AgentJobsView` | Poll for jobs |
| POST | `/api/automation/agent/jobs/{run_id}/claim/` | `AgentJobClaimView` | Claim a job |
| POST | `/api/automation/agent/jobs/{run_id}/step/{step_id}/start/` | `AgentStepStartView` | Start step |
| POST | `/api/automation/agent/jobs/{run_id}/step/{step_id}/complete/` | `AgentStepCompleteView` | Complete step |
| POST | `/api/automation/agent/jobs/{run_id}/complete/` | `AgentRunCompleteView` | Complete run |

### Viewers (apps/viewers/) -- prefix: `/api/viewers/`

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/viewers/groups/` | `ViewerGroupViewSet` | |
| CRUD | `/api/viewers/models/` | `ViewerModelViewSet` | `coordinate`, `batch-update` |

### Field (apps/field/) -- prefix: `/api/field/`

| Method | Path | ViewSet | Key Actions |
|--------|------|---------|-------------|
| CRUD | `/api/field/templates/` | `ChecklistTemplateViewSet` | |
| CRUD | `/api/field/template-items/` | `ChecklistTemplateItemViewSet` | |
| CRUD | `/api/field/checklists/` | `ChecklistViewSet` | `instantiate` |
| CRUD | `/api/field/items/` | `CheckItemViewSet` | `record`, `deviate`, `resolve` |

### Admin (apps/accounts/) -- prefix: `/api/admin/`

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/api/admin/dashboard/` | `admin_dashboard` | Admin dashboard data |
| POST | `/api/admin/users/{id}/approve/` | `admin_approve_user` | Approve user |
| POST | `/api/admin/users/{id}/reject/` | `admin_reject_user` | Reject user |

---

## FastAPI IFC Service (backend/ifc-service/) -- prefix: `/api/v1/`

### Health

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/health` | Basic health |
| GET | `/api/v1/health/detailed` | Detailed health |

### IFC Operations (api/ifc_operations.py)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/ifc/open` | Open IFC from upload |
| POST | `/api/v1/ifc/open/url` | Open IFC from URL |
| POST | `/api/v1/ifc/open/path` | Open IFC from path |
| GET | `/api/v1/ifc/{file_id}/info` | File info |
| GET | `/api/v1/ifc/{file_id}/elements` | List elements |
| GET | `/api/v1/ifc/{file_id}/elements/{guid}` | Element by GUID |
| GET | `/api/v1/ifc/{file_id}/elements/by-express-id/{id}` | Element by Express ID |
| GET | `/api/v1/ifc/{file_id}/geometry/{guid}` | Mesh geometry |
| GET | `/api/v1/ifc/{file_id}/profile/{guid}` | Profile data |
| GET | `/api/v1/ifc/{file_id}/types/{type_guid}/instances` | Type instances |
| DELETE | `/api/v1/ifc/{file_id}` | Unload file |
| GET | `/api/v1/ifc/loaded` | List loaded files |

### IFC Processing (api/ifc_process.py)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/ifc/process` | Process IFC (async, writes types to DB) |
| GET | `/api/v1/ifc/process/status/{model_id}` | Processing status |
| POST | `/api/v1/ifc/process-sync` | Process IFC (synchronous) |
| POST | `/api/v1/ifc/reprocess` | Reprocess existing model |

### IFC Validation (api/ifc_validate.py)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/ifc/validate` | Full validation |
| GET | `/api/v1/ifc/validate/{model_id}/status` | Validation status |
| POST | `/api/v1/ifc/validate/quick` | Quick validation |
| DELETE | `/api/v1/ifc/validate/{model_id}/status` | Clear validation cache |

### IFC Health Check (api/ifc_health_check.py)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/ifc/health-check` | Full health check (traffic lights) |
| GET | `/api/v1/ifc/health-check/{model_id}/status` | Health check status |
| DELETE | `/api/v1/ifc/health-check/{model_id}/status` | Clear health check cache |
| POST | `/api/v1/ifc/health-check/quick` | Quick health check |

### Fragments (api/fragments.py)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/fragments/generate` | Generate fragments (async) |
| POST | `/api/v1/fragments/generate-sync` | Generate fragments (sync) |

### CRS Lookup (api/crs_lookup.py)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/crs/norway` | Norwegian CRS list |
| GET | `/api/v1/crs/search` | Search CRS by name/code |
| GET | `/api/v1/crs/{epsg_code}` | CRS details by EPSG code |

### IDS Validation (api/ifc_ids.py)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/ifc/ids/validate` | Validate against IDS |
| POST | `/api/v1/ifc/ids/parse` | Parse IDS file |
| POST | `/api/v1/ifc/ids/generate` | Generate IDS |
