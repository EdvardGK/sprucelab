# Current TODO - BIM Coordinator Platform

**Last Updated**: 2025-10-20 (Session 017)
**Status**: ✅ Celery Integration Complete

---

## ✅ Completed (Session 017) - Celery Integration

- [x] Create Celery tasks for IFC processing
- [x] Add celery_task_id field to Model
- [x] Replace threading.Thread with Celery tasks
- [x] Update status endpoint to query Celery
- [x] Convert revert operation to async
- [x] Enhance Celery configuration
- [x] Create test_celery management command
- [x] Create CELERY_SETUP.md documentation

---

## ✅ Completed (Session 015)

- [x] Fix TypeScript build errors (15 errors)
- [x] Install missing Radix UI checkbox package
- [x] Delete legacy viewer files
- [x] Debug why viewer groups not displaying
- [x] Fix pagination response handling in React hooks
- [x] Update FederatedViewer to load real data
- [x] Match viewer group card styling to model cards
- [x] Add gallery/table views to ViewerGroups page

---

## 🎯 Next Session (016) - High Priority

### Viewer Layout Redesign
- [ ] Replace 3-column layout with full-width canvas
- [ ] Add collapsible right sidebar for models
- [ ] Implement floating HUD panels for filters
- [ ] Make HUD panels toggleable

### Add Models Feature
- [ ] Create "Add Models to Group" dialog
- [ ] List available models from project
- [ ] Support multi-select with coordination data
- [ ] Wire up to backend API
- [ ] Refresh group after adding models

**See**: `project-management/to-do/session-016-viewer-layout.md` for detailed breakdown

---

## 🔨 Medium Priority (Future Sessions)

### Group Management
- [ ] Edit group dialog
- [ ] Delete group with confirmation
- [ ] Duplicate group
- [ ] Reorder models in group

### Model Management
- [ ] Persist model visibility changes to backend
- [ ] Edit model coordination data (offset, rotation, color, opacity)
- [ ] Remove models from group
- [ ] Batch update coordination data

### 3D Viewer Integration
- [ ] Set up Three.js canvas
- [ ] Load IFC geometry from backend
- [ ] Implement camera controls (orbit, pan, zoom)
- [ ] Apply visibility/color/opacity from backend
- [ ] Sync 3D selection with sidebar

### Filter Functionality
- [ ] Connect IFC Element Type filters to backend queries
- [ ] Connect IFC Systems filters to backend queries
- [ ] Apply filters to 3D visualization
- [ ] Save/load filter presets

---

## 🚀 Low Priority (Polish & Optimization)

### Performance
- [ ] Implement virtual scrolling for large model lists
- [ ] Lazy load 3D geometry
- [ ] Optimize re-renders with React.memo
- [ ] Add loading skeletons

### UX Improvements
- [ ] Keyboard shortcuts (e.g., H to toggle HUD)
- [ ] Tooltips for all icons
- [ ] Undo/redo for viewer changes
- [ ] Export viewer configuration as JSON
- [ ] Import viewer configuration

### Testing
- [ ] Unit tests for hooks
- [ ] Integration tests for viewer
- [ ] E2E tests for group creation flow
- [ ] Performance benchmarks

---

## 📋 Backlog (Research/Design Needed)

### Advanced Features
- [ ] Clash detection visualization
- [ ] Measure tools in 3D viewer
- [ ] Section planes/cutting views
- [ ] Animation/4D timeline
- [ ] Multi-user collaboration
- [ ] Comments/annotations in 3D

### BEP Integration
- [ ] Link viewer groups to BEP milestones
- [ ] Validate model maturity levels (MMI)
- [ ] Check naming conventions compliance
- [ ] Generate coordination reports

---

## 🐛 Known Issues

**None currently!** All blocking issues resolved in Session 015.

---

## 💡 Ideas / Future Enhancements

1. **Group Templates**: Pre-configured group setups (e.g., "Full Building", "MEP Coordination", "Structural Review")

2. **Smart Grouping**: Auto-create groups based on:
   - Model discipline (ARK, STR, HVAC, etc.)
   - Building zones
   - Construction phases

3. **Model Comparison**: Side-by-side viewer for version comparison

4. **Export Options**:
   - Export combined IFC from group
   - Export BCF issues from viewer
   - Export screenshots/videos

5. **Integration**:
   - Link to external BIM tools (Solibri, Navisworks)
   - Export to game engines (Unity, Unreal)

---

## 📊 Progress Tracking

**Overall Project Completion**: ~60%

### Backend ✅ 95% Complete
- [x] Database models
- [x] REST API endpoints
- [x] BEP system
- [ ] 3D geometry optimization (pending)

### Frontend 🔨 70% Complete
- [x] Project/Model management
- [x] Viewer groups UI
- [x] Group creation/listing
- [ ] Add models dialog (in progress)
- [ ] 3D viewer (pending)
- [ ] Filters (pending)

### 3D Visualization 🚧 10% Complete
- [ ] Three.js setup (pending)
- [ ] Geometry loading (pending)
- [ ] Camera controls (pending)
- [ ] Visual effects (pending)

---

**Next Action**: Start Session 016 with viewer layout redesign
**Blocker**: None
**Estimated Time to MVP**: 2-3 more sessions
