# Session: Type Dashboard Implementation (MVP Priority #1)

## Summary

Completed MVP Priority #1: Type Dashboard implementation with health scores, progress tracking, and two-level unit system for material inventory.

## Changes

### Backend - Data Model Enhancements

**Modified:** `backend/apps/entities/models.py`
- Added `TYPE_CATEGORY_CHOICES` to TypeMapping (generic/specific/product)
- Added `type_category` field for early-stage vs detailed type classification
- Enhanced `TypeDefinitionLayer` with two-level unit system:
  - `ns3457_code` / `ns3457_name` - NS3457-8 material classification
  - `quantity_per_unit` - Recipe ratio (amount per 1 type unit)
  - `material_unit` - Material measurement unit (m², m, m³, kg, pcs)
  - Made `thickness_mm` optional (for sandwich visualization)

**Created:** `backend/apps/entities/migrations/0021_add_material_inventory_fields.py`
- Migration for all new fields

**Modified:** `backend/apps/entities/serializers.py`
- Updated `TypeDefinitionLayerSerializer` with new fields
- Updated `TypeMappingSerializer` with `type_category`

**Modified:** `backend/apps/entities/views.py`
- Added `dashboard_metrics` action to `IFCTypeViewSet`
- Endpoint: `GET /api/entities/types/dashboard-metrics/?project_id={id}`
- Health score formula: 40% classification + 20% unit + 40% materials
- Returns project summary, per-model metrics, and by-discipline aggregation

### Frontend - Dashboard Components

**Created:** `frontend/src/components/features/warehouse/HealthScoreRing.tsx`
- Circular health score indicator with color coding (green/yellow/red)
- `HealthStatusDot` component for compact status display

**Created:** `frontend/src/components/features/warehouse/ModelHealthCard.tsx`
- Per-model health card with status dot, progress bar
- `ModelHealthGrid` for responsive grid layout
- Auto-extracts discipline from model filename

**Created:** `frontend/src/components/features/warehouse/TypeDashboard.tsx`
- Main dashboard component with:
  - Health score ring
  - Summary stats (mapped/pending/review/total)
  - Progress breakdown with stacked bar
  - Completeness metrics (classification/units/materials)
  - Model health grid with click-to-navigate

**Modified:** `frontend/src/hooks/use-warehouse.ts`
- Added `DashboardMetrics`, `ModelHealthMetrics`, `DisciplineMetrics` types
- Updated `TypeDefinitionLayer` interface with new fields
- Added `type_category` to `TypeMapping` interface
- Added `warehouseKeys.dashboardMetrics` query key
- Added `useDashboardMetrics` hook with 30s stale time

**Modified:** `frontend/src/pages/BIMWorkbench.tsx`
- Added 'dashboard' to ViewId type
- Changed default view from 'types' to 'dashboard'
- Added `handleModelSelect` to navigate to type list when clicking model card

**Modified:** `frontend/src/components/features/warehouse/MaterialLayerEditor.tsx`
- Added two-row layout for layer editing
- Row 1: Order, Material name, Quantity, Unit, Remove
- Row 2: NS3457 code, Thickness (optional), EPD ID
- Unit dropdown with m²/m/m³/kg/pcs options

### i18n Translations

**Modified:** `frontend/src/i18n/locales/en.json` & `nb.json`
- Added `dashboard.*` translations (healthScore, mapped, pending, etc.)
- Added `warehouse.layers.*` translations for material layer editor

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Health score formula | 40% classification + 20% units + 40% materials |
| Default view | Dashboard (not type list) |
| Material layer layout | Two-row design for better UX |
| Unit system | Two-level: type unit + material recipe ratio |
| Thickness field | Optional (for sandwich view only) |

## Health Score Formula

```python
classification_score = (types_with_ns3451 / total_types) * 100
unit_score = (types_with_unit / total_types) * 100
material_score = (types_with_layers / total_types) * 100

health_score = (classification_score * 0.4) + (unit_score * 0.2) + (material_score * 0.4)

status = "healthy" if health_score >= 80 else "warning" if health_score >= 50 else "critical"
```

## Two-Level Unit System

**Component (Parent Type):**
- Measured in `representative_unit` (m², m, pcs, m³)
- Example: "Concrete Inner Wall 250mm" measured in m²

**Inventory (Material Layers):**
- Each material has `quantity_per_unit` (recipe ratio)
- Each material has its own `material_unit`
- Example: 0.25 m³ concrete per 1 m² of wall

## Verification

- [x] Django migrations run successfully
- [x] Django system check passes
- [x] Frontend build compiles without errors
- [x] TypeScript types aligned between frontend/backend

## Next Steps

1. Test dashboard with real project data
2. Implement Verification Engine (MVP Priority #2)
3. Build Sandwich View component (MVP Priority #3)

## Files Changed

| File | Action |
|------|--------|
| `backend/apps/entities/models.py` | Modified |
| `backend/apps/entities/serializers.py` | Modified |
| `backend/apps/entities/views.py` | Modified |
| `backend/apps/entities/migrations/0021_*.py` | Created |
| `frontend/src/hooks/use-warehouse.ts` | Modified |
| `frontend/src/pages/BIMWorkbench.tsx` | Modified |
| `frontend/src/components/features/warehouse/HealthScoreRing.tsx` | Created |
| `frontend/src/components/features/warehouse/ModelHealthCard.tsx` | Created |
| `frontend/src/components/features/warehouse/TypeDashboard.tsx` | Created |
| `frontend/src/components/features/warehouse/MaterialLayerEditor.tsx` | Modified |
| `frontend/src/i18n/locales/en.json` | Modified |
| `frontend/src/i18n/locales/nb.json` | Modified |
