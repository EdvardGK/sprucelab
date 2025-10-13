# Session 006 TODO: BIM Coordinator Model Workspace

**Session**: 006 - Model Workspace Architecture
**Date Started**: 2025-10-13
**Goal**: Transform model page into comprehensive BIM coordinator workspace

---

## Week 1: Database & Backend Foundation ✅ IN PROGRESS

### Database Schema (4 New Tables)
- [ ] Create migration file: `0003_add_scripts_system.py`
- [ ] Implement `scripts` table
  - Fields: id, name, description, script_type, code, parameters_schema, category, is_public, author_id, created_at, updated_at
  - Indexes: category, is_public
  - Unique constraint: (name, author_id)
- [ ] Implement `script_executions` table
  - Fields: id, script_id, model_id, status, parameters, started_at, completed_at, duration_ms, output_log, result_data, result_files, error_message, executed_by_id
  - Indexes: script_id, model_id, status, started_at DESC
- [ ] Implement `automation_workflows` table
  - Fields: id, name, description, trigger_type, trigger_config, script_id, default_parameters, is_active, project_id, last_run_at, next_run_at, created_at, updated_at
  - Indexes: trigger_type, is_active, project_id, next_run_at
- [ ] Implement `workflow_executions` table
  - Fields: id, workflow_id, model_id, script_execution_id, status, triggered_by, triggered_by_user_id, error_message, executed_at
  - Indexes: workflow_id, model_id, executed_at DESC
- [ ] Run migration: `python manage.py migrate`
- [ ] Verify tables created in Supabase dashboard

### Script Models
- [ ] Create `apps/scripts/` Django app
- [ ] Run: `python manage.py startapp scripts`
- [ ] Add to INSTALLED_APPS in settings.py
- [ ] Create `apps/scripts/models.py` with all 4 models
  - Script model with validation
  - ScriptExecution model with status choices
  - AutomationWorkflow model with trigger types
  - WorkflowExecution model
- [ ] Create model admin interfaces
- [ ] Test models in Django admin

### Script Runner Service
- [ ] Create `apps/scripts/services/` directory
- [ ] Implement `runner.py`:
  - `execute_script(script_id, model_id, parameters)` function
  - Subprocess execution with timeout (300 seconds)
  - Capture stdout/stderr
  - Error handling and recovery
- [ ] Implement `context.py`:
  - `build_script_context(model, parameters)` function
  - Provide model data access (entities, properties, systems, materials, types)
  - Helper functions (get_geometry, get_properties, save_output)
  - Whitelist libraries (ifcopenshell, numpy, pandas)
- [ ] Implement `sandbox.py`:
  - `run_script_in_subprocess(code, context, timeout)` function
  - Security: restrict file system access
  - Security: restrict network access
  - Memory limits (optional)
- [ ] Test with simple "Hello World" script

### Built-in Scripts
- [ ] Create `apps/scripts/builtin/` directory
- [ ] Implement `export_csv.py`:
  - Extract entities with selected properties
  - Generate CSV file
  - Save to storage
- [ ] Implement `guid_validator.py`:
  - Check for duplicate GUIDs
  - Check for invalid format (not 22 chars base64)
  - Return structured report
- [ ] Implement `lod_analyzer.py`:
  - Calculate LOD score by element type
  - Geometry ratio + property count
  - Classify as LOD 100/200/300
- [ ] Test all built-in scripts
- [ ] Seed database with built-in scripts

---

## Week 2: Script Execution API ⏳ PENDING

### API Endpoints
- [ ] Create `apps/scripts/serializers.py`
  - ScriptSerializer
  - ScriptExecutionSerializer
  - WorkflowSerializer
  - WorkflowExecutionSerializer
- [ ] Create `apps/scripts/views.py`
  - ScriptViewSet (list, create, retrieve, update, delete)
  - Filter by is_public and author
  - Pagination (100 per page)
- [ ] Create `apps/scripts/urls.py`
  - Register ScriptViewSet with router
- [ ] Add to main `urls.py`: `path('api/scripts/', include('apps.scripts.urls'))`
- [ ] Test GET /api/scripts/ (list public scripts)
- [ ] Test POST /api/scripts/ (create script)

### Script Execution Endpoints
- [ ] Add action to ModelViewSet: `execute_script()`
  - POST /api/models/{id}/execute-script/
  - Body: { script_id, parameters }
  - Create ScriptExecution record (status='queued')
  - Call execute_script service function
  - Return execution_id and status
- [ ] Add endpoint: GET /api/models/{id}/script-executions/
  - List execution history for model
  - Paginated (50 per page)
  - Order by started_at DESC
- [ ] Add endpoint: GET /api/script-executions/{id}/
  - Execution details (status, logs, results)
- [ ] Add endpoint: GET /api/script-executions/{id}/download/{filename}
  - Download result file from Supabase Storage
- [ ] Test end-to-end script execution flow

### Result File Storage
- [ ] Configure Supabase Storage bucket: `script-results`
- [ ] Implement file upload in `save_output()` function
- [ ] Implement file download endpoint
- [ ] Test file upload/download
- [ ] Add file size limit (100 MB per execution)

### Celery Integration (Async Execution)
- [ ] Install Redis (if not already)
- [ ] Configure Celery settings in config/settings.py
- [ ] Create `apps/scripts/tasks.py`
  - run_script_task(execution_id) Celery task
  - Call execute_script service
  - Update ScriptExecution status
- [ ] Update execute_script endpoint to queue Celery task
- [ ] Test async execution with long-running script
- [ ] Add execution status polling endpoint

---

## Week 3: Frontend Workspace ⏳ PENDING

### Model Workspace Component
- [ ] Create `frontend/src/pages/ModelWorkspace.tsx`
- [ ] Install shadcn/ui tabs component
- [ ] Implement tab navigation:
  - Overview
  - 3D Viewer
  - Validation
  - Statistics
  - Properties
  - Scripts
  - Metadata
  - History
- [ ] Test tab switching
- [ ] Update routing: `/models/:id` → ModelWorkspace

### Overview Tab (Model Dashboard)
- [ ] Create `frontend/src/components/model/OverviewTab.tsx`
- [ ] Implement header card (model name, version, status)
- [ ] Implement validation status card
- [ ] Implement statistics grid (4 metrics)
- [ ] Implement element type breakdown chart (placeholder)
- [ ] Implement quick actions (Download, Compare, Validate, Execute)
- [ ] Implement recent activity feed (placeholder)
- [ ] Connect to backend API
- [ ] Test with real model data

### Validation Tab
- [ ] Create `frontend/src/components/model/ValidationTab.tsx`
- [ ] Implement header with "Re-run Validation" button
- [ ] Implement overall status display (Pass/Warning/Fail badge)
- [ ] Implement issue breakdown cards (Schema, GUID, Geometry)
- [ ] Implement accordion for detailed issues
  - Schema errors
  - GUID issues
  - Geometry issues
  - Property issues
  - LOD issues
- [ ] Connect to GET /api/models/{id}/validation/ endpoint
- [ ] Test with real validation report

### API Hooks
- [ ] Create `frontend/src/hooks/use-scripts.ts`
  - useScripts() - List scripts
  - useScript(id) - Get script details
  - useCreateScript() - Mutation
- [ ] Create `frontend/src/hooks/use-script-executions.ts`
  - useScriptExecutions(modelId) - List executions
  - useScriptExecution(id) - Execution details
  - useExecuteScript() - Mutation
- [ ] Create `frontend/src/hooks/use-model-statistics.ts`
  - useModelStatistics(modelId) - Get statistics
- [ ] Test hooks with backend API

---

## Week 4: Statistics & Charts ⏳ PENDING

### Statistics API Endpoint
- [ ] Create GET /api/models/{id}/statistics/ endpoint
- [ ] Calculate statistics:
  - Element count by type
  - Elements by storey
  - Property coverage
  - Material usage
  - System membership
- [ ] Cache results (invalidate on model update)
- [ ] Test with real model data

### Statistics Tab
- [ ] Create `frontend/src/components/model/StatisticsTab.tsx`
- [ ] Install Recharts: `npm install recharts`
- [ ] Implement key metrics grid (4 cards)
- [ ] Implement Element Type Distribution chart (Pie)
- [ ] Implement Elements by Storey chart (Bar)
- [ ] Implement Property Coverage heatmap
- [ ] Implement Material Usage chart
- [ ] Connect to statistics API
- [ ] Test with real model data
- [ ] Add loading states and error handling

### Chart Components
- [ ] Create `frontend/src/components/charts/ElementTypeChart.tsx`
- [ ] Create `frontend/src/components/charts/StoreyBreakdownChart.tsx`
- [ ] Create `frontend/src/components/charts/PropertyCoverageChart.tsx`
- [ ] Create `frontend/src/components/charts/MaterialUsageChart.tsx`
- [ ] Apply Spruce Forge color scheme to charts
- [ ] Test responsiveness

---

## Week 5: Scripts Tab ⏳ PENDING

### Scripts UI
- [ ] Create `frontend/src/components/model/ScriptsTab.tsx`
- [ ] Implement 2-column layout (sidebar + main)
- [ ] Implement script library sidebar:
  - Search input
  - Script list with cards
  - "Create Script" button
- [ ] Implement script details panel:
  - Script name, description, category badge
  - Parameter form (dynamic based on schema)
  - "Execute" button
  - Execution history table
- [ ] Connect to scripts API
- [ ] Test script selection and execution

### Script Execution UI
- [ ] Create `frontend/src/components/scripts/ScriptCard.tsx`
- [ ] Create `frontend/src/components/scripts/ScriptParameterForm.tsx`
  - Dynamic form generation from parameters_schema (JSON Schema)
  - Support for: string, number, boolean, select inputs
  - Form validation
- [ ] Create `frontend/src/components/scripts/ExecutionHistoryTable.tsx`
  - Show: execution time, status, duration, actions
  - Status badges: success (green), error (red), running (blue)
  - Download results button
  - View logs button
- [ ] Create `frontend/src/components/scripts/ExecutionDetails.tsx`
  - Modal/drawer with full execution details
  - Collapsible log viewer
  - Download all results button
- [ ] Test end-to-end script execution from UI

### Script Execution Polling
- [ ] Implement status polling for running scripts
- [ ] Use React Query refetch interval (2 seconds)
- [ ] Stop polling when status is 'success' or 'error'
- [ ] Show progress indicator during execution
- [ ] Toast notification on completion

---

## Week 6: Automation & Workflows ⏳ PENDING

### Workflow Models
- [ ] Verify AutomationWorkflow and WorkflowExecution models
- [ ] Create workflow API endpoints
  - GET /api/workflows/
  - POST /api/workflows/
  - GET /api/workflows/{id}/
  - PATCH /api/workflows/{id}/
  - POST /api/workflows/{id}/activate/
  - POST /api/workflows/{id}/deactivate/
  - POST /api/workflows/{id}/execute/
- [ ] Test workflow CRUD operations

### Workflow Triggers
- [ ] Implement `apps/scripts/services/workflows.py`
- [ ] Implement on_upload trigger:
  - Hook into Model.save() signal
  - Check for active workflows with trigger_type='on_upload'
  - Create WorkflowExecution and ScriptExecution
- [ ] Implement scheduled trigger:
  - Configure Celery beat schedule
  - Create periodic task to check workflows
  - Execute workflows where next_run_at <= now
- [ ] Test auto-validation on upload
- [ ] Test scheduled weekly report

### Workflow Management UI
- [ ] Create `frontend/src/pages/Workflows.tsx`
- [ ] Implement workflow list view
- [ ] Implement "Create Workflow" dialog
  - Name, description
  - Trigger type selector (on_upload, scheduled, manual)
  - Script selector
  - Parameter form
  - Cron expression input (for scheduled)
- [ ] Implement workflow edit/delete
- [ ] Implement activate/deactivate toggle
- [ ] Implement manual trigger button
- [ ] Test workflow creation and execution

---

## Week 7: Polish & Documentation ⏳ PENDING

### Script Editor
- [ ] Install Monaco Editor: `npm install @monaco-editor/react`
- [ ] Create `frontend/src/components/scripts/ScriptEditor.tsx`
- [ ] Integrate Monaco with Python syntax highlighting
- [ ] Add code completion for context variables
- [ ] Add "Test Run" button (execute on sample model)
- [ ] Test script editing and execution

### UI Polish
- [ ] Add loading skeletons for all tabs
- [ ] Add empty states for no data
- [ ] Add error boundaries
- [ ] Add toast notifications for all actions
- [ ] Add confirmation dialogs for destructive actions
- [ ] Add tooltips for all icons and buttons
- [ ] Test responsive design (desktop, tablet, mobile)

### Performance Optimization
- [ ] Implement statistics caching (Redis)
- [ ] Optimize chart rendering (React.memo)
- [ ] Add code splitting for tabs (React.lazy)
- [ ] Measure and optimize bundle size
- [ ] Test with large models (1000+ elements)

### Documentation
- [ ] Write user guide: "Getting Started with Scripts"
- [ ] Create video walkthrough: "Executing Your First Script"
- [ ] Document API endpoints (Swagger/OpenAPI)
- [ ] Add inline help text throughout UI
- [ ] Create troubleshooting guide
- [ ] Document built-in scripts (what they do, parameters)

---

## Success Criteria

### Minimum Viable Product (MVP)
- [ ] Model workspace has 8 tabs (all functional)
- [ ] Overview tab shows validation status and statistics
- [ ] Validation tab displays existing validation report
- [ ] Statistics tab has at least 2 charts (element type, storey breakdown)
- [ ] Scripts tab can execute built-in scripts
- [ ] Script execution history visible
- [ ] Can download script results

### Full Release
- [ ] Statistics tab has all 4 charts
- [ ] Can create custom scripts in UI
- [ ] Script editor with syntax highlighting
- [ ] Automated workflows (on_upload, scheduled)
- [ ] Workflow management UI
- [ ] Real-time execution status updates
- [ ] Comprehensive documentation

### Performance Targets
- [ ] Overview tab loads in < 2 seconds
- [ ] Statistics charts render in < 1 second each
- [ ] Script execution completes in < 30 seconds (typical)
- [ ] Script results download in < 5 seconds
- [ ] UI remains responsive during script execution

---

## Current Status

**Last Updated**: 2025-10-13

**Phase**: Week 1 - Database & Backend Foundation

**Active Task**: Create database migration for scripts tables

**Progress**: 10% complete

**Next Actions**:
1. Create migration file
2. Implement Script model
3. Implement ScriptExecution model
4. Run migration

---

## Notes

### Design Decisions
- **Script Language**: Python only for MVP (JavaScript support later)
- **Sandboxing**: Subprocess with timeout (Docker containers later)
- **File Storage**: Supabase Storage bucket `script-results`
- **User Permissions**: All users can create scripts (public vs. private)
- **Workflow Limits**: Max 10 workflows per project (adjustable)

### Risk Mitigation
- Script security: subprocess isolation, whitelist libraries
- Performance: cache statistics, async execution
- Storage: automatic cleanup of old results (30 days)
- Workflow spam: rate limiting (10 executions/hour)

### Related Documents
- **Planning**: `session-006-model-workspace-architecture.md` (11,000 words)
- **Backend Architecture**: `session-002-bim-coordinator-platform.md`
- **Frontend Design**: `frontend-design-system.md`
- **Session 005**: IFC Validation Service implementation

---

**Status**: Planning complete, implementation starting 🚀
