# Session 016 TODO - Viewer Layout Redesign

**Date Created**: 2025-10-13
**Priority**: High
**Status**: Not Started

---

## 🎯 Primary Goals

### 1. Redesign FederatedViewer Layout
**Current State**: 3-column layout (left: models, center: canvas, right: filters)
**Target State**: Full-width canvas with collapsible right sidebar + floating HUD

**Requirements**:
- [ ] Full-width 3D canvas (left side + center)
- [ ] Single collapsible right sidebar for model list
- [ ] Floating HUD panels for filters
  - [ ] IFC Element Type filter (floating panel)
  - [ ] IFC Systems filter (floating panel)
  - [ ] View controls (floating panel)
- [ ] HUD panels can be toggled on/off
- [ ] HUD panels can be moved/positioned
- [ ] Responsive design (collapse sidebar on mobile)

**Files to Modify**:
- `frontend/src/pages/FederatedViewer.tsx`

---

### 2. Create "Add Models to Group" Dialog

**Requirements**:
- [ ] Button/action to open "Add Models" dialog
- [ ] List all models in current project
- [ ] Filter models (search by name)
- [ ] Multi-select models to add
- [ ] Set coordination data per model:
  - [ ] Offset X, Y, Z
  - [ ] Rotation
  - [ ] Color override
  - [ ] Opacity
  - [ ] Visibility (default: true)
- [ ] Submit to backend: `POST /api/viewers/models/`
- [ ] Refresh group data after adding

**Files to Create**:
- `frontend/src/components/AddModelsDialog.tsx`

**Files to Modify**:
- `frontend/src/pages/FederatedViewer.tsx` (add button)
- `frontend/src/hooks/use-viewer-groups.ts` (already has `useCreateViewerModel`)

---

## 🔨 Secondary Goals

### 3. Edit Group Dialog
- [ ] Create `EditGroupDialog.tsx` component
- [ ] Pre-populate with current group data
- [ ] Update name, description, group_type
- [ ] Wire to `useUpdateViewerGroup` mutation

### 4. Delete Group
- [ ] Add delete button with confirmation
- [ ] Wire to `useDeleteViewerGroup` mutation
- [ ] Navigate back to groups list after delete

### 5. Persist Model Visibility Changes
- [ ] Hook up visibility toggles to `PATCH /api/viewers/models/{id}/`
- [ ] Debounce updates (don't spam API on every toggle)
- [ ] Optimistic UI updates

---

## 🎨 Design Reference

### Viewer Layout Mockup
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Group Name | Model Count | Back Button              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│                   3D Canvas (Full Width)                      │
│                                                               │
│                                                    ┌─────────┐│
│  [HUD: Element Filters]                           │ Models  ││
│                                                    │ List    ││
│  [HUD: System Filters]                            │         ││
│                                                    │ - Model1││
│  [HUD: View Controls]                             │ - Model2││
│                                                    │ - Model3││
│                                                    └─────────┘│
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**HUD Panels**:
- Semi-transparent background
- Draggable/positionable
- Toggle buttons in header to show/hide
- Collapsible

**Right Sidebar**:
- Fixed width (280px)
- Collapsible (icon button)
- Scrollable model list
- Eye toggle per model
- Add models button at top

---

## ✅ Acceptance Criteria

### Viewer Layout:
- [ ] Canvas takes full available width when sidebar closed
- [ ] Canvas resizes smoothly when sidebar opens/closes
- [ ] HUD panels can be toggled independently
- [ ] Layout is responsive (works on tablet/mobile)
- [ ] No layout shift when toggling panels

### Add Models Dialog:
- [ ] Can select multiple models from project
- [ ] Can set basic coordination data
- [ ] Models appear in sidebar after adding
- [ ] No duplicate model assignments (check in backend/frontend)
- [ ] Error handling for failed additions

---

## 🧪 Testing Checklist

- [ ] Open viewer with empty group
- [ ] Add 3 models via dialog
- [ ] Verify models appear in sidebar
- [ ] Toggle HUD panels on/off
- [ ] Collapse/expand right sidebar
- [ ] Toggle model visibility
- [ ] Edit group metadata
- [ ] Delete group (with confirmation)
- [ ] Test on narrow screen (< 1024px)

---

## 📚 Technical Notes

### Three.js Integration (Future)
Not required for this session, but prepare structure:
- HUD panels should not block canvas interactions
- Consider using React Three Fiber (`@react-three/fiber`)
- Need proper z-index management for HUD overlays

### Coordination Data Defaults
When adding models to group:
- Default offset: `(0, 0, 0)`
- Default rotation: `0`
- Default opacity: `1.0`
- Default visibility: `true`
- Default color: `null` (use model's original colors)

### API Endpoints to Use
- `GET /api/models/?project={uuid}` - List available models
- `POST /api/viewers/models/` - Add model to group
- `PATCH /api/viewers/models/{id}/` - Update model settings
- `DELETE /api/viewers/models/{id}/` - Remove model from group

---

## 🚨 Potential Blockers

1. **HUD Panel Dragging**: May need additional library (`react-draggable`)
2. **Canvas Resize Performance**: May need to debounce resize events
3. **Model Geometry Loading**: Will need IFC geometry API (defer to later)

---

## 📝 Session End Goals

By end of Session 016, we should have:
1. ✅ New viewer layout (full canvas + sidebar + HUD)
2. ✅ Working "Add Models" dialog
3. ✅ Models displayed in sidebar
4. ✅ Visibility toggles working

**Stretch Goals**:
- Edit/delete group dialogs
- Persisting visibility changes
- Basic coordination data editing

---

**Estimated Time**: 2-3 hours
**Difficulty**: Medium
**Dependencies**: None (all backend APIs already exist)
