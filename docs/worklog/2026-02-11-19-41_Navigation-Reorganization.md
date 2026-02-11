# Session: Navigation Reorganization - Libraries & Dashboards

## Summary
Reorganized navigation to separate read-only data views from editing workbenches. Moved Type Library and Material Library from Workbench to a new "Data" section in the sidebar. Consolidated dashboards into a single tabbed interface with Overview, Project, and BIM tabs.

## Changes
- `frontend/src/components/Layout/Sidebar.tsx` - Renamed "Files" to "Data", added Type/Material Library links, simplified Workbench sub-nav
- `frontend/src/App.tsx` - Added routes for `/projects/:id/type-library` and `/projects/:id/material-library`
- `frontend/src/pages/ProjectTypeLibrary.tsx` - New page wrapping TypeLibraryView
- `frontend/src/pages/ProjectMaterialLibrary.tsx` - New placeholder page
- `frontend/src/pages/ProjectDashboard.tsx` - Added tabbed interface (Overview/Project/BIM), integrated TypeDashboard into BIM tab
- `frontend/src/pages/BIMWorkbench.tsx` - Removed dashboard/library views, default to classify view
- `frontend/src/i18n/locales/en.json` & `nb.json` - Added new translation keys for nav, dashboard tabs, and stats

## Next
- Test navigation flow in browser
- Consider adding "Open in Workbench" button from Type Library view
- Material Library implementation (currently placeholder)

## Notes
- Design rationale: Libraries are read-only browsing views, Workbench is for editing/classification
- TypeDashboard (health scores, mapping progress) now accessible via Dashboard > BIM tab
- Overview tab provides quick navigation cards to Models, Viewer, Workbench
