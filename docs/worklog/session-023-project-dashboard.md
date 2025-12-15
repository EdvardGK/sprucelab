# Session 023 - Project Dashboard & Dynamic Sizing

**Date**: 2025-12-14

## Summary

Implemented a Project Dashboard page with comprehensive statistics and updated CLAUDE.md with dynamic dashboard sizing guidelines.

## Work Completed

### 1. Project Dashboard (`/projects/:id`)

Created a new dashboard page showing:
- **KPI Cards**: Models, Elements, Types (mapped/total), Materials (mapped/total)
- **Top Types**: Bar chart of top 5 types by quantity
- **Top Materials**: Bar chart of top 5 materials by element count
- **NS-3451 Mapping**: Coverage percentage with status breakdown (Mapped, Pending, Review)
- **MMI Distribution**: Donut chart placeholder (no data yet)
- **Project Basepoint**: GIS coordinates card (X, Y, Z, CRS)

### 2. Route Updates

- `/projects/:id` now shows ProjectDashboard (was ProjectDetail)
- `/projects/:id/models` shows ProjectModels (renamed from ProjectDetail)
- Updated Sidebar navigation with Dashboard and Models links

### 3. Backend Statistics API

Added `GET /api/projects/{id}/statistics/` endpoint returning:
```json
{
  "model_count": 1,
  "element_count": 3719,
  "type_count": 1145,
  "type_mapped_count": 3,
  "material_count": 60,
  "material_mapped_count": 0,
  "top_types": [...],
  "top_materials": [...],
  "ns3451_coverage": {...},
  "mmi_distribution": [],
  "basepoint": null
}
```

**Known Issue**: API is slow (15-20s) due to N+1 queries in `_get_top_types()` - iterates over all types making individual queries. Needs optimization.

### 4. CLAUDE.md Dashboard Guidelines

Added comprehensive dashboard layout rules:
- Container: `h-[calc(100vh-X)]`, `overflow-hidden`
- Grid: `flex-1` with `min-h-0`, CSS Grid with `fr` units
- Cards: `flex flex-col overflow-hidden`, `flex-1 overflow-y-auto min-h-0`
- Content sizing with `clamp()` for dynamic scaling (documented but simplified in final implementation due to Tremor component limitations)

### 5. MMI Table Maker

Added to BIM Workbench BEP tab:
- Template selection (MMI-veileder 2.0, Simplified, Custom)
- Editable table with level, color, names, descriptions
- Color scale preview
- Export to JSON

## Files Modified

### Frontend
- `frontend/src/pages/ProjectDashboard.tsx` - NEW
- `frontend/src/pages/ProjectModels.tsx` - Renamed from ProjectDetail.tsx
- `frontend/src/hooks/use-project-stats.ts` - NEW (5min cache)
- `frontend/src/lib/api-types.ts` - Added ProjectStatistics types
- `frontend/src/App.tsx` - Updated routes
- `frontend/src/components/Layout/Sidebar.tsx` - Added Dashboard nav
- `frontend/src/components/features/bep/MMITableMaker.tsx` - NEW
- `frontend/src/pages/BIMWorkbench.tsx` - Integrated MMI Table Maker
- `frontend/src/i18n/locales/en.json` - Added translations
- `frontend/src/i18n/locales/nb.json` - Added translations
- `frontend/src/pages/Dashboard.tsx` - Minor styling updates

### Backend
- `backend/apps/projects/views.py` - Added statistics endpoint

### Documentation
- `CLAUDE.md` - Added dashboard layout guidelines

## Technical Notes

### Tremor Component Limitations
Tremor components (`Text`, `Title`, `Metric`, `Badge`) have internal styles that override custom Tailwind classes like `text-[clamp(...)]`. Solution: Use native HTML elements (`<p>`, `<span>`, `<h3>`) for text that needs custom sizing.

### Dashboard Performance
- UI renders immediately with "..." placeholders
- Stats cached for 5 minutes (React Query)
- Backend query needs optimization (N+1 problem)

## Next Steps

1. Optimize statistics API query (bulk queries instead of iterating)
2. Add dynamic `clamp()` sizing once Tremor limitations are worked around
3. Populate MMI distribution when BEP data is available
4. Add more dashboard widgets (recent activity, validation status)
