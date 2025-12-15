# Session 005 Planning: Three.js 3D Viewer Implementation

**Date**: 2025-10-12
**Status**: Planning
**Prerequisites**: Frontend initialized (Session 004), Three.js dependencies installed

---

## Overview

Implement a production-ready 3D BIM viewer using React Three Fiber (R3F) to display IFC geometry with element selection, model tree navigation, and property viewing.

**Core Requirements**:
- Display IFC geometry in 3D (walls, slabs, roofs, etc.)
- Interactive camera controls (orbit, pan, zoom)
- Click element → show properties
- Model tree with spatial hierarchy
- Color elements by IFC type
- Smooth 60fps performance

---

## Architecture Decisions

### React Three Fiber vs Native Three.js

**Decision**: Use React Three Fiber (R3F)

**Rationale**:
- Declarative React components for 3D scene
- Better state management integration
- @react-three/drei provides helpers (OrbitControls, etc.)
- Easier testing and debugging
- Smaller bundle with tree-shaking
- Already installed and configured

**Trade-offs**:
- Slightly higher learning curve (R3F patterns)
- Additional abstraction layer over Three.js

### Geometry Storage Format

**Current API Response**:
```json
{
  "id": 123,
  "ifc_guid": "2O2Fr$t4X7Zf8NOew3FLOH",
  "ifc_type": "IfcWall",
  "name": "Wall-001",
  "geometry": {
    "vertices": [[x1,y1,z1], [x2,y2,z2], ...],
    "faces": [[i1,j1,k1], [i2,j2,k2], ...]
  }
}
```

**Decision**: Parse directly into Three.js BufferGeometry

**Approach**:
```typescript
const positions = new Float32Array(vertices.flat());
const indices = new Uint32Array(faces.flat());

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setIndex(new THREE.BufferAttribute(indices, 1));
geometry.computeVertexNormals(); // For lighting
```

### Color Scheme by IFC Type

**Decision**: Use semantic colors from design system

**Color Mapping**:
```typescript
const IFC_COLORS: Record<string, string> = {
  // Structure (forest green tones)
  'IfcWall': '#33a070',
  'IfcWallStandardCase': '#33a070',
  'IfcSlab': '#2d8a5f',
  'IfcRoof': '#27744f',
  'IfcColumn': '#486b5b',
  'IfcBeam': '#5a7d6e',
  'IfcStair': '#3d9165',

  // MEP (brand accent tones)
  'IfcDuct': '#5ddfff',        // Cyan
  'IfcPipe': '#1890ff',        // Ocean blue
  'IfcCableCarrierSegment': '#5dffca', // Mint

  // Openings (desaturated)
  'IfcWindow': '#a0aec0',
  'IfcDoor': '#cbd5e0',

  // Default
  'default': '#718096'
};
```

### State Management

**Selection State**:
- Zustand store for selected element ID
- Shared between 3D viewer, model tree, property panel

```typescript
interface ViewerState {
  selectedElementId: string | null;
  setSelectedElement: (id: string | null) => void;
  highlightedElements: string[];
  setHighlightedElements: (ids: string[]) => void;
  cameraPosition: [number, number, number];
  setCameraPosition: (pos: [number, number, number]) => void;
}
```

**Geometry Cache**:
- React Query manages API fetching and caching
- Three.js objects stored in component refs (not state)

---

## Component Architecture

### Viewer3D Component

**Purpose**: Main canvas container for 3D scene

**Props**:
```typescript
interface Viewer3DProps {
  modelId: string;
  onElementSelect?: (elementId: string) => void;
}
```

**Structure**:
```tsx
<Canvas
  camera={{ position: [50, 50, 50], fov: 50 }}
  style={{ background: tokens.color.background.base }}
>
  <Lighting />
  <OrbitControls />
  <IFCScene modelId={modelId} />
  <Grid />
  <AxesHelper size={10} />
</Canvas>
```

### IFCScene Component

**Purpose**: Load and display all IFC elements

**Responsibilities**:
- Fetch geometry data via React Query
- Create mesh for each element
- Handle loading/error states
- Apply colors by type
- Enable raycasting for selection

**Structure**:
```tsx
function IFCScene({ modelId }: { modelId: string }) {
  const { data: elements, isLoading } = useGeometry(modelId);

  if (isLoading) return <Loader />;

  return (
    <group>
      {elements?.map(element => (
        <IFCElement key={element.id} element={element} />
      ))}
    </group>
  );
}
```

### IFCElement Component

**Purpose**: Single IFC element mesh

**Responsibilities**:
- Parse vertices/faces into BufferGeometry
- Apply material (color by type)
- Handle selection highlighting
- Raycasting for click detection

**Structure**:
```tsx
function IFCElement({ element }: { element: IFCEntity }) {
  const geometry = useMemo(() => parseGeometry(element.geometry), [element]);
  const color = IFC_COLORS[element.ifc_type] || IFC_COLORS.default;
  const isSelected = useViewerStore(state => state.selectedElementId === element.id);

  return (
    <mesh
      geometry={geometry}
      onClick={() => handleSelect(element.id)}
    >
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? '#5dffca' : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
    </mesh>
  );
}
```

### ModelTree Component

**Purpose**: Hierarchical tree of spatial structure

**Data Structure**:
```typescript
interface TreeNode {
  id: string;
  type: 'project' | 'site' | 'building' | 'storey' | 'element';
  name: string;
  ifcType?: string;
  children: TreeNode[];
  elementId?: string; // For element nodes
}
```

**API Endpoint**:
```
GET /api/models/{id}/hierarchy/
```

**Features**:
- Collapsible hierarchy
- Search/filter
- Click → select in 3D
- Show/hide checkboxes
- Element count badges

### PropertyPanel Component

**Purpose**: Display selected element properties

**Data Sources**:
- Basic info from geometry API (type, name, GUID)
- Detailed properties from new endpoint:
  ```
  GET /api/elements/{id}/properties/
  ```

**Sections**:
1. **Element Info** (type, name, GUID)
2. **Geometry** (vertex count, face count, bounds)
3. **Property Sets** (all Psets as collapsible sections)
4. **Materials** (if assigned)
5. **Systems** (if member of system)

---

## API Requirements

### New Endpoints Needed

**1. Geometry Data Endpoint**
```
GET /api/models/{id}/elements/
Response: {
  "count": 142,
  "results": [
    {
      "id": 123,
      "ifc_guid": "2O2Fr$t4X7Zf8NOew3FLOH",
      "ifc_type": "IfcWall",
      "name": "Wall-001",
      "geometry": {
        "vertices": [[x,y,z], ...],
        "faces": [[i,j,k], ...]
      }
    },
    ...
  ]
}
```
**Status**: ✅ Already exists (implemented in Session 003)

**2. Spatial Hierarchy Endpoint**
```
GET /api/models/{id}/hierarchy/
Response: {
  "project": {
    "id": "proj-1",
    "name": "Project Name",
    "children": [
      {
        "id": "site-1",
        "type": "site",
        "name": "Site",
        "children": [...]
      }
    ]
  }
}
```
**Status**: ⚠️ Needs implementation in backend

**3. Element Properties Endpoint**
```
GET /api/elements/{id}/properties/
Response: {
  "element": { "id": 123, "type": "IfcWall", ... },
  "property_sets": [
    {
      "name": "Pset_WallCommon",
      "properties": [
        { "name": "IsExternal", "value": "True", "type": "boolean" },
        { "name": "LoadBearing", "value": "True", "type": "boolean" }
      ]
    }
  ],
  "materials": [...],
  "systems": [...]
}
```
**Status**: ⚠️ Needs implementation in backend

---

## Implementation Plan

### Phase 5A: Basic 3D Scene (60 min)

**Goal**: Display geometry in Three.js

**Steps**:
1. Create `src/lib/three-utils.ts` - Geometry parsing helpers
2. Create `src/lib/ifc-colors.ts` - Color scheme
3. Create `src/components/Viewer3D.tsx` - Canvas setup
4. Create `src/components/IFCScene.tsx` - Scene container
5. Create `src/components/IFCElement.tsx` - Single element mesh
6. Update `src/pages/ModelViewer.tsx` - Integrate Viewer3D
7. Test with real model data

**Success Criteria**:
- [ ] Geometry displays correctly
- [ ] Can orbit/pan/zoom
- [ ] Elements colored by type
- [ ] No console errors

### Phase 5B: Element Selection (45 min)

**Goal**: Click to select and highlight

**Steps**:
1. Create `src/stores/viewer-store.ts` - Zustand store for selection
2. Add onClick handler to IFCElement
3. Implement selection highlighting (emissive glow)
4. Clear selection on background click
5. Test selection state

**Success Criteria**:
- [ ] Click element → highlights
- [ ] Click background → clears
- [ ] Selected element glows
- [ ] Selection state persists

### Phase 5C: Property Panel (60 min)

**Goal**: Show selected element properties

**Steps**:
1. Create `src/components/PropertyPanel.tsx`
2. Create `src/hooks/use-element-properties.ts` - Fetch properties
3. Implement property display (collapsible sections)
4. Integrate with selection state
5. Add loading/error states

**Backend Work Required**:
- Implement `/api/elements/{id}/properties/` endpoint
- Query property_sets table
- Join with materials and systems

**Success Criteria**:
- [ ] Properties display on selection
- [ ] Psets are collapsible
- [ ] Shows materials and systems
- [ ] Loading states work

### Phase 5D: Model Tree (60 min)

**Goal**: Hierarchical element tree

**Steps**:
1. Create `src/components/ModelTree.tsx`
2. Create `src/hooks/use-hierarchy.ts` - Fetch hierarchy
3. Implement collapsible tree (Radix UI Collapsible)
4. Add search/filter functionality
5. Sync with 3D selection
6. Click tree → select in 3D

**Backend Work Required**:
- Implement `/api/models/{id}/hierarchy/` endpoint
- Query spatial_hierarchy table
- Build nested JSON structure

**Success Criteria**:
- [ ] Tree shows full hierarchy
- [ ] Collapsible sections work
- [ ] Search filters tree
- [ ] Click → selects in 3D
- [ ] 3D selection → expands tree

### Phase 5E: Toolbar & Polish (45 min)

**Goal**: Essential controls and UX polish

**Steps**:
1. Create `src/components/ViewerToolbar.tsx`
2. Implement zoom-to-fit (calculate bounds, position camera)
3. Add reset camera button
4. Add view mode toggles (wireframe, x-ray)
5. Add loading overlay
6. Test on different screen sizes

**Success Criteria**:
- [ ] Zoom-to-fit works
- [ ] Reset camera works
- [ ] View modes functional
- [ ] Responsive on tablet

---

## Performance Considerations

### Geometry Loading Strategy

**Problem**: 142 elements × ~500 vertices each = 71,000 vertices → May impact performance

**Solutions**:

1. **Pagination** (Immediate)
   - Load elements in batches (50 at a time)
   - Add "Load More" button or infinite scroll
   - React Query handles caching

2. **Instanced Meshes** (Optimization)
   - Identical elements (e.g., doors) can use InstancedMesh
   - Requires backend to detect duplicates

3. **LOD (Level of Detail)** (Advanced)
   - Store simplified geometry in database
   - Switch based on camera distance
   - Requires backend changes

4. **Lazy Loading** (Optimization)
   - Load only visible elements (frustum culling)
   - React Query's enabled flag based on camera view

**Recommendation**: Start with pagination (easy), optimize later if needed

### Three.js Optimization

**Best Practices**:
- Use `BufferGeometry` (not deprecated `Geometry`)
- Reuse materials (don't create new material per element)
- Enable frustum culling (default in Three.js)
- Use `useMemo` for geometry parsing
- Dispose geometries on unmount

```typescript
useEffect(() => {
  return () => {
    geometry.dispose();
    material.dispose();
  };
}, [geometry, material]);
```

---

## Testing Strategy

### Unit Tests

**Utilities**:
- `three-utils.ts` - Test geometry parsing
- `ifc-colors.ts` - Test color mapping

### Integration Tests

**Components**:
- IFCElement renders without errors
- Selection state updates correctly
- Property panel fetches data

### Manual Testing Checklist

**Basic Scene**:
- [ ] Geometry displays correctly
- [ ] Colors match IFC types
- [ ] Camera controls work
- [ ] Performance is smooth (60fps)

**Selection**:
- [ ] Click element → highlights
- [ ] Click background → clears
- [ ] Multiple clicks work
- [ ] Selection persists on re-render

**Property Panel**:
- [ ] Properties load on selection
- [ ] Psets display correctly
- [ ] Materials and systems show
- [ ] Loading states work

**Model Tree**:
- [ ] Hierarchy displays correctly
- [ ] Search filters tree
- [ ] Click → selects in 3D
- [ ] Show/hide toggles work

**Performance**:
- [ ] No lag with 100+ elements
- [ ] Smooth camera movement
- [ ] No memory leaks

---

## Dependencies to Add

**Optional (for Phase 5E+)**:
```json
{
  "react-resizable-panels": "^2.0.0",  // Resizable sidebars
  "@react-three/postprocessing": "^2.16.0",  // Outline effect
  "leva": "^0.9.35"  // Three.js debug GUI (dev only)
}
```

---

## Risks & Mitigation

### Risk 1: Backend API Missing

**Risk**: Property endpoint not implemented yet

**Mitigation**:
- Mock data for frontend development
- Continue with basic properties from geometry endpoint
- Backend implementation can happen in parallel

### Risk 2: Performance Issues

**Risk**: Large models (1000+ elements) may be slow

**Mitigation**:
- Start with pagination (50 elements per page)
- Profile with Chrome DevTools Performance tab
- Implement optimizations only if needed (YAGNI)

### Risk 3: Complex Three.js Setup

**Risk**: R3F learning curve may slow development

**Mitigation**:
- Follow official examples from @react-three/fiber docs
- Use @react-three/drei helpers (reduces boilerplate)
- Fallback: Streamlit prototype first (per CLAUDE.md)

---

## Success Metrics

**Minimum Viable Viewer** (MVP):
- ✅ Geometry displays in 3D
- ✅ Can orbit/pan/zoom
- ✅ Elements colored by type
- ✅ Click element → shows basic properties

**Ideal Viewer**:
- ✅ MVP complete
- ✅ Model tree with hierarchy
- ✅ Full property display with Psets
- ✅ Zoom-to-fit and reset camera
- ✅ Selection sync between tree and 3D

**Production-Ready**:
- ✅ Ideal complete
- ✅ Smooth performance (60fps)
- ✅ Responsive on tablet
- ✅ Loading states and error handling
- ✅ Keyboard shortcuts

---

## Timeline Estimate

**Optimistic**: 3 hours (if APIs exist, no blockers)
**Realistic**: 4 hours (minor debugging, API mocking)
**Pessimistic**: 6 hours (backend API implementation needed)

---

## Alternatives Considered

### Option 1: Streamlit Prototype First

**Pros**:
- Faster iteration
- Easier debugging
- Can use Plotly 3D
- Validates data format

**Cons**:
- Not production-ready
- Duplicate effort (Streamlit → React)
- Less interactive than Three.js

**Decision**: Start with React Three Fiber (dependencies already installed)

### Option 2: Use IFC.js Library

**Pros**:
- Purpose-built for IFC files
- Handles IFC parsing in browser
- Advanced BIM features (clipping planes, measurements)

**Cons**:
- Large bundle size (~500KB)
- We already extract geometry server-side
- Overkill for our use case

**Decision**: Stick with React Three Fiber + custom geometry

### Option 3: Use Potree for Point Clouds

**Pros**:
- Handles massive point clouds
- Octree-based LOD

**Cons**:
- We have mesh data, not point clouds
- Different rendering approach
- Not React-friendly

**Decision**: Not applicable for mesh geometry

---

## Documentation to Update

**After Session 005**:
1. Update `frontend/COMPONENTS.md` - Add Viewer3D, IFCElement, ModelTree, PropertyPanel
2. Update `frontend/README.md` - Add Three.js section
3. Create `frontend/docs/VIEWER.md` - Complete viewer documentation
4. Update `session-005.md` worklog
5. Update `current.md` TODO list

---

## Next Session (006): Graph Visualization

**Prerequisites**: Viewer complete

**Goals**:
- Implement react-force-graph-3d
- Fetch graph edges from API
- Node coloring by IFC type
- Click node → select in 3D viewer
- Relationship filtering

---

**Created**: 2025-10-12
**Status**: Planning Complete
**Estimated Duration**: 3-4 hours
**Priority**: High (blocks other features)
**Dependencies**: Backend APIs for hierarchy and properties
