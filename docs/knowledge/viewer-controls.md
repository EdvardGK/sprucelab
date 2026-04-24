# 3D Viewer Controls (ThatOpen Components)

The BIM viewer uses ThatOpen Components v2.4.11 with Three.js. These controls apply to all viewer instances (UnifiedBIMViewer, TypeInstanceViewer, etc.).

## Mouse Controls

| Action | Effect |
|--------|--------|
| **Left click** | Select element |
| **Left drag** | Rotate camera (orbit) |
| **Right drag** | Pan camera |
| **Scroll wheel** | Zoom in/out |
| **Double-click (left)** | Select + Zoom to element (animated) |
| **Double-click (middle)** | Fit all models to view |
| **Right-click on surface** | Open context menu (section plane options) |

## Selection Behavior

Selection uses drag detection to prevent accidental selections during camera movement:
- `CLICK_THRESHOLD_PX = 5` - Max pixels moved to count as click
- `CLICK_THRESHOLD_MS = 250` - Max milliseconds for a click

## Section Plane Controls

Up to 4 color-coded section planes (red, green, blue, yellow).

**Creating Section Planes:**
- Right-click on any surface -> Context menu -> Add section plane
- Plane orientation: Horizontal, Vertical-X, Vertical-Z, or Parallel to clicked surface

**Keyboard Shortcuts (when section plane is active):**

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete active section plane |
| `Escape` | Deselect active plane |
| `1-4` | Quick-select planes 1-4 |
| Left/Right arrows | Rotate horizontally (around Y axis) |
| Up/Down arrows | Tilt vertically (up/down) |
| `F` | Flip plane direction |
| `Q` | Rotate 90 degrees horizontally |
| `E` | Push plane (clip more, see deeper) |
| `R` | Pull plane (clip less, see more) |
| + `Shift` | 50% finer control for rotation/movement |

**Mouse + Keyboard:**
- `Shift + Scroll` on active plane: Move plane along its normal (distance scales with camera distance)

## Camera Configuration

```typescript
controls.dollySpeed = 1.5;
controls.minDistance = 0.1;  // Allow very close zoom
controls.maxDistance = 2000; // Handle large models
camera.near = 0.01;  // 1cm - allows detail inspection
camera.far = 5000;   // 5km - handles large sites
```

## Zoom-to-Element Logic

When double-clicking or navigating instances:
1. Compute bounding box of selected element(s)
2. Use 2x size multiplier for comfortable viewing
3. Maintain current camera viewing angle
4. Animate transition with `controls.setLookAt(..., true)`

```typescript
const maxDim = Math.max(size.x, size.y, size.z, 2); // Min 2m
const distance = Math.max(maxDim * 2.0, 5);         // At least 5m away
```

## Implementation Files

- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` - Main viewer
- `frontend/src/hooks/useSectionPlanes.ts` - Section plane logic
- `frontend/src/components/features/viewer/ViewerContextMenu.tsx` - Context menu
- `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx` - Instance preview
