# Session: Type Library Viewer Layout Fix + Sprint Continuation

## Summary
Fixed the 3D viewer layout in the per-project Type Library view (`/projects/:id/type-library`). The TypeInstanceViewer was a narrow full-height strip (`w-[400px]`) which gave poor 3D viewing. Changed to a CSS grid layout where the viewer gets 2/3 of available width (min 420px), giving it proper proportions for 3D content. Also identified that the viewer's type filtering may not be working (shows full model regardless of selected type).

## Changes
- `frontend/src/components/features/warehouse/library/TypeLibraryView.tsx` - Changed main content from `flex` with fixed `w-[400px]` viewer to `grid grid-cols-[1fr_minmax(420px,_2fr)]`. Viewer now gets proportional space (~800-900px on 1920px screen) instead of a fixed narrow strip.

## Technical Details
**Layout before**: `flex` with left panel `flex-1` + right panel `w-[400px] flex-shrink-0`
**Layout after**: `grid grid-cols-[1fr_minmax(420px,_2fr)]` - type list gets 1fr, viewer gets 2fr (min 420px)

The viewer component (`TypeInstanceViewer`) receives `typeId` prop and uses `useTypeInstances(typeId)` to fetch instance GUIDs, then uses ThatOpen's `Hider` component to show only matching fragments. The user reported filtering isn't working - the viewer shows the full model. This is likely an issue in the fragment visibility matching logic inside `TypeInstanceViewer.tsx` (1,048 lines), not a dev-only issue.

**Codebase navigation notes discovered:**
- `TypeLibraryPage` (`/type-library`) = global TypeBank view, uses `TypeDetailPanel` (no 3D)
- `ProjectTypeLibrary` (`/projects/:id/type-library`) = per-project view, uses `TypeLibraryView` which embeds `TypeInstanceViewer` (3D)
- `TypeLibraryPanel` = orphaned component (exported but never imported anywhere)

## Next
- Investigate TypeInstanceViewer filtering bug (type selection doesn't filter 3D view)
- Finish B1: Wire TypeLibraryPage dead export buttons
- Start B2: Verification Engine v1

## Notes
- TypeLibraryPanel.tsx is dead code (not imported anywhere) - can be cleaned up
- The viewer filtering issue needs investigation in TypeInstanceViewer's fragment hider logic (lines ~100-120 for type change cleanup, and wherever fragments are filtered by GUID matching)
