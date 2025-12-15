# Unified BIM Viewer Implementation Plan

**Date**: 2025-11-02
**Status**: Planning
**Priority**: High
**Estimated Effort**: 4-6 hours

---

## Executive Summary

Consolidate two BIM viewer components (`BIMCoordinatorViewer` and `EmergencyThatOpenViewer`) into a single `UnifiedBIMViewer` that supports both single-model and multi-model (federated) viewing. This addresses the critical issue where the FederatedViewer currently only displays the first model instead of showing all models simultaneously.

---

## Problem Statement

### Current State

**Two Separate Viewers:**

1. **BIMCoordinatorViewer** (`/frontend/src/components/features/viewer/BIMCoordinatorViewer.tsx`)
   - Modern ThatOpen v2.4.11 API ✅
   - Integrated with Django backend
   - Supports Fragments (10-100x faster loading)
   - Modern `OBCF.Highlighter` for selection
   - **Limitation**: Only handles single model

2. **EmergencyThatOpenViewer** (`/frontend/src/components/features/viewer/EmergencyThatOpenViewer.tsx`)
   - Outdated ThatOpen API (marked "needs rewrite") ❌
   - Client-side file upload only
   - Manual raycasting for selection
   - No backend integration
   - **Limitation**: Only handles single model

### Critical Issues

1. **Code Duplication**: Two viewers with 80% overlapping functionality
2. **Inconsistent APIs**: One modern, one outdated
3. **FederatedViewer Broken**: Only shows first model despite being called "Federated Viewer"
4. **Maintenance Burden**: Bug fixes need to be applied twice
5. **API Confusion**: Developers unsure which viewer to use

### Impact

- **FederatedViewer Page**: Non-functional for multi-model viewing (main use case broken)
- **ModelWorkspace Page**: Works but uses single-model-only viewer
- **EmergencyViewer Page**: Uses outdated API (technical debt)

---

## Proposed Solution

### Create Single Unified Viewer

**Component**: `UnifiedBIMViewer.tsx`

**Capabilities**:
- ✅ Load single model (ModelWorkspace use case)
- ✅ Load multiple models simultaneously (FederatedViewer use case)
- ✅ Modern ThatOpen v2.4.11 API
- ✅ Backend integration with Fragments support
- ✅ Per-model visibility toggles
- ✅ Element filtering (IFC type, systems)
- ✅ Configurable UI panels
- ✅ Proper event callbacks

**Base Architecture**: Start with `BIMCoordinatorViewer` (modern API)

---

## Technical Design

### Component Interface

```typescript
interface UnifiedBIMViewerProps {
  // Model Loading
  modelIds?: string[];              // Array for multi-model support
  modelId?: string;                 // Convenience prop for single model

  // Visibility Control
  modelVisibility?: Record<string, boolean>;  // Toggle models on/off

  // Filtering
  elementTypeFilter?: string[];     // ['IfcWall', 'IfcDoor']
  systemFilter?: string[];          // ['HVAC System 1']

  // UI Configuration
  showPropertiesPanel?: boolean;    // Default: true
  showModelInfo?: boolean;          // Default: true
  showControls?: boolean;           // Default: true

  // Callbacks
  onSelectionChange?: (element: ElementProperties | null) => void;
  onModelLoaded?: (modelId: string, elementCount: number) => void;
  onError?: (error: string) => void;

  // Camera
  autoFitToView?: boolean;          // Default: true
  initialCameraPosition?: THREE.Vector3;
}
```

### Key Architectural Changes from BIMCoordinatorViewer

#### 1. Multi-Model Loading

**Current** (single model):
```typescript
const loadModel = async () => {
  const model = await fetch(`/api/models/${modelId}`);
  // Load fragments or IFC
};
```

**New** (multiple models):
```typescript
const loadModels = async () => {
  const loadPromises = modelIds.map(async (modelId) => {
    const model = await fetch(`/api/models/${modelId}`);
    // Load fragments or IFC
    return { modelId, group };
  });

  const loadedModels = await Promise.all(loadPromises);

  // Add all to scene
  loadedModels.forEach(({ group }) => {
    world.scene.three.add(group);
  });

  // Fit camera to combined bounds
  fitAllModelsToView();
};
```

#### 2. Combined Bounding Box Calculation

```typescript
const fitAllModelsToView = () => {
  // Calculate combined bounding box
  const combinedBbox = new THREE.Box3();

  loadedModelsRef.current.forEach(group => {
    const bbox = new THREE.Box3();
    bbox.setFromObject(group);
    combinedBbox.union(bbox);
  });

  // Position camera to view all models
  const center = new THREE.Vector3();
  combinedBbox.getCenter(center);

  const size = new THREE.Vector3();
  combinedBbox.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.5;

  world.camera.controls.setLookAt(
    center.x + distance * 0.7,
    center.y + distance * 0.7,
    center.z + distance * 0.7,
    center.x, center.y, center.z
  );
};
```

#### 3. Per-Model Visibility

```typescript
useEffect(() => {
  if (!modelVisibility) return;

  loadedModelsRef.current.forEach(({ modelId, group }) => {
    const visible = modelVisibility[modelId] ?? true;
    group.visible = visible;
  });
}, [modelVisibility]);
```

#### 4. Selection Across Models

```typescript
const handleSelection = async () => {
  const selection = highlighter.selection.select;

  // Selection now includes model ID
  for (const modelID in selection) {
    const fragmentsData = selection[modelID];

    if (fragmentsData instanceof Set && fragmentsData.size > 0) {
      const expressID = Array.from(fragmentsData)[0];

      // Find which backend model this came from
      const backendModel = modelIdMap.get(modelID);

      // Fetch properties from correct model
      const response = await fetch(
        `/api/entities/?model=${backendModel}&express_id=${expressID}`
      );

      // ... rest of logic
    }
  }
};
```

### Data Structures

```typescript
// Track loaded models
interface LoadedModel {
  modelId: string;           // Backend model ID
  fragmentModelId: string;   // ThatOpen internal model ID
  group: FragmentsGroup;     // Three.js group
  elementCount: number;
  loadMethod: 'fragments' | 'ifc';
}

const loadedModelsRef = useRef<LoadedModel[]>([]);

// Map fragment model IDs to backend model IDs
const modelIdMapRef = useRef<Map<string, string>>(new Map());
```

---

## Implementation Plan

### Phase 1: Create Unified Viewer (3-4 hours)

#### Task 1.1: Copy and Rename Base Component
**File**: `/frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`

- [x] Copy `BIMCoordinatorViewer.tsx` as starting point
- [ ] Update component name and exports
- [ ] Update interface to support new props

#### Task 1.2: Add Multi-Model Support
- [ ] Change `modelId` prop to `modelIds?: string[]`
- [ ] Add convenience handling: `modelId` → `modelIds={[modelId]}`
- [ ] Refactor `loadModel()` to `loadModels()` with Promise.all
- [ ] Store loaded models in `loadedModelsRef`
- [ ] Create `modelIdMapRef` for fragment→backend ID mapping

#### Task 1.3: Implement Combined Camera Fit
- [ ] Create `fitAllModelsToView()` function
- [ ] Calculate combined bounding box
- [ ] Update camera to show all models
- [ ] Add "Fit All" button to UI

#### Task 1.4: Add Visibility Control
- [ ] Accept `modelVisibility` prop
- [ ] Add useEffect to toggle model visibility
- [ ] Update UI to show per-model visibility status

#### Task 1.5: Fix Selection for Multi-Model
- [ ] Update `handleSelection` to map fragment IDs to backend model IDs
- [ ] Fetch properties from correct backend model
- [ ] Show model name in selection info

#### Task 1.6: Make UI Configurable
- [ ] Add `showPropertiesPanel` prop (default: true)
- [ ] Add `showModelInfo` prop (default: true)
- [ ] Add `showControls` prop (default: true)
- [ ] Conditionally render panels based on props

#### Task 1.7: Add Event Callbacks
- [ ] Add `onSelectionChange` callback
- [ ] Add `onModelLoaded` callback per model
- [ ] Add `onError` callback

### Phase 2: Update Consumer Components (1-2 hours)

#### Task 2.1: Update ModelWorkspace
**File**: `/frontend/src/pages/ModelWorkspace.tsx`

- [ ] Import `UnifiedBIMViewer` instead of `BIMCoordinatorViewer`
- [ ] Update props:
  ```typescript
  <UnifiedBIMViewer
    modelId={model.id}
    showPropertiesPanel={false}  // Use external panel
    onSelectionChange={handleSelection}
  />
  ```
- [ ] Test single model loading
- [ ] Verify selection works
- [ ] Verify properties panel works

#### Task 2.2: Update FederatedViewer
**File**: `/frontend/src/pages/FederatedViewer.tsx`

**Current Code** (broken):
```typescript
<BIMCoordinatorViewer
  modelId={group.models[0].model}  // Only first model!
/>
```

**New Code** (fixed):
```typescript
<UnifiedBIMViewer
  modelIds={group.models.map(m => m.model)}
  modelVisibility={modelVisibility}
  elementTypeFilter={Object.keys(elementTypeFilters)
    .filter(k => elementTypeFilters[k])}
  systemFilter={Object.keys(systemFilters)
    .filter(k => systemFilters[k])}
  showPropertiesPanel={true}
  onSelectionChange={handleSelection}
/>
```

- [ ] Update import
- [ ] Pass all model IDs instead of just first
- [ ] Connect visibility state
- [ ] Connect filter state
- [ ] Test multi-model loading
- [ ] Verify all models visible
- [ ] Test visibility toggles
- [ ] Test filters

#### Task 2.3: Handle EmergencyViewer
**Decision**: Delete it (outdated, rarely used)

- [ ] Delete `/frontend/src/pages/EmergencyViewer.tsx`
- [ ] Remove route from router config
- [ ] Remove navigation links (if any)

### Phase 3: Clean Up Old Components (30 mins)

#### Task 3.1: Remove Old Viewers
- [ ] Delete `/frontend/src/components/features/viewer/BIMCoordinatorViewer.tsx`
- [ ] Delete `/frontend/src/components/features/viewer/EmergencyThatOpenViewer.tsx`

#### Task 3.2: Verify No Broken Imports
```bash
# Search for old imports
cd /home/edkjo/dev/sprucelab/frontend
grep -r "BIMCoordinatorViewer" src/
grep -r "EmergencyThatOpenViewer" src/
```

- [ ] Fix any remaining imports
- [ ] Verify TypeScript compilation succeeds

### Phase 4: Testing & Validation (1-2 hours)

#### Test Suite

**Single Model Tests** (ModelWorkspace):
- [ ] Load small model (<10MB) - verify fast load
- [ ] Load large model (>50MB) - verify fragments work
- [ ] Load model without fragments - verify IFC fallback
- [ ] Select element - verify properties fetch
- [ ] Click "Fit to View" button - verify camera adjustment
- [ ] Rotate/zoom/pan - verify controls work
- [ ] Hot reload page - verify no errors

**Multi-Model Tests** (FederatedViewer):
- [ ] Load 2 models - verify both visible
- [ ] Load 3+ models - verify all visible
- [ ] Toggle model visibility - verify hide/show works
- [ ] Select element from model A - verify properties show
- [ ] Select element from model B - verify properties show
- [ ] Apply IFC type filter - verify filtering works
- [ ] Apply system filter - verify filtering works
- [ ] Click "Fit All" - verify camera shows all models
- [ ] Hot reload page - verify no errors

**Performance Tests**:
- [ ] Load 3 models with fragments - should be <5 seconds total
- [ ] Load 3 models with IFC fallback - should be <60 seconds total
- [ ] Memory usage - check for leaks (reload multiple times)
- [ ] Selection responsiveness - should be instant

**Edge Cases**:
- [ ] Load viewer with no models - show empty state
- [ ] Load model that doesn't exist - show error
- [ ] Model fails to load - show error, other models still work
- [ ] Backend API down - show error message
- [ ] Very large model (>200MB) - show loading progress

---

## Risk Mitigation

### Risk 1: Multi-Model Selection Confusion
**Concern**: ThatOpen Highlighter might assign conflicting IDs across models

**Mitigation**:
- Maintain `modelIdMap` to track fragment model IDs → backend model IDs
- Test extensively with 2-3 models
- Add model name to selection UI for clarity

### Risk 2: Performance with Multiple Large Models
**Concern**: Loading 3-4 large IFC files could freeze browser

**Mitigation**:
- Always prefer Fragments (10-100x faster)
- Implement per-model loading progress indicators
- Consider sequential loading instead of parallel
- Add model size warnings in UI

### Risk 3: Breaking Existing Pages During Migration
**Concern**: ModelWorkspace or FederatedViewer might break mid-migration

**Mitigation**:
- Keep old viewers until migration complete
- Test each page individually before cleanup
- Deploy to staging environment first
- Have rollback plan ready

### Risk 4: Camera Positioning with Distant Models
**Concern**: Models far apart might not fit in view nicely

**Mitigation**:
- Calculate proper combined bounding box
- Use larger camera distance multiplier (2.0x instead of 1.5x)
- Add "Focus on Model X" button for individual model focus
- Test with real-world federated model scenarios

---

## Testing Strategy

### Unit Tests (Optional)
- [ ] Test `fitAllModelsToView()` with various model configurations
- [ ] Test `modelIdMap` creation and lookup
- [ ] Test visibility toggle logic

### Integration Tests
- [ ] Test with actual backend API
- [ ] Test with real IFC files from database
- [ ] Test fragment loading from backend
- [ ] Test property fetching from backend

### Manual Testing Checklist
See Phase 4 test suite above

### Performance Benchmarks
- **Single small model (<10MB)**: <2 seconds to load
- **Single large model (>50MB)**: <5 seconds with fragments
- **Three models with fragments**: <10 seconds total
- **Selection response**: <100ms
- **Camera fit**: <200ms

---

## Rollback Plan

### If Critical Issues Found

**Option A: Revert to Old Viewers**
1. Restore deleted files from git history
2. Revert changes to ModelWorkspace and FederatedViewer
3. Document issues found
4. Create new plan addressing issues

**Option B: Hot-Fix in Production**
1. Keep old viewers as fallback imports
2. Add feature flag: `USE_UNIFIED_VIEWER`
3. Toggle flag to switch between old and new
4. Fix issues with unified viewer
5. Remove flag once stable

### Rollback Commands
```bash
# Restore deleted viewers
git checkout HEAD~1 -- frontend/src/components/features/viewer/BIMCoordinatorViewer.tsx
git checkout HEAD~1 -- frontend/src/components/features/viewer/EmergencyThatOpenViewer.tsx

# Revert consumer changes
git checkout HEAD~1 -- frontend/src/pages/ModelWorkspace.tsx
git checkout HEAD~1 -- frontend/src/pages/FederatedViewer.tsx
```

---

## Success Criteria

### Must Have (Required for Release)
- ✅ Single model loads and displays correctly (ModelWorkspace)
- ✅ Multiple models load and display simultaneously (FederatedViewer)
- ✅ All models visible in scene without conflicts
- ✅ Element selection works across all models
- ✅ Properties fetch from backend for selected elements
- ✅ Camera fits all models correctly
- ✅ No console errors during normal operation
- ✅ Hot reload doesn't break viewer

### Should Have (Nice to Have)
- ✅ Per-model visibility toggles work
- ✅ Element type filtering works
- ✅ System filtering works
- ✅ Loading progress indicators per model
- ✅ Model info shows load method (Fragments/IFC)

### Could Have (Future Enhancement)
- Model color coding in multi-model view
- Progressive loading (one model at a time)
- Model clash detection
- Export multi-model scene
- Upload mode for emergency viewer

---

## Post-Implementation Tasks

### Documentation Updates
- [ ] Update `CLAUDE.md` with new viewer info
- [ ] Update component README (if exists)
- [ ] Document props and usage examples
- [ ] Add screenshots to docs

### Code Quality
- [ ] Run TypeScript type check
- [ ] Run linter
- [ ] Add JSDoc comments to complex functions
- [ ] Remove debug console.logs

### Future Improvements
- [ ] Add element count per model
- [ ] Add per-model load status indicators
- [ ] Implement model clash detection
- [ ] Add model transparency controls
- [ ] Implement section cuts across all models

---

## Timeline

| Phase | Tasks | Estimated Time | Dependencies |
|-------|-------|----------------|--------------|
| 1 | Create Unified Viewer | 3-4 hours | None |
| 2 | Update Consumers | 1-2 hours | Phase 1 complete |
| 3 | Clean Up | 30 mins | Phase 2 tested |
| 4 | Testing | 1-2 hours | Phase 3 complete |
| **Total** | | **6-9 hours** | |

### Recommended Schedule
- **Session 1** (3-4 hours): Complete Phase 1
- **Session 2** (2-3 hours): Complete Phases 2 & 3
- **Session 3** (1-2 hours): Complete Phase 4

---

## References

### Key Files
- Current BIMCoordinatorViewer: `/frontend/src/components/features/viewer/BIMCoordinatorViewer.tsx`
- Current EmergencyThatOpenViewer: `/frontend/src/components/features/viewer/EmergencyThatOpenViewer.tsx`
- ModelWorkspace page: `/frontend/src/pages/ModelWorkspace.tsx`
- FederatedViewer page: `/frontend/src/pages/FederatedViewer.tsx`

### Related Documentation
- ThatOpen Components v2.4.11: https://docs.thatopen.com/
- Three.js Documentation: https://threejs.org/docs/
- Backend Models API: `/backend/apps/models/views.py`

### Related Issues
- FederatedViewer only shows first model (critical bug)
- EmergencyThatOpenViewer uses outdated API (technical debt)
- Code duplication between viewers (maintenance burden)

---

## Sign-Off

**Plan Author**: Claude
**Plan Reviewer**: [To be filled]
**Approved By**: [To be filled]
**Approval Date**: [To be filled]

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-02 | 1.0 | Initial plan created | Claude |
