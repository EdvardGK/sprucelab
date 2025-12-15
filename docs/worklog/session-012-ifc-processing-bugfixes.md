# Session 012: IFC Processing Bug Fixes

**Date**: 2025-10-20
**Status**: Bugs identified and fixed, migration pending

---

## Issues Identified

### 🔴 CRITICAL: NameError in Property Extraction (services.py:774)

**Problem**: Variable `prop_name` used in exception handler before being defined, causing `NameError` and transaction rollback.

**Location**: `backend/apps/models/services.py:756-779`

**Root Cause**:
```python
for prop in property_set.HasProperties:
    try:
        if prop.is_a('IfcPropertySingleValue'):
            prop_name = prop.Name  # Line 758
            # ... processing
    except Exception as e:
        errors.append({
            'message': f"Failed to extract property '{prop_name}' ..."  # NameError if line 758 fails!
        })
```

If `prop.Name` throws an exception, `prop_name` is never defined, causing `NameError` in the exception handler.

**Fix Applied**: Initialize `prop_name = '<unknown>'` before the try block (line 756).

**Impact**: This was likely causing IFC uploads to fail during property extraction stage.

---

### 🟡 Schema Design Issue: Material.material_guid

**Problem**: Material model had incorrect unique constraint and field usage.

**Issues**:
1. `material_guid` was nullable but used in unique constraint `['model', 'material_guid']`
2. Code used `get_or_create()` with `name` field, not `material_guid`
3. `material_guid` was never populated (always NULL)
4. IFC specification confirms: **IfcMaterial does NOT have GlobalId** (doesn't inherit from IfcRoot)

**Research**:
- Created test script: `standalone_test_scripts/test_material_globalid.py`
- Verified via buildingSMART IFC4x3 docs: IfcMaterial inherits from IfcMaterialDefinition, not IfcRoot
- IfcMaterial has: Name (required), Description (optional), Category (optional)
- No GlobalId attribute exists

**Fix Applied**:
1. Updated `extract_materials()` to use IFC step ID: `material_guid = str(material.id())`
2. Updated `Material` model: `material_guid = models.CharField(max_length=50)` (required, no null/blank)
3. Updated `get_or_create()` to use `material_guid` for lookup (proper unique constraint usage)
4. Added documentation comments explaining step ID usage

**Migration Required**: Yes - change `material_guid` from nullable to required

---

### 🟢 Code Cleanup: Unused material_map

**Problem**: `material_map = {}` was created but never used in `extract_materials()`

**Fix Applied**: Removed dead code

---

## Files Modified

1. **backend/apps/models/services.py**
   - Fixed NameError in property extraction (line 756)
   - Fixed material extraction to use step ID (lines 518-556)
   - Removed unused `material_map` variable

2. **backend/apps/entities/models.py**
   - Updated `Material.material_guid` field definition (line 134)
   - Added documentation about step ID usage (lines 129-130)

---

## Testing Performed

1. **Material GlobalId Test**
   - Script: `standalone_test_scripts/test_material_globalid.py`
   - Result: Confirmed IfcMaterial has NO GlobalId attribute
   - Verified IFC step ID is available via `material.id()`

---

## Migration Instructions

**IMPORTANT**: Before testing uploads, run the migration:

```powershell
cd backend
conda activate sprucelab
python manage.py makemigrations entities -n material_guid_step_id
python manage.py migrate
```

This will:
- Change `material_guid` from `nullable` to `NOT NULL`
- Increase `max_length` from 22 to 50 (to accommodate step IDs)

**Note**: If you have existing Material records with NULL `material_guid`, the migration will fail. You'll need to either:
- Delete existing materials: `Material.objects.all().delete()`
- Or manually set step IDs for existing materials

---

## Expected Behavior After Fixes

1. **Property Extraction**: No more NameError crashes - errors will be properly logged with `'<unknown>'` as property name if `prop.Name` fails

2. **Material Extraction**: Materials will be uniquely identified by IFC step ID within each model

3. **Upload Success**: IFC files should process successfully through all stages

---

## Next Steps

1. ✅ Run migration (see instructions above)
2. ⏳ Test IFC upload with sample file
3. ⏳ Verify processing report shows success
4. ⏳ Check that materials, properties, and geometry are extracted correctly

---

## Technical Notes

### IFC Material Identification

IfcMaterial entities are "resource" entities, not "rooted" entities:
- **Rooted entities** (IfcRoot subclasses): Have GlobalId (22-char UUID-like string)
- **Resource entities** (e.g., IfcMaterial): No GlobalId, identified by Name

**Our Solution**: Use IFC step ID (integer) as unique identifier within a file
- Step ID is stable within a file
- Format: `"123"`, `"456"`, etc. (stored as string in material_guid)
- Unique constraint: `(model_id, material_guid)` ensures no duplicates per model

---

**Files Backed Up**:
- `versions/services_20251020_*.py`
- `versions/entities_models_20251020_*.py`

**Last Updated**: 2025-10-20 (Session 012)
