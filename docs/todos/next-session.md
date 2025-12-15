# Next Session TODO: Phase 2 Preparation

**Last Updated**: 2025-10-11
**Current Status**: Phase 1 Complete ✅
**Next Phase**: Phase 2 - Core Data Flow & Background Processing

## Option A: Redis + Celery Setup (Backend Focus)

### Goal
Enable asynchronous processing for large IFC files (>1000 elements)

### Tasks
- [ ] Install Redis on Windows
  - Download: https://github.com/microsoftarchive/redis/releases
  - Or WSL: `sudo apt-get install redis-server`
  - Verify: `redis-server --version`

- [ ] Test Redis connection
  - Start server: `redis-server`
  - Test: `redis-cli ping` (should return "PONG")

- [ ] Install Celery in conda environment
  ```bash
  conda activate sprucelab
  pip install celery
  pip install redis
  ```

- [ ] Create Celery configuration
  - Create `backend/config/celery.py`
  - Configure broker and result backend
  - Import in `__init__.py`

- [ ] Create Celery tasks
  - Create `backend/apps/models/tasks.py`
  - Move `process_ifc_file()` to Celery task
  - Add progress tracking

- [ ] Update upload view
  - Change to async task dispatch
  - Return task ID immediately
  - Add status polling endpoint

- [ ] Test with medium file
  - Upload file (100-500 elements)
  - Verify async processing works
  - Check status updates

- [ ] Test with large file
  - Upload file (>1000 elements)
  - Verify no timeout
  - Monitor Celery worker logs

**Estimated Time**: 2-3 hours

**Benefits**:
- Handle large files
- Better user experience (no blocking)
- Production-ready processing

---

## Option B: React Frontend Scaffolding (Frontend Focus)

### Goal
Create basic React frontend with project/model listing

### Tasks
- [ ] Initialize React project with Vite
  ```bash
  cd ..
  npm create vite@latest frontend -- --template react-ts
  cd frontend
  npm install
  ```

- [ ] Install dependencies
  ```bash
  npm install @tanstack/react-query axios
  npm install -D tailwindcss postcss autoprefixer
  npx tailwindcss init -p
  ```

- [ ] Install shadcn/ui
  ```bash
  npx shadcn-ui@latest init
  npx shadcn-ui@latest add button card form input
  ```

- [ ] Setup API client
  - Create `src/lib/api.ts`
  - Configure axios with base URL
  - Add TypeScript types

- [ ] Create basic layout
  - `src/components/Layout.tsx`
  - Header with navigation
  - Sidebar for filters
  - Main content area

- [ ] Create project list page
  - `src/pages/ProjectList.tsx`
  - Fetch projects from API
  - Display in cards
  - Add "Create Project" button

- [ ] Create model list page
  - `src/pages/ModelList.tsx`
  - Fetch models for selected project
  - Display with status badges
  - Add "Upload IFC" button

- [ ] Test integration
  - Start both servers (Django + Vite)
  - Verify API calls work
  - Test CORS configuration

**Estimated Time**: 2-3 hours

**Benefits**:
- User-friendly interface
- Visual feedback
- Professional appearance

---

## Option C: Graph Edge Extraction (Data Completeness)

### Goal
Extract IFC relationships for graph visualization

### Tasks
- [ ] Update extraction service
  - Add `extract_graph_edges()` function
  - Extract IfcRelContainedInSpatialStructure
  - Extract IfcRelAggregates
  - Extract IfcRelDefinesByProperties
  - Extract IfcRelAssignsToGroup

- [ ] Store relationships
  - Create GraphEdge records
  - Link source and target entities
  - Store relationship type
  - Add metadata JSON

- [ ] Create graph API endpoint
  - GET /api/graph/{model_id}/nodes/
  - GET /api/graph/{model_id}/edges/
  - Format for force-directed graph

- [ ] Test graph data
  - Upload test file
  - Verify edges created
  - Check relationship counts

- [ ] Add statistics endpoint
  - Count relationships by type
  - Identify disconnected nodes
  - Calculate graph metrics

**Estimated Time**: 2-3 hours

**Benefits**:
- Complete data model
- Ready for visualization
- Better understanding of IFC structure

---

## Option D: Change Detection (Core Feature)

### Goal
Implement version comparison and change tracking

### Tasks
- [ ] Create change detection service
  - Create `backend/apps/changes/services.py`
  - Implement `compare_models(from_id, to_id)`
  - Compare by GUID

- [ ] Detect change types
  - Added elements (new GUIDs)
  - Removed elements (missing GUIDs)
  - Modified elements (same GUID, different data)
  - Geometry changes (vertex/face count)
  - Property changes (value comparison)

- [ ] Store change log
  - Create ChangeLog records
  - Link to both models
  - Store change details JSON

- [ ] Create comparison endpoint
  - POST /api/changes/compare/
  - Input: from_model_id, to_model_id
  - Return: change summary + log ID

- [ ] Create change log endpoint
  - GET /api/changes/{log_id}/
  - Return: detailed change list
  - Filter by change type

- [ ] Test with versions
  - Upload v1 of model
  - Upload v2 of model
  - Compare and verify changes detected

**Estimated Time**: 3-4 hours

**Benefits**:
- Core differentiator feature
- High user value
- Demonstrates platform capability

---

## Recommendation

**Suggested order based on priority:**

1. **Option A (Redis/Celery)** - Critical for production readiness
2. **Option B (React Frontend)** - High user value, makes platform usable
3. **Option C (Graph Edges)** - Complete data model
4. **Option D (Change Detection)** - Core feature, but requires 2 model versions

**Recommended Next Session**: **Option A + Option B** (Backend async processing + Frontend scaffolding)

This gives you:
- Production-ready processing ✅
- User-facing interface ✅
- Complete Phase 1 ✅
- Strong foundation for Phase 2 ✅

**Estimated Total Time**: 4-6 hours

---

## Session 004 Suggested Agenda

1. **Hour 1-2**: Redis + Celery setup
   - Install and configure
   - Create tasks
   - Test async processing

2. **Hour 2-3**: React scaffolding
   - Initialize project
   - Setup dependencies
   - Create basic layout

3. **Hour 3-4**: API Integration
   - Connect frontend to backend
   - Test file upload from UI
   - Verify data display

4. **Hour 4+**: Polish & Testing
   - Add loading states
   - Error handling
   - Documentation updates

---

**Current Status**: Ready to start Phase 2
**Blockers**: None
**Dependencies Met**: All Phase 1 objectives complete
