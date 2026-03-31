# Session: Model Dashboard Redesign + Auto-Analysis Trigger

## Summary
Redesigned the AnalysisDashboard layout in ModelWorkspace from 6 stacked rows to a compact 2-row grid: KPIs on top, then a left column (storeys + treemap/donut + info) beside a square viewer on the right. Also wired up auto-triggering of model analysis on upload completion, so users no longer need to manually click "Run Analysis."

## Changes

### Backend: Auto-analysis on upload
- **NEW** `backend/apps/entities/tasks.py` — Celery task `run_model_analysis_task` that runs `type_analysis()` + `ingest_type_analysis()` on a model's IFC file
- **MODIFIED** `backend/apps/models/views.py` — `process_complete()` callback now triggers analysis via Celery (falls back to threading if Celery unavailable)
- **MODIFIED** `frontend/src/hooks/use-model-analysis.ts` — Added `refetchInterval` that polls every 5s while analysis is null, stops when data arrives

### Frontend: Dashboard layout overhaul
- **MODIFIED** `frontend/src/pages/ModelWorkspace.tsx` — Complete AnalysisDashboard rewrite:
  - Unified 6-column CSS grid (`grid-cols-6 gap-3`) replacing 6 separate row grids
  - Merged KPI + SubKPI into single cards (each shows main value + sub-metric with warn color)
  - Deleted `SubKpiCard` component
  - "Products" renamed to "Instances" — now sums all `instance_count` across types (not just IfcProduct)
  - Added `totalInstances` to `computeAnalysisStats`
  - Viewer: `aspect-square` container, bottom-aligned with left column
  - Treemap + Donut: side-by-side in left column, both `aspect-square`
  - Donut legend moved below chart (horizontal flow wrap)
  - Storeys chart: `minmax(0, 5rem)` name column to prevent wide gaps
  - 3 info cards merged into single `ModelInfoCard` with 3 tight columns (Context | Units | Coords)
  - Removed separate bottom info row

### Layout structure
```
Row 1: [Quality x2 | KPI-Types | KPI-Instances | KPI-Storeys | KPI-Spaces]
Row 2: [Storeys bar chart     ] [                    ]
       [Treemap | Donut       ] [    3D Viewer       ]
       [Info (3-col compact)  ] [    (square)         ]
```

## Technical Details
- The `process_complete` callback is called by FastAPI after IFC processing. Analysis runs as a background Celery task with thread fallback for dev environments without Celery.
- Frontend polling uses react-query's `refetchInterval` callback — returns `5000` when data is null, `false` when data exists.
- Grid system: single `grid-cols-6` container ensures all columns align. Left column (`col-span-3`) uses nested flex + inner `grid-cols-2` for the treemap/donut pair.
- Viewer uses `justify-end` on its column so it bottom-aligns with the info card.

## Next
- Test in browser — verify layout proportions, viewer rendering at square aspect
- Consider if storeys bar chart needs max-height/scroll for models with many storeys
- Iterate on dashboard polish: spacing, proportions, colors
- Wire auto-analysis to the Celery lite task path too (currently only on FastAPI callback)
- ProjectDashboard redesign (aggregate view across models)

## Notes
- All 32 TS build errors are pre-existing in the BEP module (deprioritized), none from this session
- Dashboard design inspiration article saved at `docs/research/dashboard` (PDF without extension)
- The `showAll` prop on `GeometryDonut` still exists for the expanded overlay view
