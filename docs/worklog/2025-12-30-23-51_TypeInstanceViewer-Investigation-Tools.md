# Session: Add Investigation Tools to TypeInstanceViewer

## Summary
Added full investigation capabilities to TypeInstanceViewer (warehouse type mapper) to match UnifiedBIMViewer. Users can now research unfamiliar IFC types in fullscreen mode with properties panel, section planes, and highlighting.

## Changes
- `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx`
  - Added section planes via `useSectionPlanes` hook
  - Added right-click context menu for section plane creation
  - Added keyboard shortcuts (Delete, 1-4, F, Q, E/R) for plane manipulation
  - Added Shift+Scroll for fine plane movement
  - Added FastAPI IFC preloading for property queries
  - Added click-to-select with property fetching via `getElementByExpressId`
  - Added ElementPropertiesPanel overlay on right side
  - Added section plane count indicator

## Features Added
| Feature | Implementation |
|---------|----------------|
| Properties Panel | Right-side overlay showing IFC properties on selection |
| Section Planes | Up to 4 color-coded cutting planes via context menu |
| Keyboard Controls | Delete, Escape, 1-4, F, Q, E/R for plane manipulation |
| Mouse Controls | Right-click context menu, Shift+Scroll for plane movement |
| FastAPI Integration | Pre-loads IFC for property queries |

## Next
- Test with real IFC files in warehouse fullscreen mode
- Consider adding type filtering (Hide/Isolate) if needed

## Notes
- Reused existing modular components (useSectionPlanes, ViewerContextMenu, ElementPropertiesPanel)
- FastAPI preload is async and non-blocking for fragments path
- Properties panel shows same data as main viewer
