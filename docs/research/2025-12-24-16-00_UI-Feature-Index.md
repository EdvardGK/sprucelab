# Sprucelab UI Feature Index
**Code Locations and Implementation Status**

---

## Routes & Pages

| Route | Page Component | Status | Notes |
|-------|----------------|--------|-------|
| `/` | `ProjectsGallery` | **Working** | Project gallery with create button |
| `/projects` | `ProjectsGallery` | **Working** | Same as above |
| `/projects/:id` | `ProjectModels` | **Working** | Now landing page (was dashboard) |
| `/projects/:id/dashboard` | `ProjectDashboard` | **Working** | KPI cards, stats, charts |
| `/projects/:id/models` | `ProjectModels` | **Working** | Model list with upload |
| `/projects/:id/workbench` | `BIMWorkbench` | **Partial** | Type mapping works, others placeholder |
| `/projects/:id/viewer-groups` | `ViewerGroups` | **Working** | Group list for federated viewing |
| `/projects/:id/viewer/:groupId` | `FederatedViewer` | **Working** | ThatOpen 3D viewer |
| `/projects/:id/documents` | `ProjectDocuments` | **Placeholder** | Coming soon page |
| `/projects/:id/drawings` | `ProjectDrawings` | **Placeholder** | Coming soon page |
| `/projects/:id/my-page` | `ProjectMyPage` | **Placeholder** | User dashboard stub |
| `/models/:id` | `ModelWorkspace` | **Working** | Single model viewer + properties |
| `/my-page` | `MyPage` | **Placeholder** | User dashboard stub |
| `/my-issues` | `MyIssues` | **Placeholder** | Coming soon page |
| `/my-rfis` | `MyRFIs` | **Placeholder** | Coming soon page |
| `/scripts` | `ScriptsLibrary` | **Placeholder** | Coming soon page |
| `/stats` | `QuickStats` | **Placeholder** | Coming soon page |
| `/settings` | `Settings` | **Placeholder** | Coming soon page |
| `/dev/processing-reports` | `ProcessingReports` | **Working** | Debug: IFC processing logs |
| `/dev/processing-reports/:id` | `ProcessingReportDetail` | **Working** | Debug: Single report detail |

---

## Working Features

### 1. Project Management
**Location:** `frontend/src/pages/ProjectsGallery.tsx`
**Components:**
- `CreateProjectDialog` - `frontend/src/components/CreateProjectDialog.tsx`
**Backend:** `backend/apps/projects/` (Django)
**Status:** Full CRUD working

### 2. Model Upload & Processing
**Location:** `frontend/src/pages/ProjectModels.tsx`
**Components:**
- `ModelUploadDialog` - `frontend/src/components/ModelUploadDialog.tsx`
- `ModelStatusBadge` - `frontend/src/components/ModelStatusBadge.tsx`
- `DeleteModelDialog` - `frontend/src/components/DeleteModelDialog.tsx`
**Backend:**
- Upload: `backend/apps/models/views.py` (`get_upload_url`, `confirm_upload`)
- Processing: `backend/ifc-service/` (FastAPI microservice)
- Status: Direct Supabase upload with progress tracking
**Hooks:** `frontend/src/hooks/use-models.ts`

### 3. 3D Viewer (ThatOpen/IFC.js)
**Location:** `frontend/src/pages/FederatedViewer.tsx`
**Components:**
- `UnifiedBIMViewer` - `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`
- `ViewerToolPanel` - `frontend/src/components/features/viewer/ViewerToolPanel.tsx`
- `ViewerTypeToolbar` - `frontend/src/components/features/viewer/ViewerTypeToolbar.tsx`
- `ViewerColorHUD` - `frontend/src/components/features/viewer/ViewerColorHUD.tsx`
- `ViewerFilterHUD` - `frontend/src/components/features/viewer/ViewerFilterHUD.tsx`
- `ElementPropertiesPanel` - `frontend/src/components/features/viewer/ElementPropertiesPanel.tsx`
- `SectionPlanesPanel` - `frontend/src/components/features/viewer/SectionPlanesPanel.tsx`
**Features:**
- Multi-model federated viewing
- Type filtering toolbar (left side)
- Color-by-property mode
- Section planes
- Element selection + properties panel
- Model visibility toggle
**Hooks:** `frontend/src/hooks/use-viewer-groups.ts`

### 4. Viewer Groups
**Location:** `frontend/src/pages/ViewerGroups.tsx`
**Components:**
- `CreateGroupDialog` - `frontend/src/components/CreateGroupDialog.tsx`
- `AddModelsDialog` - `frontend/src/components/features/viewers/AddModelsDialog.tsx`
**Backend:** `backend/apps/viewers/` (Django)
**Status:** Create, list, add/remove models working

### 5. Type Mapping (NS-3451)
**Location:** `frontend/src/pages/BIMWorkbench.tsx` (view=types)
**Components:**
- `TypeLibraryPanel` - `frontend/src/components/features/warehouse/TypeLibraryPanel.tsx`
- `TypeMappingWorkspace` - `frontend/src/components/features/warehouse/TypeMappingWorkspace.tsx`
- `TypeInstanceViewer` - `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx`
- `TypeInfoPanel` - `frontend/src/components/features/warehouse/TypeInfoPanel.tsx`
- `NS3451CascadingSelector` - `frontend/src/components/features/warehouse/NS3451CascadingSelector.tsx`
- `MappingProgressBar` - `frontend/src/components/features/warehouse/MappingProgressBar.tsx`
**Backend:** `backend/apps/entities/` (types, mappings, NS-3451 codes)
**Hooks:** `frontend/src/hooks/use-warehouse.ts`
**Features:**
- Model selector dropdown
- Type list with search/filter
- NS-3451 code assignment
- Mapping progress tracking
- Instance count per type

### 6. Dashboard Statistics
**Location:** `frontend/src/pages/ProjectDashboard.tsx`
**Backend:** `backend/apps/projects/views.py` (`statistics` action)
**Components:** Uses Tremor charts (Card, DonutChart, ProgressBar)
**Features:**
- Model count, element count, type/material counts
- Top types/materials by quantity
- NS-3451 coverage percentage
- MMI distribution donut chart
- Project basepoint display
**Performance:** Database indexes added in `0014_add_performance_indexes.py`

### 7. Processing Reports (Dev)
**Location:** `frontend/src/pages/dev/ProcessingReports.tsx`
**Backend:** `backend/apps/models/views.py` (`processing_report` action)
**Status:** Debug tool for viewing IFC processing results

---

## Placeholder Features (Need Implementation)

### Priority: Remove from Nav or Implement

| Feature | Location | Current State |
|---------|----------|---------------|
| Documents | `ProjectDocuments.tsx` | Empty "Coming Soon" |
| Drawings | `ProjectDrawings.tsx` | Empty "Coming Soon" |
| My Issues | `MyIssues.tsx` | Empty "Coming Soon" |
| My RFIs | `MyRFIs.tsx` | Empty "Coming Soon" |
| Scripts Library | `ScriptsLibrary.tsx` | Empty "Coming Soon" |
| Quick Stats | `QuickStats.tsx` | Empty "Coming Soon" |
| Settings | `Settings.tsx` | Empty "Coming Soon" |
| Material Library | `BIMWorkbench.tsx` (view=materials) | Placeholder panel |
| Scripting Tab | `BIMWorkbench.tsx` (view=scripting) | Placeholder panel |

---

## Workbench Views

**Location:** `frontend/src/pages/BIMWorkbench.tsx`
**URL:** `/projects/:id/workbench?view={types|materials|stats|bep|scripting}`

| View | Component | Status |
|------|-----------|--------|
| `types` | `TypeLibraryPanel` | **Working** - Full type mapping |
| `materials` | `MaterialLibraryPanel` (inline) | **Placeholder** |
| `stats` | `MappingStatsPanel` (inline) | **Placeholder** - Static 0% |
| `bep` | `MMITableMaker` | **Working** - MMI level config |
| `scripting` | `ScriptingTab` (inline) | **Placeholder** |

---

## Sidebar Navigation

**Location:** `frontend/src/components/Layout/Sidebar.tsx`

### Global Navigation (when NOT in project)
- My Page → `/my-page`
- My Issues → `/my-issues`
- My RFIs → `/my-rfis`
- Projects → `/projects`
- Scripts Library → `/scripts`
- Quick Stats → `/stats`
- Processing Reports (Dev) → `/dev/processing-reports`

### Project Navigation (when IN project)
- My Page → `/projects/:id/my-page`
- 3D Viewer → `/projects/:id/viewer-groups`
- Dashboard → `/projects/:id` (now models page)
- Models → `/projects/:id/models`
- Documents → `/projects/:id/documents`
- Drawings → `/projects/:id/drawings`
- Workbench → `/projects/:id/workbench`

### Workbench Sub-nav (when IN workbench)
- Type Library → `?view=types`
- Material Library → `?view=materials`
- Mapping Stats → `?view=stats`
- BEP Config → `?view=bep`
- Scripting → `?view=scripting`

---

## Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useProject` | `use-projects.ts` | Single project data |
| `useProjects` | `use-projects.ts` | Project list |
| `useModels` | `use-models.ts` | Models for project |
| `useModel` | `use-models.ts` | Single model data |
| `getUploadUrl` | `use-models.ts` | Get presigned S3 URL |
| `confirmUpload` | `use-models.ts` | Confirm upload complete |
| `useViewerGroups` | `use-viewer-groups.ts` | Viewer groups list |
| `useViewerGroup` | `use-viewer-groups.ts` | Single group data |
| `useModelTypes` | `use-warehouse.ts` | Types for model |
| `useNS3451Codes` | `use-warehouse.ts` | NS-3451 code list |
| `useTypeMappingSummary` | `use-warehouse.ts` | Mapping progress |
| `useProjectStatistics` | `use-project-stats.ts` | Dashboard KPIs |

---

## Backend APIs

### Django REST (Project/Model Metadata)
| Endpoint | Handler | Notes |
|----------|---------|-------|
| `/api/projects/` | `ProjectViewSet` | CRUD |
| `/api/projects/:id/statistics/` | `statistics` action | Dashboard KPIs |
| `/api/models/` | `ModelViewSet` | CRUD |
| `/api/models/get-upload-url/` | `get_upload_url` | Presigned S3 URL |
| `/api/models/confirm-upload/` | `confirm_upload` | Start processing |
| `/api/models/:id/fragments-complete/` | `fragments_complete` | Callback from FastAPI |
| `/api/viewer-groups/` | `ViewerGroupViewSet` | CRUD |
| `/api/types/` | `TypeViewSet` | IFC types |
| `/api/types/:id/mapping/` | `mapping` action | NS-3451 assignment |
| `/api/ns3451-codes/` | `NS3451CodeViewSet` | Code list |

### FastAPI (IFC Processing)
**Location:** `backend/ifc-service/`
| Endpoint | Handler | Notes |
|----------|---------|-------|
| `/process` | `process_ifc` | Full IFC processing |
| `/fragments/generate` | `generate_fragments` | Fragment file generation |
| `/health` | - | Health check |

---

## Recommended Actions

### Priority 1: Make Models Landing (DONE)
- [x] Route `/projects/:id` → `ProjectModels`
- [x] Move dashboard to `/projects/:id/dashboard`
- [x] Update back buttons

### Priority 2: Create UI Feature Index (THIS DOCUMENT)
- [x] Document all routes and components
- [x] Mark working vs placeholder features
- [x] Map hooks to components

### Priority 3: Add Mapping Progress to Model Cards
**Location to modify:** `frontend/src/pages/ProjectModels.tsx`
**Data source:** Need new API endpoint or extend `useModels`
**Display:** Progress bar or badge per model card
**Implementation:**
1. Add `type_count`, `mapped_count` to Model API response
2. Show progress in model card: "42/150 types (28%)"
3. Add "Map Types" quick action button

### Future: Hide Placeholder Features
Options:
1. Remove from sidebar (Sidebar.tsx lines 117-143, 217-241, 376-400)
2. Keep but add "Coming Soon" badge
3. Implement minimal versions

---

## File Quick Reference

```
frontend/src/
├── App.tsx                          # Route definitions
├── pages/
│   ├── ProjectsGallery.tsx          # Project list
│   ├── ProjectModels.tsx            # Model list (landing)
│   ├── ProjectDashboard.tsx         # KPI dashboard
│   ├── BIMWorkbench.tsx             # Type mapping hub
│   ├── ViewerGroups.tsx             # Viewer group list
│   ├── FederatedViewer.tsx          # 3D viewer
│   ├── ModelWorkspace.tsx           # Single model view
│   └── dev/ProcessingReports.tsx    # Debug tool
├── components/
│   ├── Layout/
│   │   ├── Sidebar.tsx              # Navigation
│   │   └── AppLayout.tsx            # Page wrapper
│   ├── features/
│   │   ├── viewer/                  # 3D viewer components
│   │   │   ├── UnifiedBIMViewer.tsx # ThatOpen wrapper
│   │   │   └── ViewerToolPanel.tsx  # Right panel
│   │   └── warehouse/               # Type mapping components
│   │       ├── TypeLibraryPanel.tsx # Main type panel
│   │       └── TypeMappingWorkspace.tsx
│   ├── ModelUploadDialog.tsx        # Upload flow
│   ├── CreateProjectDialog.tsx      # Project creation
│   └── CreateGroupDialog.tsx        # Viewer group creation
└── hooks/
    ├── use-models.ts                # Model CRUD + upload
    ├── use-projects.ts              # Project CRUD
    ├── use-warehouse.ts             # Types, mappings
    ├── use-viewer-groups.ts         # Viewer groups
    └── use-project-stats.ts         # Dashboard stats
```
