# Session: Dashboard Drill-Down System + Layout Overhaul

## Summary
Built a complete drill-down modal system for both the model workspace and project dashboard, making every data card interactive. Rewrote the ProjectDashboard from a pass-through page into an aggregated data dashboard with discipline breakdown, model cards, and classification progress. Added 3D viewer filtering from dashboard clicks (storey, IFC class, quality). Inspired by the skiplum-reports static dashboards which had evolved beyond the React app.

## Changes
- **DrillModal component** (`frontend/src/components/features/drill/DrillModal.tsx`) — Reusable tabbed modal with sortable data tables + CSV export. Built on shadcn Dialog + Tabs.
- **CSV export utility** (`frontend/src/lib/export.ts`) — Browser Blob download with BOM for Excel UTF-8.
- **Treemap shared utility** (`frontend/src/lib/treemap.ts`) — Extracted squarified treemap layout from ModelWorkspace.
- **ModelWorkspace.tsx** — All dashboard cards now drillable (Quality, Types, Instances, Storeys, Treemap tiles, Geometry segments). Clicking also filters the 3D viewer. Viewer header removed, replaced with floating 2D/3D toggle + expand button. GeometryDonut replaced with GeometryBar (stacked horizontal bar + legend). Layout reworked: fixed card heights (Storeys 220px, Treemap 280px), viewer matches via grid row, ModelInfo+GeometryBar in row 3 (3+3 cols). Page scrolls naturally — no viewport locking.
- **ProjectDashboard.tsx** — Full rewrite. Overview tab: 4 drillable KPI cards, discipline breakdown bars, NS3451 coverage, classification progress, model card grid. Models tab: model cards with discipline colors + health bars. BIM tab unchanged.
- **UnifiedBIMViewer.tsx** — Added `storeyFilter` prop. After model load, indexes IFC relations via `IfcRelationsIndexer` and classifies by spatial structure (`Classifier.bySpatialStructure`). Storey filter uses Hider to show/hide by storey FragmentIdMap.
- **All page layouts** — Removed `max-w-7xl` / `max-w-[1440px]` caps from every page. Updated CLAUDE.md with "no max-width caps" rule.
- **i18n** — Added `drill.*` namespace + dashboard keys to both `en.json` and `nb.json`.

## Technical Details
- Studied the skiplum-reports project dashboard (`Ed-Skiplum/skiplum-reports` on GitHub) as the design reference. Key pattern: every number is a "drill target" that opens a tabbed modal with data tables + CSV/XLSX export.
- ThatOpen's `Classifier.bySpatialStructure()` provides storey-to-fragment mapping out of the box, but requires `IfcRelationsIndexer.process()` first. Both are async, so used fire-and-forget `.then()` chain in the sync `finalizeLoadedGroup`.
- The storey filter and type visibility filter share the same Hider but don't conflict because `openDrill()` always sets one and clears the other.
- Vercel preview session persistence: each deploy gets a unique subdomain hash, killing localStorage. Solution: use the stable branch URL `sprucelab-git-dev-skiplum.vercel.app`.
- **Layout lesson**: Went through several iterations of the model workspace grid. Viewport-locking (`h-[calc(100vh-X)]` + `overflow-hidden`) and `flex-1` compression caused treemap/viewer to get squished. Final approach: fixed card heights, internal scroll on overflow, page scrolls naturally. CLAUDE.md updated to enforce this as a rule.

## Next
- **Project Dashboard Phase 2 extras**: Storey coordination matrix (cross-model), Compliance tab (models x requirements), MMI treemap
- **Model Workspace Phase 3**: Score ring, section progress bars (Identity/Units/Types/Spatial/Integrity/Coordinates), issues list with severity
- **Type drill → type workspace link**: When clicking type KPI, drill modal should offer navigation to the type browser/workspace
- **2D floor plans**: Discussed but deferred — symbolic representations (objects as symbols by IFC class) vs geometry extraction. Storey filter in 3D is the immediate win. 2D floor plans tie into the drawings module later.

## Notes
- The skiplum-reports dashboards are auto-generated static HTML with embedded JSON for drill data. They've become the de facto design reference for how Sprucelab dashboards should look and behave.
- User feedback on layout changes: don't rearrange grid proportions when only moving components. The viewer height should match the chart column, not stretch or shrink.
- Stable Vercel branch URL for dev: `sprucelab-git-dev-skiplum.vercel.app` — bookmark this instead of per-commit preview links.
