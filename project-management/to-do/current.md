# Current TODO List

**Last Updated**: 2025-10-12 (Session 005)
**Session**: 005 - IFC Validation Service + 3D Viewer Foundation

## Session 003 - Completed ✅

### Backend Implementation & Testing
- [x] Create ModelSerializer with upload validation
- [x] Create ModelViewSet with upload endpoint
- [x] Implement IFC extraction service (services.py)
- [x] Test with real IFC file (142 elements, 95% geometry success)
- [x] Document frontend design system (1,270 lines)
- [x] Update CLAUDE.md with design system reference

## Session 004 - Completed ✅

### Frontend Foundation - ALL COMPLETE
- [x] Initialize Vite + React 18 + TypeScript project
- [x] Install and configure Tailwind CSS v4
- [x] Install all dependencies (React Router, Zustand, Tanstack Query, etc.)
- [x] Create design token system (127 lines)
- [x] Copy 13 shadcn/ui components
- [x] Create API client with React Query hooks
- [x] Build Dashboard page with project grid
- [x] Build Project Detail page with model upload
- [x] Build Model Viewer page (3-panel layout)
- [x] Production build verified (327KB bundle)

## Session 005 - Active 🚧

### Phase A: IFC Validation Service - COMPLETE ✅
- [x] Create IFC validation service (services_validation.py - 400 lines)
- [x] Implement schema validation (ifcopenshell.validate)
- [x] Implement GUID duplication detection
- [x] Implement geometry completeness checking
- [x] Implement property set analysis
- [x] Implement LOD analysis
- [x] Create IFCValidationReport database model
- [x] Run database migration (0002_add_ifc_validation_report)
- [x] Integrate validation into IFC upload flow
- [x] Create validation API endpoint (GET /api/models/{id}/validation/)
- [x] Document Session 005 worklog

### Phase A: Current Blocker ⚠️
- [ ] **Debug frontend project display issue**
  - Projects created successfully (2 in database)
  - API calls succeed (POST 201, GET 200)
  - UI not updating after project creation
  - Need to check: API response vs frontend rendering

### Phase B: Basic 3D Viewer - PENDING
- [ ] Create geometry parsing utilities (three-utils.ts)
- [ ] Create IFC color scheme (ifc-colors.ts)
- [ ] Create Viewer3D canvas component
- [ ] Create IFCScene container component
- [ ] Create IFCElement mesh component
- [ ] Update ModelViewer page with 3D integration
- [ ] Test with real model data

### Phase C: Architecture Preparation - PENDING
- [ ] Create ifc_versions table migration
- [ ] Document file naming convention ({name}_endret.ifc)
- [ ] Create ViewModeSelector component (placeholder UI)

### Phase 1: Frontend Foundation

**Setup & Dependencies:**
- [ ] Initialize Vite + React 18 + TypeScript project in `frontend/`
- [ ] Install Tailwind CSS v4 + PostCSS + Autoprefixer
- [ ] Install React Router v6
- [ ] Install Zustand (state management)
- [ ] Install Tanstack Query (React Query)
- [ ] Install Axios (HTTP client)
- [ ] Install Zod (schema validation)
- [ ] Install Lucide React (icons)

**Design System Implementation:**
- [ ] Create `lib/design-tokens.ts` with complete token system
  - Color palette (dark minimalism + Spruce Forge brand)
  - Typography (Inter font, sizes, weights)
  - Spacing scale (8px grid)
  - Border radius, shadows, transitions
- [ ] Configure `tailwind.config.ts` with design tokens
- [ ] Create `styles/globals.css` with CSS variables
- [ ] Install Inter font (Google Fonts or local)

**shadcn/ui Setup:**
- [ ] Run `npx shadcn-ui@latest init`
- [ ] Configure to use design tokens
- [ ] Copy essential components:
  - [ ] button
  - [ ] input
  - [ ] card
  - [ ] dialog
  - [ ] dropdown-menu
  - [ ] tooltip
  - [ ] popover
  - [ ] select
  - [ ] switch
  - [ ] tabs
  - [ ] badge
  - [ ] table

**Project Structure:**
- [ ] Create directory structure:
  - `src/components/ui/` (shadcn/ui components)
  - `src/components/layouts/` (page layouts)
  - `src/components/bim/` (BIM-specific components)
  - `src/lib/` (utilities, API client, design tokens)
  - `src/hooks/` (custom React hooks)
  - `src/stores/` (Zustand stores)
  - `src/pages/` (route pages)
  - `src/styles/` (global styles)

**API Integration:**
- [ ] Create `lib/api-client.ts` with Axios instance
- [ ] Configure base URL (http://127.0.0.1:8000/api/)
- [ ] Create TypeScript types for API responses
- [ ] Create React Query hooks:
  - [ ] `useProjects()` - List projects
  - [ ] `useProject(id)` - Get project details
  - [ ] `useModels(projectId)` - List models
  - [ ] `useModel(id)` - Get model details
  - [ ] `useCreateProject()` - Create project mutation
  - [ ] `useUploadModel()` - Upload model mutation

**Dashboard Page:**
- [ ] Create `pages/Dashboard.tsx`
- [ ] Create `components/layouts/DashboardLayout.tsx`
- [ ] Create `components/ProjectCard.tsx` (Linear-style card)
- [ ] Implement project grid (responsive)
- [ ] Create "Create Project" dialog
- [ ] Add empty state for no projects
- [ ] Connect to backend API

**Routing:**
- [ ] Set up React Router with routes:
  - `/` → Dashboard (project list)
  - `/projects/:id` → Project detail (model list)
  - `/models/:id` → Model viewer (3D + tree + properties)
- [ ] Create `components/layouts/Header.tsx`
- [ ] Create `components/layouts/Sidebar.tsx` (optional)

**Testing:**
- [ ] Test dashboard loads with no projects
- [ ] Test create project flow
- [ ] Test project grid displays correctly
- [ ] Test routing between pages
- [ ] Verify dark mode works
- [ ] Check responsiveness (desktop, tablet, mobile)

### Phase 2: BIM Viewer Foundation (Next Session)

**3D Viewer:**
- [ ] Install Three.js, @react-three/fiber, @react-three/drei
- [ ] Create `components/bim/Viewer3D.tsx`
- [ ] Test loading geometry from backend API
- [ ] Implement camera controls (OrbitControls)
- [ ] Create basic lighting setup

**BIM Components:**
- [ ] Create `components/bim/ModelTree.tsx`
- [ ] Create `components/bim/PropertyPanel.tsx`
- [ ] Create `components/bim/ViewerToolbar.tsx`
- [ ] Implement 3-panel resizable layout

## Future Tasks (Phase 3+)

### Backend Enhancements
- [ ] Install Redis and configure Celery
- [ ] Implement graph edge extraction
- [ ] Implement storage metrics calculation
- [ ] Add geometry endpoint with simplified option
- [ ] Implement change detection service

### Frontend Features
- [ ] Graph visualization (react-force-graph-3d)
- [ ] Change detection UI
- [ ] Command palette (Cmd+K)
- [ ] Keyboard shortcuts
- [ ] Search and filter
- [ ] Export functionality

## Blockers

**Current:** None

**Future:**
- Redis not installed (needed for Celery)
- Large IFC files will timeout (need async processing)

## Session 004 Success Criteria

### Minimum (MVP):
- ✅ React project initialized with TypeScript
- ✅ Tailwind CSS configured with design tokens
- ✅ Dashboard page shows project list
- ✅ Can create new project via UI
- ✅ Dark mode works correctly
- ✅ API integration functional

### Ideal:
- ✅ All shadcn/ui components copied and working
- ✅ Design tokens fully implemented
- ✅ Routing configured for all planned pages
- ✅ Project grid displays with proper styling
- ✅ Responsive on desktop and tablet

## Notes

### Key References
- **Design System Spec**: `project-management/planning/frontend-design-system.md` (1,270 lines)
- **Backend Architecture**: `project-management/planning/session-002-bim-coordinator-platform.md`
- **Session 003 Worklog**: `project-management/worklog/session-003.md`
- **Backend API**: http://127.0.0.1:8000/api/ (must be running)

### Development Environment
- **Node.js**: v18+ required for Vite
- **Package Manager**: npm or yarn
- **Backend**: Django server must be running at http://127.0.0.1:8000/
- **Browser**: Chrome/Edge recommended (React DevTools support)

### Design Principles to Follow
- Dark minimalism (not pure black, use #0a0f14)
- Desaturated colors (20-30% less saturation for dark mode)
- Off-white text (#fafafa, not pure white)
- 8px spacing grid
- Zero hardcoding (use design tokens)
- Accessible (WCAG 2.1 AA minimum)

---

**Next Action**: Initialize Vite + React + TypeScript project in `frontend/` directory

**Status**: Session 004 started, frontend initialization in progress 🚧
