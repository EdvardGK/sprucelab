# Session 004: Two-Level UI Architecture Refactoring

**Date:** 2025-01-12
**Session Duration:** Active
**Status:** Planning → Implementation

---

## Overview

Refactoring the frontend to implement a **two-level navigation architecture** inspired by Linear and Notion. This separates personal workspace from project-specific workspaces for a clearer mental model.

---

## Problem Statement

**Current Design Issues:**
- Sidebar appears everywhere (personal dashboard + project pages)
- Unclear separation between "my work" and "project work"
- Projects and Models navigation is duplicated (main nav + workspace section)
- No clear entry point for personal tasks (issues/RFIs assigned to user)
- Workspace selector doesn't make sense on personal dashboard

**User Confusion:**
- "Where do I see my tasks?"
- "What's the difference between Dashboard and Projects?"
- "Why is there a workspace sidebar on my personal dashboard?"

---

## Solution: Two-Level Architecture

### Level 1: Personal Dashboard (`/`)

**Purpose:** "What do I need to work on today?"

**Layout:** Simple page, NO contextual sidebar

**Sections:**
1. **My Work** (Top priority)
   - 🎯 Issues assigned to me (across all projects)
   - 📝 RFIs delegated to me (across all projects)
   - Grouped by priority/due date

2. **Your Projects**
   - Grid of project cards
   - Click card → Enter project workspace
   - Shows: Project name, model count, last updated

3. **Your Workspace**
   - ⚙️ Personal preferences & settings
   - 📜 Scripts & templates library
   - 📊 Quick stats across all projects

**What You CANNOT Do:**
- Browse models for a specific project
- View project documentation
- Manage project teams
- Configure project settings

---

### Level 2: Project Workspace (`/projects/:id`)

**Purpose:** "Where the work happens for this project"

**Layout:** Contextual sidebar + tabbed content

**Sidebar Navigation:**
```
Project Name
├── 📊 Overview
├── 🏗️ Models
│   ├── All Models
│   ├── Active
│   └── Archived
├── 📁 Documentation
├── 🐛 Issues (project-specific)
├── 📝 RFIs (project-specific)
├── 👥 Team & Access
└── ⚙️ Project Settings
```

**Key Features:**
- Sidebar only appears inside a project
- Everything is scoped to this project
- Clear breadcrumbs: Home > Project A > Models
- "Back to Projects" link

---

## User Journey

```
1. User logs in
   ↓
2. Personal Dashboard (/)
   - Sees 5 issues assigned to them
   - Sees 3 RFIs waiting for response
   - Sees project cards
   ↓
3. Clicks "Building A" project card
   ↓
4. Project Workspace (/projects/:id)
   - Sidebar appears (project context)
   - Default view: Project Overview
   - Can navigate to Models, Docs, Issues, etc.
   ↓
5. Clicks "Models" in sidebar
   ↓
6. Models List (/projects/:id#models)
   - Sees all models for "Building A"
   - Filters, sorts, uploads
   ↓
7. Clicks a model
   ↓
8. 3D Viewer (/models/:modelId)
   - Full 3-panel layout
   - Breadcrumb: Home > Building A > Model v3
```

---

## Implementation Plan

### Phase 1: Refactor Dashboard (No Sidebar)

**Files to Change:**
- `src/pages/Dashboard.tsx`
- `src/components/Layout/AppLayout.tsx` (make sidebar optional)

**Changes:**
1. Remove `<AppLayout>` wrapper with sidebar from Dashboard
2. Replace with simple layout: Header + Content
3. Keep existing project grid
4. Add "My Work" section at top (placeholder for now)
5. Add "Your Workspace" section at bottom (placeholder for now)

**Code Example:**
```tsx
// Dashboard.tsx
export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      {/* Simple header, no sidebar */}
      <SimpleHeader />

      <main className="container mx-auto p-6">
        {/* New: My Work Section */}
        <MyWorkSection />

        {/* Existing: Project Gallery */}
        <ProjectGallery />

        {/* New: User Workspace */}
        <UserWorkspace />
      </main>
    </div>
  );
}
```

---

### Phase 2: Add Contextual Sidebar to ProjectDetail

**Files to Change:**
- `src/pages/ProjectDetail.tsx`
- `src/components/Layout/Sidebar.tsx` (create `ProjectSidebar` variant)

**Changes:**
1. Create `<ProjectSidebar>` component
   - Project name at top
   - Navigation specific to project
   - "Back to Projects" link
   - User profile at bottom

2. Update `ProjectDetail.tsx` to use AppLayout with sidebar:
```tsx
export default function ProjectDetail() {
  const { id } = useParams();

  return (
    <AppLayout
      sidebar={<ProjectSidebar projectId={id} />}
      headerContent={<ProjectHeader />}
    >
      <ProjectContent />
    </AppLayout>
  );
}
```

3. Create tabs/sections for:
   - Overview (default)
   - Models
   - Documentation
   - Issues
   - RFIs
   - Team
   - Settings

---

### Phase 3: Create "My Work" Components

**New Components:**
- `src/components/MyWork/MyIssues.tsx`
- `src/components/MyWork/MyRFIs.tsx`
- `src/components/MyWork/MyWorkSection.tsx`

**Features:**
1. Fetch issues assigned to current user (across all projects)
2. Group by priority: High, Medium, Low
3. Show project name, issue title, due date
4. Click issue → Go to that project's Issues tab

**API Endpoint Needed:**
```
GET /api/my-work/issues/
GET /api/my-work/rfis/
```

**Backend Task:**
- Create new API endpoints that filter by assigned_to=current_user
- Return issues/RFIs with project context

---

### Phase 4: Create "User Workspace" Section

**New Components:**
- `src/components/UserWorkspace/PreferencesCard.tsx`
- `src/components/UserWorkspace/ScriptsLibrary.tsx`
- `src/components/UserWorkspace/QuickStats.tsx`

**Features:**
1. **Preferences:** Link to settings page
2. **Scripts:** User-created automation scripts (future feature)
3. **Quick Stats:** Total models, issues, projects across workspace

---

## Design Specifications

### Personal Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: Logo | Search | Notifications | Profile     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  MY WORK                                             │
│  ┌──────────────────────────────────────────┐      │
│  │ 🎯 Issues Assigned to You (5)            │      │
│  │ ────────────────────────────────────────│      │
│  │ [HIGH] Fix beam placement - Building A   │      │
│  │ [MED]  Review clash detection - Proj C   │      │
│  │ [LOW]  Update model metadata - Proj B    │      │
│  │ ...                                       │      │
│  │                                           │      │
│  │ 📝 RFIs Delegated to You (3)             │      │
│  │ ────────────────────────────────────────│      │
│  │ Clarify door schedule - Building B       │      │
│  │ Review structural notes - Proj D         │      │
│  │ ...                                       │      │
│  └──────────────────────────────────────────┘      │
│                                                      │
│  YOUR PROJECTS                                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │Proj A│ │Proj B│ │Proj C│ │+ New │             │
│  │5 mod │ │12 mod│ │3 mod │ │      │             │
│  └──────┘ └──────┘ └──────┘ └──────┘             │
│                                                      │
│  YOUR WORKSPACE                                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐       │
│  │Preferences│ │Scripts    │ │Quick Stats│       │
│  │⚙️         │ │📜         │ │📊         │       │
│  └───────────┘ └───────────┘ └───────────┘       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

### Project Workspace Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: Home > Project A | Search | Actions         │
├──────────┬──────────────────────────────────────────┤
│          │                                           │
│ PROJECT  │  OVERVIEW                                 │
│ SIDEBAR  │  ┌─────────────────────────────────┐    │
│          │  │ 📊 Project Stats                │    │
│ Building │  │ - 42 models                     │    │
│ A        │  │ - 156 issues                    │    │
│          │  │ - 12 team members               │    │
│ ───────  │  └─────────────────────────────────┘    │
│          │                                           │
│ Overview │  RECENT ACTIVITY                          │
│ Models   │  ┌───────────────────────────────┐      │
│ Docs     │  │ User A uploaded Model v3      │      │
│ Issues   │  │ User B resolved Issue #42     │      │
│ RFIs     │  │ User C added documentation    │      │
│ Team     │  └───────────────────────────────┘      │
│ Settings │                                           │
│          │  MODELS BY STATUS                         │
│ ───────  │  ┌─────┐ ┌─────┐ ┌─────┐               │
│          │  │Ready│ │Proc │ │Error│               │
│ [User]   │  │  40 │ │  1  │ │  1  │               │
│          │  └─────┘ └─────┘ └─────┘               │
└──────────┴──────────────────────────────────────────┘
```

---

## API Requirements

### New Endpoints Needed

**My Work:**
```
GET /api/my-work/issues/
→ Returns issues assigned to current user across all projects
→ Response: { project_name, issue_id, title, priority, due_date }

GET /api/my-work/rfis/
→ Returns RFIs delegated to current user
→ Response: { project_name, rfi_id, subject, status, due_date }
```

**User Workspace:**
```
GET /api/my-workspace/stats/
→ Returns aggregate stats across all user's projects
→ Response: { total_projects, total_models, total_issues, storage_used }
```

---

## File Structure After Refactoring

```
src/
├── pages/
│   ├── Dashboard.tsx                 # Level 1: Personal dashboard (no sidebar)
│   ├── ProjectDetail.tsx             # Level 2: Project workspace (with sidebar)
│   ├── ProjectOverview.tsx           # Tab: Project overview
│   ├── ProjectModels.tsx             # Tab: Models list
│   ├── ProjectIssues.tsx             # Tab: Issues list
│   └── ModelViewer.tsx               # Unchanged (3-panel layout)
│
├── components/
│   ├── Layout/
│   │   ├── AppLayout.tsx             # Updated: Sidebar is optional
│   │   ├── SimpleHeader.tsx          # New: For personal dashboard
│   │   ├── ProjectHeader.tsx         # New: For project workspace
│   │   ├── ProjectSidebar.tsx        # New: Project-contextual sidebar
│   │   └── Sidebar.tsx               # Original (deprecated/unused)
│   │
│   ├── MyWork/
│   │   ├── MyWorkSection.tsx         # New: Wrapper for my work
│   │   ├── MyIssues.tsx              # New: Issues assigned to me
│   │   └── MyRFIs.tsx                # New: RFIs delegated to me
│   │
│   ├── UserWorkspace/
│   │   ├── PreferencesCard.tsx       # New: Link to settings
│   │   ├── ScriptsLibrary.tsx        # New: User scripts (future)
│   │   └── QuickStats.tsx            # New: Aggregate stats
│   │
│   └── Project/
│       ├── ProjectCard.tsx           # Existing
│       ├── ProjectGallery.tsx        # Existing
│       └── ProjectTabs.tsx           # New: Tab navigation
│
└── hooks/
    ├── use-my-work.ts                # New: Fetch my issues/RFIs
    └── use-workspace-stats.ts        # New: Fetch aggregate stats
```

---

## Testing Checklist

### Level 1: Personal Dashboard
- [ ] Dashboard loads without sidebar
- [ ] "My Work" section shows issues assigned to user
- [ ] "My Work" section shows RFIs delegated to user
- [ ] Project gallery displays all accessible projects
- [ ] Clicking project card navigates to project workspace
- [ ] User workspace section renders correctly

### Level 2: Project Workspace
- [ ] Sidebar appears when entering project
- [ ] Sidebar shows project name
- [ ] Sidebar navigation items work (Overview, Models, etc.)
- [ ] Breadcrumbs show correct path
- [ ] "Back to Projects" link works
- [ ] Tab switching works (Overview → Models → Issues, etc.)
- [ ] Sidebar persists when navigating between tabs

### Navigation Flow
- [ ] Dashboard → Project → Dashboard (back button)
- [ ] Dashboard → Project → Model → Project (breadcrumb)
- [ ] Issue in "My Work" → Project Issues tab
- [ ] RFI in "My Work" → Project RFIs tab

---

## Success Criteria

**User Experience:**
1. ✅ Clear separation between personal and project work
2. ✅ No confusion about where to find specific features
3. ✅ Easy to see "what I need to do today"
4. ✅ Easy to navigate within a project

**Technical:**
1. ✅ Sidebar only renders in project workspace
2. ✅ No performance regressions
3. ✅ TypeScript compiles without errors
4. ✅ All routes work correctly
5. ✅ Breadcrumbs are accurate

**Design:**
1. ✅ Matches Linear/Notion patterns
2. ✅ Consistent spacing and typography
3. ✅ Dark theme looks good
4. ✅ Responsive on laptop screens (1366px+)

---

## Timeline

**Estimated Time:** 4-6 hours

**Phase 1:** Refactor Dashboard (1-2 hours)
**Phase 2:** Add Contextual Sidebar (1-2 hours)
**Phase 3:** Create "My Work" Components (1 hour)
**Phase 4:** Create "User Workspace" Section (30 min)
**Testing & Polish:** (1 hour)

---

## Notes

- This is a **breaking change** for existing users (navigation changes)
- Backend API endpoints needed for "My Work" section
- Consider adding a "What's New" modal on first load after update
- Document the new navigation in user guide

---

## References

- **Design Guide:** `/project-management/planning/frontend-design-system.md` (Section 7: Application Architecture)
- **Linear:** https://linear.app (reference for two-level architecture)
- **Notion:** https://notion.so (reference for workspace navigation)

---

**Status:** Ready for implementation
**Next Steps:** Start with Phase 1 (Refactor Dashboard)
