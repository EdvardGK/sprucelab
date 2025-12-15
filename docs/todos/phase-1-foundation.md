# Phase 1: Foundation - TODO List

**Timeline**: Week 1-2
**Goal**: Set up core infrastructure for BIM Coordinator Platform

## Backend Setup

### Django Project Structure
- [ ] Create Django project: `bim_coordinator/`
- [ ] Install dependencies:
  - [ ] Django 5.0
  - [ ] djangorestframework
  - [ ] psycopg2-binary (PostgreSQL)
  - [ ] celery
  - [ ] redis
  - [ ] python-dotenv
  - [ ] ifcopenshell
  - [ ] open3d
  - [ ] numpy
- [ ] Create Django apps:
  - [ ] `apps/projects/`
  - [ ] `apps/models/`
  - [ ] `apps/entities/`
  - [ ] `apps/changes/`
  - [ ] `apps/graph/`
- [ ] Configure Django settings:
  - [ ] Database connection (Supabase PostgreSQL)
  - [ ] Static/media files
  - [ ] CORS settings
  - [ ] REST Framework settings
- [ ] Create `.env` file with:
  - [ ] Supabase database URL
  - [ ] Supabase storage credentials
  - [ ] Redis URL
  - [ ] Secret keys

### Database Schema
- [ ] Create migrations for core tables:
  - [ ] `projects` table
  - [ ] `models` table
  - [ ] `ifc_entities` table
  - [ ] `spatial_hierarchy` table
  - [ ] `property_sets` table
  - [ ] `systems` table + `system_memberships`
  - [ ] `materials` table + `material_assignments`
  - [ ] `ifc_types` table + `type_assignments`
  - [ ] `geometry` table
  - [ ] `graph_edges` table
  - [ ] `change_log` table
  - [ ] `storage_metrics` table
- [ ] Add database indexes:
  - [ ] Index on `ifc_entities.ifc_guid`
  - [ ] Index on `ifc_entities.ifc_type`
  - [ ] Index on `property_sets.pset_name`
  - [ ] Index on `property_sets.property_name`
  - [ ] Index on `graph_edges.source_entity_id`
  - [ ] Index on `graph_edges.target_entity_id`
  - [ ] Index on `change_log.change_type`
- [ ] Run migrations
- [ ] Test database connection

### Supabase Integration
- [ ] Create Supabase project
- [ ] Get database credentials
- [ ] Set up Supabase Storage bucket for IFC files
- [ ] Create storage client in Django
- [ ] Test file upload to storage
- [ ] Test file download from storage

### Celery Setup
- [ ] Install Redis
- [ ] Configure Celery in `config/celery.py`
- [ ] Create task queues:
  - [ ] `ifc_processing` queue
  - [ ] `change_detection` queue
- [ ] Test Celery worker startup
- [ ] Test basic task execution

### Django Models
- [ ] Create `Project` model
  - [ ] Fields: name, description, created_at, updated_at
  - [ ] Methods: `get_latest_model()`, `get_model_count()`
- [ ] Create `Model` model
  - [ ] Fields: project, name, filename, ifc_schema, file_url, status, version_number
  - [ ] Methods: `get_element_count()`, `get_previous_version()`
- [ ] Create `IFCEntity` model
  - [ ] Fields: model, ifc_guid, ifc_type, name, description, storey_id
  - [ ] Methods: `get_properties()`, `get_systems()`, `get_geometry()`
- [ ] Create `SpatialHierarchy` model
- [ ] Create `PropertySet` model
- [ ] Create `System` model + `SystemMembership` model
- [ ] Create `Material` model + `MaterialAssignment` model
- [ ] Create `IFCType` model + `TypeAssignment` model
- [ ] Create `Geometry` model
- [ ] Create `GraphEdge` model
- [ ] Create `ChangeLog` model

### IFC Processing Pipeline
- [ ] Create `ifc_processing/` module
- [ ] Adapt `IFCMeshExtractor` to `IFCDatabaseExtractor`:
  - [ ] Constructor takes model_id instead of output_dir
  - [ ] Extract spatial structure → `spatial_hierarchy` table
  - [ ] Extract elements → `ifc_entities` table
  - [ ] Extract properties → `property_sets` table
  - [ ] Extract systems → `systems` + `system_memberships`
  - [ ] Extract materials → `materials` + `material_assignments`
  - [ ] Extract types → `ifc_types` + `type_assignments`
  - [ ] Extract geometry → `geometry` table (compressed)
  - [ ] Build graph edges → `graph_edges` table
- [ ] Create `ifc_processing/extractor.py` with:
  - [ ] `extract_spatial_structure(ifc_file, model_id)`
  - [ ] `extract_elements(ifc_file, model_id)`
  - [ ] `extract_properties(ifc_file, model_id)`
  - [ ] `extract_systems(ifc_file, model_id)`
  - [ ] `extract_materials(ifc_file, model_id)`
  - [ ] `extract_types(ifc_file, model_id)`
  - [ ] `extract_geometry(ifc_file, model_id)`
  - [ ] `build_graph(ifc_file, model_id)`
- [ ] Create Celery task: `process_ifc_upload.delay(model_id)`
  - [ ] Download IFC from Supabase Storage
  - [ ] Update model status to 'processing'
  - [ ] Run extraction pipeline
  - [ ] Calculate storage metrics
  - [ ] Update model status to 'ready' or 'error'
- [ ] Test extraction with sample IFC file

### REST API Endpoints
- [ ] Projects API:
  - [ ] `GET /api/projects/` - list all projects
  - [ ] `POST /api/projects/` - create project
  - [ ] `GET /api/projects/{id}/` - get project detail
  - [ ] `PATCH /api/projects/{id}/` - update project
  - [ ] `DELETE /api/projects/{id}/` - delete project
- [ ] Models API:
  - [ ] `GET /api/models/` - list models (filterable by project)
  - [ ] `POST /api/models/upload/` - upload IFC file
  - [ ] `GET /api/models/{id}/` - get model detail
  - [ ] `GET /api/models/{id}/status/` - get processing status
  - [ ] `DELETE /api/models/{id}/` - delete model
- [ ] Entities API:
  - [ ] `GET /api/entities/?model_id={id}` - list entities
  - [ ] `GET /api/entities/{id}/` - get entity detail with properties
- [ ] Create serializers:
  - [ ] `ProjectSerializer`
  - [ ] `ModelSerializer`
  - [ ] `IFCEntitySerializer`
  - [ ] `PropertySetSerializer`
- [ ] Test all endpoints with Postman/curl

### File Upload Flow
- [ ] Create file upload view:
  - [ ] Accept IFC file via multipart/form-data
  - [ ] Validate file extension (.ifc)
  - [ ] Upload to Supabase Storage
  - [ ] Create Model record with status='uploading'
  - [ ] Queue Celery task for processing
  - [ ] Return model ID and upload URL
- [ ] Test upload with small IFC file
- [ ] Test upload with large IFC file (100MB+)
- [ ] Implement upload progress tracking

## Frontend Setup

### React Project Structure
- [ ] Create Vite + React + TypeScript project
- [ ] Install dependencies:
  - [ ] react-router-dom
  - [ ] @tanstack/react-query
  - [ ] @supabase/supabase-js
  - [ ] axios
  - [ ] tailwindcss
  - [ ] shadcn/ui components
- [ ] Set up Tailwind CSS
- [ ] Configure shadcn/ui
- [ ] Create folder structure:
  - [ ] `src/pages/`
  - [ ] `src/components/`
  - [ ] `src/hooks/`
  - [ ] `src/lib/`
  - [ ] `src/types/`
  - [ ] `src/api/`

### Basic Layout
- [ ] Create `src/components/Layout.tsx`:
  - [ ] Header with logo and navigation
  - [ ] Sidebar (collapsible)
  - [ ] Main content area
  - [ ] Footer
- [ ] Create navigation:
  - [ ] Dashboard link
  - [ ] Projects link
  - [ ] Settings link
- [ ] Set up React Router:
  - [ ] Route: `/` → Dashboard
  - [ ] Route: `/projects/:id` → Project Detail
  - [ ] Route: `/models/:id` → Model Detail
  - [ ] Route: `/compare` → Comparison View

### API Client Setup
- [ ] Create `src/lib/supabase.ts` - Supabase client
- [ ] Create `src/api/client.ts` - Axios client with:
  - [ ] Base URL configuration
  - [ ] Request interceptors
  - [ ] Response interceptors
  - [ ] Error handling
- [ ] Create API functions:
  - [ ] `getProjects()`
  - [ ] `createProject(data)`
  - [ ] `getProject(id)`
  - [ ] `updateProject(id, data)`
  - [ ] `deleteProject(id)`
  - [ ] `getModels(projectId?)`
  - [ ] `uploadModel(file, projectId)`
  - [ ] `getModel(id)`
  - [ ] `getModelStatus(id)`

### React Query Setup
- [ ] Configure QueryClient in `src/App.tsx`
- [ ] Create hooks:
  - [ ] `src/hooks/useProjects.ts`
  - [ ] `src/hooks/useProject.ts`
  - [ ] `src/hooks/useModels.ts`
  - [ ] `src/hooks/useModel.ts`
  - [ ] `src/hooks/useUploadModel.ts`
- [ ] Test data fetching

### TypeScript Types
- [ ] Create `src/types/index.ts`:
  - [ ] `Project` interface
  - [ ] `Model` interface
  - [ ] `IFCEntity` interface
  - [ ] `PropertySet` interface
  - [ ] `ProcessingStatus` type
  - [ ] `UploadResponse` interface

### Basic Pages
- [ ] Create `src/pages/Dashboard.tsx`:
  - [ ] Display "Dashboard" heading
  - [ ] Show loading state
  - [ ] Show error state
  - [ ] Placeholder for project grid
- [ ] Create `src/pages/ProjectDetail.tsx`:
  - [ ] Display project name
  - [ ] Placeholder for model list
- [ ] Create `src/pages/ModelViewer.tsx`:
  - [ ] Display model name
  - [ ] Show processing status
  - [ ] Placeholder for tabs (Graph, 3D, Properties)

### File Upload Component
- [ ] Create `src/components/ModelUpload.tsx`:
  - [ ] File input (drag & drop)
  - [ ] Project selector
  - [ ] Upload button
  - [ ] Progress bar
  - [ ] Success/error messages
- [ ] Test file upload flow
- [ ] Handle upload errors gracefully

## Testing & Validation

### Backend Tests
- [ ] Test database migrations
- [ ] Test IFC extraction with sample files:
  - [ ] Small IFC (< 1MB, ~100 elements)
  - [ ] Medium IFC (~10MB, ~1,000 elements)
  - [ ] Large IFC (LBK_RIV_C.ifc, 3,162 elements)
- [ ] Verify data in database:
  - [ ] Spatial hierarchy is correct
  - [ ] All elements extracted
  - [ ] Properties populated
  - [ ] Systems extracted
  - [ ] Graph edges created
- [ ] Test API endpoints with Postman
- [ ] Test Celery task execution
- [ ] Test error handling (invalid IFC, corrupted file)

### Frontend Tests
- [ ] Test routing navigation
- [ ] Test API data fetching
- [ ] Test file upload UI
- [ ] Test loading states
- [ ] Test error states
- [ ] Test responsive design (desktop, tablet, mobile)

### Integration Tests
- [ ] End-to-end upload flow:
  1. Create project via API
  2. Upload IFC file via frontend
  3. Monitor processing status
  4. Verify model appears in list
  5. View model detail page
- [ ] Test with real IFC files from Session 001

## Documentation

- [ ] Create `README.md` for backend:
  - [ ] Setup instructions
  - [ ] Environment variables
  - [ ] Running Django server
  - [ ] Running Celery worker
- [ ] Create `README.md` for frontend:
  - [ ] Setup instructions
  - [ ] Running dev server
  - [ ] Building for production
- [ ] Document API endpoints (initial)
- [ ] Create development workflow guide

## Deliverables

By end of Phase 1, we should have:
- ✅ Django backend with PostgreSQL database
- ✅ IFC extraction pipeline writing to database
- ✅ Background processing with Celery
- ✅ REST API for projects and models
- ✅ React frontend with basic routing
- ✅ File upload functionality
- ✅ Processing status tracking
- ✅ Ability to upload IFC → extract to database → view in UI

## Success Metrics

- [ ] Upload a 10MB IFC file successfully
- [ ] Process extracts all elements to database
- [ ] API returns correct data
- [ ] Frontend displays project and model lists
- [ ] Upload flow completes end-to-end
- [ ] Processing status updates in real-time

---

**Status**: Not started
**Dependencies**: None (greenfield project)
**Blockers**: Need Supabase credentials
