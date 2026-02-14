# Session: Dashboard Layout Fix and Expand Overlays

## Summary
Fixed the AnalysisDashboard (ModelWorkspace Overview tab) layout which was compressed and ugly compared to the HTML bento reference. Removed viewport-height constraints to allow natural scrolling, and added expand buttons with overlay panels on key visualization cards.

## Changes
- `frontend/src/pages/ModelWorkspace.tsx`:
  - **Layout**: Removed `h-full` + flex percentage constraints from AnalysisDashboard. Content now flows naturally with `space-y` gaps and `max-w-[1440px] mx-auto` container (matching bento reference). Scrolling is now accepted.
  - **Min-heights**: Storeys card `min-h-[180px]`, treemap/donut row `min-h-[250px]` for readable visualizations.
  - **CardHeader component**: Reusable header with optional expand button (Maximize2 icon, forest-themed).
  - **DashboardOverlay component**: Fixed overlay with backdrop blur, 900px max width, close on backdrop click/X/Escape.
  - **Expand buttons on**: Quality, Storeys, Element Distribution, Geometry cards.
  - **Quality overlay**: Shows all checks including untyped/proxy counts in larger readable format.
  - **Geometry overlay**: Shows GeometryDonut with `showAll` prop (no legend truncation at 6).

## Next
- Spaces and QTO pages are still nav-only placeholders
- Verification and IFC Editing workbench views need implementation
- Consider adding type conflict visualization (from bento reference)

## Notes
- Reference HTML: `~/dev/resources/ifc-toolkit/dashboard-bento.html`
- The CLAUDE.md says dashboards must fit viewport without scroll, but user explicitly overrode this for the model dashboard - scrolling is acceptable here
