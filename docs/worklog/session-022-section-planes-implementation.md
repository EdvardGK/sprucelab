# Session 022 - Federated Viewer Section Planes

**Date**: 2024-12-14
**Status**: Implementation complete, UNTESTED
**Focus**: Adding section plane functionality to the federated viewer

---

## Objective

Implement section/clipping planes for the federated viewer to allow users to cut through models and see internal structure. This is essential for BIM coordination workflows.

---

## Requirements (from user)

1. **Multiple section planes** - Up to 4 simultaneous planes
2. **Creation method** - Right-click on surface → create plane perpendicular to that surface's normal
3. **Manipulation** - Ctrl+scroll to push/pull the active plane
4. **Visual feedback** - Color-coded planes (red, green, blue, yellow)
5. **Deletion** - Delete individual planes or clear all
6. **Element filtering** - Wire up existing filter UI (deferred to next session)

---

## Implementation Summary

### New Files Created

| File | Purpose |
|------|---------|
| `frontend/src/components/ui/context-menu.tsx` | shadcn/radix context menu component |
| `frontend/src/hooks/useSectionPlanes.ts` | Hook wrapping ThatOpen's `OBC.Clipper` component |
| `frontend/src/components/features/viewer/ViewerContextMenu.tsx` | Custom right-click menu (not using radix controlled mode) |
| `frontend/src/components/features/viewer/SectionPlanesPanel.tsx` | UI panel showing active planes with controls |

### Modified Files

| File | Changes |
|------|---------|
| `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` | Added section planes hook, context menu, keyboard/mouse handlers |
| `frontend/src/pages/FederatedViewer.tsx` | Integrated SectionPlanesPanel in right sidebar |
| `frontend/package.json` | Added `@radix-ui/react-context-menu` dependency |

---

## Technical Approach

### Section Planes via ThatOpen Clipper

Used ThatOpen's built-in `OBC.Clipper` component (in `@thatopen/components`, not `components-front`):

```typescript
const clipper = components.get(OBC.Clipper);
clipper.enabled = true;

// Create plane from surface normal and point
const plane = clipper.createFromNormalAndCoplanarPoint(world, normal, point);
```

### Surface Normal Detection

On right-click, raycast to find intersection and extract world-space normal:

```typescript
const raycasters = components.get(OBC.Raycasters);
const raycaster = raycasters.get(world);
const result = raycaster.castRay(undefined, new THREE.Vector2(x, y));

if (result?.face) {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(result.object.matrixWorld);
  const worldNormal = result.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  worldNormal.negate(); // Negate so plane clips toward camera
}
```

### Ctrl+Scroll Plane Movement

```typescript
container.addEventListener('wheel', (e) => {
  if (!e.ctrlKey || !activePlaneId) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.5 : 0.5; // meters
  sectionPlanes.movePlane(activePlaneId, delta);
}, { passive: false });
```

### Keyboard Shortcuts

- `Delete` / `Backspace`: Remove active section plane
- `Escape`: Deselect active plane
- `1-4`: Quick-select planes by number

---

## Architecture Decisions

### Why custom context menu instead of radix controlled mode?

Radix's `ContextMenu` doesn't support controlled `open` state like `Dialog` does. Rather than fighting the API, implemented a simple custom menu that renders at the click position when triggered.

### Why section planes state in UnifiedBIMViewer?

The `useSectionPlanes` hook needs access to ThatOpen's `components` and `world` refs which are internal to `UnifiedBIMViewer`. State is lifted to `FederatedViewer` via the `onSectionPlanesChange` callback for display in the panel.

### Known limitation: Panel delete buttons

The `SectionPlanesPanel` in `FederatedViewer` can display planes but its delete/clear buttons won't directly call the viewer's functions. For now, users should use:
- Keyboard shortcuts (Delete key)
- The viewer's internal mechanisms

This could be fixed with a ref-based imperative API if needed.

---

## What's NOT Done

1. **Element type filtering** - UI exists, filter state exists, but actual hiding via ThatOpen's `Classifier`/`Hider` is not wired up
2. **Testing** - No manual testing performed
3. **Panel-to-viewer communication** - Delete buttons in SectionPlanesPanel don't work
4. **IFC type in context menu** - "Hide all IfcWall" etc. shows but doesn't work yet

---

## Files to Reference

- Plan document: `/home/edkjo/.claude/plans/fluttering-inventing-floyd.md`
- Hook: `frontend/src/hooks/useSectionPlanes.ts`
- Main viewer changes: `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`

---

## Next Session TODO

1. **Test section planes** - Load a model, right-click, verify planes work
2. **Fix panel delete buttons** - Either expose ref API or use different communication pattern
3. **Wire up element filtering** - Use ThatOpen's Classifier/Hider to show/hide by IFC type
4. **Dynamic filter list** - Populate filter checkboxes from actual model types instead of hardcoded list

---

## Build Status

```
✓ TypeScript compilation: PASSED
✓ Vite build: PASSED (13.74s)
✓ Bundle size: 6.64 MB (expected for BIM viewer with Three.js)
```
