# Session: Type Analysis Dashboard & Color System Update

## Summary
Built end-to-end type analysis pipeline from IFC toolkit through Django backend to React frontend. Added 4 analysis database tables, ingestion service, API endpoints, and a bento-layout analysis dashboard in the Model Overview tab. Updated the entire color system from "Blue Glass" to Mindful Palettes No. 160.

## Changes

### Backend (Django)
- **Models** (`entities/models.py`): Added `ModelAnalysis`, `AnalysisStorey`, `AnalysisType`, `AnalysisTypeStorey` — star schema for type-first analysis data
- **Migration** (`0029`): Created 4 tables with indexes, applied to Supabase
- **Serializers** (`entities/serializers.py`): 4 nested serializers, `ModelAnalysisSerializer` includes storeys + types with storey_distribution
- **Views** (`entities/views.py`): `ModelAnalysisViewSet` — read-only with prefetch, `run_analysis` POST action
- **URLs** (`entities/urls.py`): Registered `/api/model-analysis/`
- **Ingestion** (`entities/services/analysis_ingestion.py`): New file — `ingest_type_analysis()` atomic bulk-create from type_analysis() output
- **Seeded test data**: ST28_RIB analysis into model A4_RIB_B

### Frontend (React)
- **Types** (`lib/api-types.ts`): `ModelAnalysis`, `AnalysisStorey`, `AnalysisTypeRecord`, `AnalysisTypeStoreyDist` interfaces
- **Hook** (`hooks/use-model-analysis.ts`): New file — `useModelAnalysis()` query + `useRunAnalysis()` mutation
- **Dashboard** (`pages/ModelWorkspace.tsx`): Replaced placeholder OverviewTab with full analysis dashboard:
  - KPIs (types, products, storeys, spaces)
  - Quality checks card (GUIDs, IsExternal, LoadBearing, FireRating, empty types)
  - Sub-KPIs with warning colors
  - Storey bar chart (sorted by elevation, gradient bars)
  - Element distribution treemap (squarified algorithm)
  - Geometry donut chart (SVG)
  - Context / Units / Coordinates info cards
  - Gradient header border, card accent borders per section

### Color System — Mindful Palettes No. 160
- **design-tokens.ts**: Added `palette` object (silver, lavender, lime, forest, navy). Changed text/border tokens from static HSL to CSS-variable-based (`hsl(var(--text-primary))`) for dark/light mode responsiveness. Updated status colors (forest=success, orange=warning).
- **globals.css**: Rewrote `:root` (light) and `.dark` (dark) with palette-derived values. Dark mode matches dashboard aesthetic (Navy bg, Silver text, Forest primary). Added `--grad-01` through `--grad-05` CSS variables. Added `.grad-*`, `.card-accent-*`, `.border-gradient-header` utility classes. Updated glass effects and scrollbar colors for both modes.
- **tailwind.config.ts**: Added `silver`, `lavender`, `lime`, `forest`, `navy` as named Tailwind colors.

### IFC Toolkit
- **analyze.py**: Added `type_analysis()` function (~250 lines) — type-first analysis producing per-type records with quality tallies, geometry stats, storey distributions. Updated CLI with `--types` flag.

## Key Decisions
- Text/border tokens are now CSS-variable-based — they respond to dark/light mode toggle
- Dark mode is the "hero" mode, matching the IFC analysis dashboard aesthetic
- Light mode derived from same palette: Silver/Lavender backgrounds, Navy text
- Card accent borders: Lime (quality), Forest (data cards), Lavender (info cards)
- Header uses gradient border: Lime → Forest → Navy
- Status colors aligned: Forest=success, Orange=warning, Red=error

## Next
- Enable dark mode toggle in the UI (currently class-based, needs toggle)
- Update data-grid.css to use palette colors (currently independent scoped theme)
- Port dashboard cross-filtering (treemap click → filter types)
- Run analysis on more models, test the "Run Analysis" button flow
