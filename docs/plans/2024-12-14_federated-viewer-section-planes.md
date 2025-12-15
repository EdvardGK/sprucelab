# Federated Viewer: Section Planes & Element Filtering

## Overview
Enhance the federated viewer with:
1. **Section planes** (up to 4) - right-click surface to create, ctrl+scroll to push/pull
2. **Element type filtering** - wire up existing UI to actually hide/show elements

## Current State
- Multi-model loading: **Working**
- Element selection + properties: **Working**
- Camera controls: **Working**
- Section planes: **Not implemented**
- Element filtering: **UI exists, logic not wired**
- Context menu: **Not implemented**

---

## Implementation Plan

### Phase 1: Dependencies & Foundation

**1.1 Add context menu dependency**
```bash
npm install @radix-ui/react-context-menu
```

**1.2 Create shadcn context-menu component**
- File: `frontend/src/components/ui/context-menu.tsx`

---

### Phase 2: Section Planes Core

**2.1 Create section planes hook**
- File: `frontend/src/hooks/useSectionPlanes.ts`
- Initialize ThatOpen `Clipper` component
- State: `planes[]`, `activePlaneId`, max 4 planes
- Functions: `addPlane(point, normal)`, `deletePlane(id)`, `clearAll()`, `setActive(id)`

**2.2 Implement right-click handler in UnifiedBIMViewer**
- File: `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`
- Add `contextmenu` event listener on canvas
- Raycast to get intersection point + face normal
- Store context menu position and target data in state

**2.3 Create context menu component**
- File: `frontend/src/components/features/viewer/ViewerContextMenu.tsx`
- Options:
  - "Add Section Plane" (if < 4 planes)
  - "Hide all [IfcType]"
  - "Isolate [IfcType]"

**2.4 Implement plane creation**
```typescript
// Negate normal so plane clips toward camera
const worldNormal = faceNormal.clone().negate();
const clipper = components.get(OBC.Clipper);
const plane = clipper.createFromNormalAndCoplanarPoint(world, worldNormal, point);
```

---

### Phase 3: Section Plane Manipulation

**3.1 Ctrl+scroll to push/pull plane**
- Add `wheel` event listener (with `{ passive: false }`)
- Check `event.ctrlKey` and `activePlaneId`
- Adjust plane constant (distance from origin) by scroll delta
- Update visual helper position

**3.2 Color-coded plane visualization**
- Colors: Red, Green, Blue, Yellow (planes 1-4)
- Active plane: brighter/glowing outline
- Custom material for each plane's mesh

**3.3 Click plane to select as active**
- Raycast against plane meshes
- Set `activePlaneId` on click

---

### Phase 4: Section Planes Panel UI

**4.1 Create SectionPlanesPanel component**
- File: `frontend/src/components/features/viewer/SectionPlanesPanel.tsx`
- Shows list of active planes with:
  - Color swatch + label ("Section 1", etc.)
  - Click to select as active
  - X button to delete
- "Clear All Planes" button at bottom
- Help text when no planes: "Right-click on a surface..."

**4.2 Integrate into FederatedViewer**
- Add `<SectionPlanesPanel />` to right sidebar (above filters)
- Pass state: `planes`, `activePlaneId`, handlers

---

### Phase 5: Element Type Filtering

**5.1 Create element filter hook**
- File: `frontend/src/hooks/useElementTypeFilter.ts`
- On model load: run `classifier.byEntity(group)` for each model
- Cache classification results by IFC type

**5.2 Wire up filter to UnifiedBIMViewer**
- Pass `elementTypeFilter` prop from FederatedViewer
- Add `useEffect` to apply filters:
```typescript
Object.entries(elementTypeFilter).forEach(([ifcType, visible]) => {
  const fragmentMap = classifier.list.entities?.[ifcType];
  if (fragmentMap) hider.set(visible, fragmentMap);
});
```

**5.3 Dynamic filter list**
- Populate filter checkboxes from actual IFC types found in loaded models
- Remove hardcoded IfcWall/IfcDoor/etc list

---

### Phase 6: Polish & Integration

**6.1 Keyboard shortcuts**
- `Delete`: Remove active section plane
- `Escape`: Deselect active plane
- `1-4`: Quick-select planes

**6.2 User feedback**
- Toast on plane create/delete
- Visual indicator when plane limit reached

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/package.json` | Add `@radix-ui/react-context-menu` |
| `frontend/src/components/ui/context-menu.tsx` | **NEW** - shadcn component |
| `frontend/src/hooks/useSectionPlanes.ts` | **NEW** - section plane logic |
| `frontend/src/hooks/useElementTypeFilter.ts` | **NEW** - filtering logic |
| `frontend/src/components/features/viewer/ViewerContextMenu.tsx` | **NEW** - right-click menu |
| `frontend/src/components/features/viewer/SectionPlanesPanel.tsx` | **NEW** - planes UI panel |
| `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` | Add Clipper, context menu events, filtering |
| `frontend/src/pages/FederatedViewer.tsx` | Add SectionPlanesPanel, wire filter props |

---

## Technical Details

### Surface Normal Detection
```typescript
const raycasters = components.get(OBC.Raycasters);
const raycaster = raycasters.get(world);
const result = raycaster.castRay();

if (result?.face) {
  // Transform face normal to world space
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(result.object.matrixWorld);
  const worldNormal = result.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  worldNormal.negate(); // Clip toward camera
  createPlane(result.point, worldNormal);
}
```

### Plane Distance Adjustment (Ctrl+Scroll)
```typescript
const handleWheel = (e: WheelEvent) => {
  if (!e.ctrlKey || !activePlaneId) return;
  e.preventDefault();

  const plane = planes.find(p => p.id === activePlaneId);
  const delta = e.deltaY > 0 ? 0.5 : -0.5; // meters
  plane.three.constant += delta;
  // Update visual helper position...
};
```

### Section Plane State
```typescript
interface SectionPlane {
  id: string;
  plane: OBC.SimplePlane;
  color: string;  // '#ff0000', '#00ff00', '#0000ff', '#ffff00'
  label: string;  // 'Section 1', etc.
}

interface SectionPlanesState {
  planes: SectionPlane[];
  activePlaneId: string | null;
}
```

---

## Estimated Effort

| Component | Complexity | New Lines |
|-----------|------------|-----------|
| useSectionPlanes hook | Medium | ~150 |
| useElementTypeFilter hook | Low | ~80 |
| ViewerContextMenu | Low | ~80 |
| SectionPlanesPanel | Low | ~100 |
| UnifiedBIMViewer changes | High | ~150 |
| FederatedViewer changes | Low | ~50 |

**Total: ~600 new lines, ~200 modified lines**

---

## Order of Implementation

1. Add context-menu dependency
2. Create useSectionPlanes hook (core logic)
3. Add right-click handler to UnifiedBIMViewer
4. Create ViewerContextMenu
5. Create SectionPlanesPanel
6. Implement ctrl+scroll manipulation
7. Wire up element type filtering
8. Add keyboard shortcuts
9. Test with multiple models
