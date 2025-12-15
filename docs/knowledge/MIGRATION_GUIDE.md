# Migration Guide: Layered Architecture Refactoring

## Overview
This guide covers migrating from monolithic IFC processing to a layered architecture (Parse → Extract → Validate).

## Phase 1: Database Migration

### Step 1: Generate Migration
```bash
cd backend
conda activate your-env-name
python manage.py makemigrations models entities -n "add_layered_status_tracking"
```

Expected changes:
- **Model**: Add `parsing_status`, `geometry_status`, `validation_status` fields
- **IFCEntity**: Add `geometry_status` field
- **Geometry**: Add `vertex_count`, `triangle_count`, `bbox_*` fields, `extracted_at`, `updated_at`

### Step 2: Review Migration
Check the generated migration file in:
- `backend/apps/models/migrations/XXXX_add_layered_status_tracking.py`
- `backend/apps/entities/migrations/XXXX_add_layered_status_tracking.py`

### Step 3: Run Migration
```bash
python manage.py migrate
```

### Step 4: Verify Migration
```bash
python manage.py check
```

Expected output: "System check identified no issues"

## Phase 2: Data Backfill (Optional)

If you have existing models, backfill the new status fields:

```bash
python manage.py shell
```

```python
from apps.models.models import Model

# Backfill parsing_status based on legacy status
for model in Model.objects.all():
    if model.status == 'ready':
        model.parsing_status = 'parsed'
        model.geometry_status = 'completed'
        model.validation_status = 'completed'
    elif model.status == 'processing':
        model.parsing_status = 'parsing'
        model.geometry_status = 'pending'
        model.validation_status = 'pending'
    elif model.status == 'error':
        model.parsing_status = 'failed'
        model.geometry_status = 'pending'
        model.validation_status = 'pending'
    else:  # uploading
        model.parsing_status = 'pending'
        model.geometry_status = 'pending'
        model.validation_status = 'pending'

    model.save(update_fields=['parsing_status', 'geometry_status', 'validation_status'])

print("Backfill complete!")
```

## Phase 3: Test Changes

### Test 1: Model Creation
```bash
python manage.py shell
```

```python
from apps.projects.models import Project
from apps.models.models import Model

# Create test model
project = Project.objects.first()
model = Model.objects.create(
    project=project,
    name="Test Layered Model",
    original_filename="test.ifc",
    file_size=1024,
)

print(f"Model created with status:")
print(f"  parsing_status: {model.parsing_status}")
print(f"  geometry_status: {model.geometry_status}")
print(f"  validation_status: {model.validation_status}")
```

Expected output:
```
Model created with status:
  parsing_status: pending
  geometry_status: pending
  validation_status: pending
```

### Test 2: Entity Creation
```python
from apps.entities.models import IFCEntity

entity = IFCEntity.objects.create(
    model=model,
    ifc_guid="0123456789abcdefghijkl",
    ifc_type="IfcWall",
    name="Test Wall",
)

print(f"Entity created with geometry_status: {entity.geometry_status}")
```

Expected output:
```
Entity created with geometry_status: pending
```

## Next Steps

After successful migration:
1. ✅ Database schema updated
2. ⏭️ Create `services/parse.py` (Layer 1 metadata extraction)
3. ⏭️ Create `services/geometry.py` (Layer 2 geometry extraction)
4. ⏭️ Update `tasks.py` to use staged processing
5. ⏭️ Update API serializers

## Rollback (if needed)

If issues occur:
```bash
# Check migration history
python manage.py showmigrations models entities

# Rollback one migration
python manage.py migrate models XXXX_previous_migration
python manage.py migrate entities XXXX_previous_migration
```

## Questions?
See `/project-management/worklog/` for session notes or check CLAUDE.md
