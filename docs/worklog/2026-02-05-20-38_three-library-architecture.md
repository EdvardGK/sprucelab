# Session: Three-Library Architecture Implementation

## Summary

Implemented the Three-Library Architecture for material and product management. Created MaterialLibrary (41 Enova EPD materials), ProductComposition, enhanced ProductLibrary, and added full API endpoints with ViewSets.

## Changes

### Models & Migrations
- `MaterialLibrary` model - Global canonical materials with EPD/Reduzer integration
- `ProductComposition` model - Links products to constituent materials
- Enhanced `ProductLibrary` with `is_composite`, `dimensions`, `specifications`, `material_category`
- Added FK links from `TypeDefinitionLayer` and `Material` to `MaterialLibrary`
- Migration: `0022_add_material_product_libraries.py`

### Seed Data (Config-Based)
- `apps/entities/data/enova_materials.json` - 41 materials with categories, GWP, density, Reduzer IDs
- `load_material_library` management command (reads from JSON, not hardcoded)

### API Layer
- `MaterialLibraryViewSet` - CRUD + categories/summary actions
- `ProductLibraryViewSet` - CRUD + compositions/set-compositions/summary actions
- `ProductCompositionViewSet` - CRUD for product-material links
- Serializers: Full + List variants for all new models
- Routes registered in `urls.py`

### Files Modified
- `backend/apps/entities/models.py` - New models
- `backend/apps/entities/serializers.py` - New serializers
- `backend/apps/entities/views.py` - New ViewSets
- `backend/apps/entities/urls.py` - New routes
- `backend/apps/entities/data/enova_materials.json` - NEW
- `backend/apps/entities/management/commands/load_material_library.py` - NEW

## Architecture

```
┌──────────────────────────────────────────────┐
│           TYPE LIBRARY (Anchor)              │
│     IFCType + TypeBank = Single truth        │
└──────────────────────────────────────────────┘
              ↓                     ↓
┌─────────────────────┐   ┌──────────────────────┐
│  PRODUCT LIBRARY    │   │  MATERIAL LIBRARY    │
│  Discrete (pcs)     │   │  Quantity (m³/m²/kg) │
│  Windows, doors     │   │  Concrete, steel     │
└─────────────────────┘   └──────────────────────┘
           ↓ ProductComposition ↑
```

## Next Steps

1. **Auto-normalization service** - Match IFC material names to MaterialLibrary categories during parsing
2. **TypeDefinitionLayer enhancement** - Link material layers to MaterialLibrary entries (FK already exists)
3. **Frontend: Material Library browser** - UI for viewing/editing global materials
4. **Frontend: Product composition editor** - Define materials in composite products
5. **LCA export enhancement** - Use MaterialLibrary GWP data for Reduzer export
6. **Validation integration** - Verify types have valid material compositions

## Notes

- User feedback: Avoid hardcoding - materials stored in JSON config file
- 41 Enova EPD categories aligned with Norwegian LCA standard
- Each material has: category, unit, density, GWP, Reduzer ProductID
- ProductLibrary supports both homogeneous (single material) and composite (multiple) products
