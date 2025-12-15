# Developer Quick Reference: IFC Schema Database Architecture

**For**: Developers implementing the consultation recommendations
**See Also**: [session-013-ifc-schema-database-strategy.md](./session-013-ifc-schema-database-strategy.md)
**Last Updated**: 2025-10-25

---

## Quick Start Checklist

### When Adding Schema Version Support

- [ ] Update `ENTITY_TYPE_MAPPINGS` in `schema_mapping.py`
- [ ] Add schema metadata on file open in `parse.py`
- [ ] Test entity type normalization with sample file
- [ ] Update API documentation

### When Adding New Layer

- [ ] Define database models in `apps/entities/models.py`
- [ ] Create extraction service in `apps/entities/services/`
- [ ] Add status field to `Model` (e.g., `layer4_status`)
- [ ] Update `tasks.py` to orchestrate new layer
- [ ] Create API endpoints in `apps/entities/views.py`
- [ ] Add tests in `django-test/`

### When Handling Errors

- [ ] Add error case to `healing.py` if recoverable
- [ ] Log error in `ProcessingReport.errors`
- [ ] Update `IFCValidationReport` if validation issue
- [ ] Test with malformed IFC file

---

## Code Snippets Library

### 1. Schema Version Detection

```python
# In parse.py or tasks.py
import ifcopenshell

ifc_file = ifcopenshell.open(file_path)
schema_version = ifc_file.schema  # Returns: 'IFC2X3', 'IFC4', 'IFC4X3_ADD2'

# Determine capabilities
supports_tessellation = schema_version in ['IFC4', 'IFC4X3', 'IFC4X3_ADD2']
supports_alignment = schema_version in ['IFC4', 'IFC4X3', 'IFC4X3_ADD2']
supports_infrastructure = 'IFC4X3' in schema_version
```

### 2. Entity Type Normalization

```python
# Import mapping
from apps.models.services.schema_mapping import normalize_entity_type

# In extraction loop
for element in ifc_file.by_type('IfcElement'):
    original_type = element.is_a()  # 'IfcWallStandardCase'
    normalized_type = normalize_entity_type(original_type, schema_version)  # 'IfcWall'

    IFCEntity.objects.create(
        model=model,
        ifc_guid=element.GlobalId,
        ifc_type=normalized_type,
        ifc_type_original=original_type,
        schema_version=schema_version,
        # ... other fields
    )
```

### 3. Bulk Insert Pattern (High Performance)

```python
# For large datasets (100x faster than one-by-one)
entities_to_create = []
BATCH_SIZE = 500

for element in elements:
    entity = IFCEntity(
        model=model,
        ifc_guid=element.GlobalId,
        ifc_type=element.is_a(),
        name=element.Name or '',
    )
    entities_to_create.append(entity)

    if len(entities_to_create) >= BATCH_SIZE:
        IFCEntity.objects.bulk_create(entities_to_create, ignore_conflicts=True)
        print(f"Inserted {len(entities_to_create)} entities...")
        entities_to_create = []

# Insert remaining
if entities_to_create:
    IFCEntity.objects.bulk_create(entities_to_create, ignore_conflicts=True)
```

### 4. GUID Healing Pattern

```python
# Import healing functions
from apps.models.services.healing import generate_synthetic_guid

# In extraction loop
try:
    if hasattr(element, 'GlobalId') and element.GlobalId:
        guid = element.GlobalId
    else:
        # HEALING: Generate synthetic GUID
        guid = generate_synthetic_guid(element, file_path)
        errors.append({
            'severity': 'warning',
            'message': f"Generated synthetic GUID for element {element.id()}",
            'healing_applied': 'synthetic_guid',
        })
except Exception as e:
    # Log and continue
    errors.append({
        'severity': 'error',
        'message': f"Failed to process element: {str(e)}",
    })
    continue
```

### 5. Geometry Extraction with Fallback

```python
# Import ifcopenshell geometry
import ifcopenshell.geom

# Create settings
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)

# Try extraction with fallback
try:
    # Strategy 1: Full geometry
    shape = ifcopenshell.geom.create_shape(settings, element)
    geometry_data = process_shape(shape)
    geometry_status = 'completed'

except Exception as e:
    try:
        # Strategy 2: Simplified (no advanced BREP)
        settings.set(settings.DISABLE_ADVANCED_BREP, True)
        shape = ifcopenshell.geom.create_shape(settings, element)
        geometry_data = process_shape(shape)
        geometry_status = 'completed'

    except Exception as e2:
        # Strategy 3: Bounding box only
        geometry_data = extract_bounding_box_only(element)
        geometry_status = 'partial'
```

### 6. Property Set Extraction

```python
# Extract properties from element
properties = []

if hasattr(element, 'IsDefinedBy'):
    for definition in element.IsDefinedBy:
        if definition.is_a('IfcRelDefinesByProperties'):
            pset = definition.RelatingPropertyDefinition

            if pset.is_a('IfcPropertySet'):
                pset_name = pset.Name

                for prop in pset.HasProperties:
                    if prop.is_a('IfcPropertySingleValue'):
                        properties.append({
                            'pset_name': pset_name,
                            'property_name': prop.Name,
                            'property_value': str(prop.NominalValue.wrappedValue) if prop.NominalValue else None,
                            'property_type': type(prop.NominalValue.wrappedValue).__name__ if prop.NominalValue else 'string',
                        })

# Bulk insert
PropertySet.objects.bulk_create([
    PropertySet(entity=entity, **prop_data)
    for prop_data in properties
], ignore_conflicts=True)
```

### 7. Quantity Extraction

```python
# Extract quantities from element
quantities = []

if hasattr(element, 'IsDefinedBy'):
    for definition in element.IsDefinedBy:
        if definition.is_a('IfcRelDefinesByProperties'):
            qset = definition.RelatingPropertyDefinition

            if qset.is_a('IfcElementQuantity'):
                qset_name = qset.Name

                for qty in qset.Quantities:
                    if qty.is_a('IfcQuantityLength'):
                        quantities.append({
                            'qset_name': qset_name,
                            'quantity_name': qty.Name,
                            'quantity_value': float(qty.LengthValue),
                            'quantity_unit': 'm',
                            'quantity_type': 'Length',
                        })
                    elif qty.is_a('IfcQuantityArea'):
                        quantities.append({
                            'qset_name': qset_name,
                            'quantity_name': qty.Name,
                            'quantity_value': float(qty.AreaValue),
                            'quantity_unit': 'm²',
                            'quantity_type': 'Area',
                        })
                    # Add more quantity types as needed

# Bulk insert
QuantitySet.objects.bulk_create([
    QuantitySet(entity=entity, **qty_data)
    for qty_data in quantities
], ignore_conflicts=True)
```

### 8. Status Tracking Pattern

```python
# Update model status through processing stages

# Start Layer 1
model.parsing_status = 'parsing'
model.save(update_fields=['parsing_status'])

# ... do parsing work ...

# Complete Layer 1
model.parsing_status = 'parsed'
model.save(update_fields=['parsing_status'])

# Start Layer 2
model.geometry_status = 'extracting'
model.save(update_fields=['geometry_status'])

# ... do geometry work ...

# Complete Layer 2
model.geometry_status = 'completed'  # or 'partial' if some failed
model.save(update_fields=['geometry_status'])
```

### 9. Error Tracking in ProcessingReport

```python
# Create report at start
report = ProcessingReport.objects.create(
    model=model,
    overall_status='failed',  # Will update on success
)

# Track errors during processing
errors = []

for element in elements:
    try:
        # ... process element ...
        pass
    except Exception as e:
        errors.append({
            'stage': 'elements',
            'severity': 'error',
            'message': str(e),
            'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
            'element_type': element.is_a() if hasattr(element, 'is_a') else None,
            'timestamp': datetime.now().isoformat(),
        })

# Update report at end
report.errors = errors
report.overall_status = 'success' if len(errors) == 0 else 'partial'
report.save()
```

### 10. Schema-Agnostic Query

```python
# Query all walls (works with any IFC version)
walls = IFCEntity.objects.filter(
    model=model,
    ifc_type='IfcWall'  # Normalized type
)

# Include original type for debugging
walls_with_original = IFCEntity.objects.filter(
    model=model,
    ifc_type='IfcWall'
).values('ifc_guid', 'name', 'ifc_type', 'ifc_type_original', 'schema_version')

# Group by schema version
from django.db.models import Count
walls_by_schema = IFCEntity.objects.filter(
    model=model,
    ifc_type='IfcWall'
).values('schema_version').annotate(count=Count('id'))
```

---

## Common Patterns by Task

### Task: Add Support for New IFC Version

**Steps**:

1. Update `schema_mapping.py`:
```python
ENTITY_TYPE_MAPPINGS = {
    'IFC2X3': {...},
    'IFC4': {...},
    'IFC4X3': {...},
    'IFC5': {  # NEW
        # Add any deprecated types that need mapping
    },
}
```

2. Update schema detection in `parse.py`:
```python
# Add version-specific capabilities
if schema_version == 'IFC5':
    metadata.supports_new_feature = True
```

3. Test:
```bash
python django-test/test_ifc5_file.py
```

### Task: Extract New Property Type

**Steps**:

1. Add extraction logic in `parse.py` or create new service:
```python
def _extract_custom_properties(model, ifc_file):
    # Similar to _extract_property_sets but for custom type
    pass
```

2. Update `PropertySet` model if needed (or create new model)

3. Add to orchestration in `tasks.py`:
```python
# After existing property extraction
custom_count, errors = _extract_custom_properties(model, ifc_file)
```

### Task: Add Robustness for Common Error

**Steps**:

1. Add healing function in `healing.py`:
```python
def heal_missing_storey(element, model):
    """Assign element to default storey if not assigned."""
    # Create or get default storey
    # Assign element
    # Return healing info
    pass
```

2. Use in extraction:
```python
if not element.ContainedInStructure:
    # HEALING: Assign to default storey
    storey_id = heal_missing_storey(element, model)
    errors.append({
        'severity': 'warning',
        'message': f"Element {element.GlobalId} assigned to default storey",
        'healing_applied': 'default_storey_assignment',
    })
```

3. Test with malformed file:
```bash
python django-test/test_healing_missing_storey.py
```

---

## Testing Checklist

### Unit Tests (Django)

```python
# django-test/test_schema_mapping.py

import os
import sys
import django

# Setup Django
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.services.schema_mapping import normalize_entity_type

def test_ifc2x3_mapping():
    """Test IFC2x3 deprecated types are mapped correctly."""
    assert normalize_entity_type('IfcWallStandardCase', 'IFC2X3') == 'IfcWall'
    assert normalize_entity_type('IfcSlabStandardCase', 'IFC2X3') == 'IfcSlab'
    assert normalize_entity_type('IfcWall', 'IFC2X3') == 'IfcWall'

def test_ifc4_no_mapping():
    """Test IFC4 types pass through unchanged."""
    assert normalize_entity_type('IfcWall', 'IFC4') == 'IfcWall'
    assert normalize_entity_type('IfcSlab', 'IFC4') == 'IfcSlab'

if __name__ == '__main__':
    test_ifc2x3_mapping()
    test_ifc4_no_mapping()
    print("✅ All schema mapping tests passed!")
```

### Integration Tests

```python
# django-test/test_full_extraction.py

def test_ifc2x3_file():
    """Test full extraction of IFC2x3 file."""
    # Upload file
    # Wait for processing
    # Assert:
    #   - parsing_status = 'parsed'
    #   - geometry_status = 'completed'
    #   - All IfcWallStandardCase → IfcWall
    #   - Properties extracted
    pass

def test_ifc4_file():
    """Test full extraction of IFC4 file."""
    # Similar assertions
    pass
```

### Performance Tests

```python
def test_bulk_insert_performance():
    """Verify bulk insert is significantly faster than one-by-one."""
    import time

    # Method 1: One-by-one (slow)
    start = time.time()
    for i in range(1000):
        IFCEntity.objects.create(...)
    duration_single = time.time() - start

    # Method 2: Bulk (fast)
    start = time.time()
    entities = [IFCEntity(...) for i in range(1000)]
    IFCEntity.objects.bulk_create(entities)
    duration_bulk = time.time() - start

    # Assert bulk is at least 10x faster
    assert duration_bulk < duration_single / 10
```

---

## Debugging Tips

### Issue: Entity Types Not Normalized

**Symptoms**: IFC2x3 file shows `IfcWallStandardCase` instead of `IfcWall`

**Check**:
```python
# In Django shell
from apps.entities.models import IFCEntity

# Check if normalization was applied
walls = IFCEntity.objects.filter(ifc_type='IfcWallStandardCase')
print(f"Found {walls.count()} walls with deprecated type")

# Check schema version
for wall in walls[:5]:
    print(f"GUID: {wall.ifc_guid}, Type: {wall.ifc_type}, Original: {wall.ifc_type_original}, Schema: {wall.schema_version}")
```

**Fix**: Update `parse.py` to use `normalize_entity_type()`

### Issue: Geometry Extraction Slow

**Symptoms**: Layer 2 takes 5+ minutes for small models

**Check**:
```python
# In Django shell
from apps.models.models import Model

model = Model.objects.get(id='...')

# Check geometry status distribution
from apps.entities.models import IFCEntity
from django.db.models import Count

status_counts = IFCEntity.objects.filter(model=model).values('geometry_status').annotate(count=Count('id'))
print(status_counts)

# If many 'processing', may be stuck
```

**Fix**: Check for geometry extraction errors in `ProcessingReport.errors`

### Issue: Duplicate GUIDs

**Symptoms**: `IntegrityError: duplicate key value violates unique constraint`

**Check**:
```python
# In Django shell
from apps.entities.models import IFCEntity
from django.db.models import Count

# Find duplicate GUIDs
duplicates = IFCEntity.objects.filter(model=model).values('ifc_guid').annotate(count=Count('id')).filter(count__gt=1)
print(f"Found {duplicates.count()} duplicate GUIDs")
```

**Fix**: Implement duplicate GUID healing in `parse.py`

### Issue: Missing Properties

**Symptoms**: Properties not extracted from IFC file

**Check**:
```python
# Test property extraction directly
import ifcopenshell

ifc_file = ifcopenshell.open('path/to/file.ifc')
element = ifc_file.by_type('IfcWall')[0]

# Check if element has properties
if hasattr(element, 'IsDefinedBy'):
    for rel in element.IsDefinedBy:
        print(rel)
        if rel.is_a('IfcRelDefinesByProperties'):
            pset = rel.RelatingPropertyDefinition
            print(f"Pset: {pset.Name}")
            for prop in pset.HasProperties:
                print(f"  {prop.Name}: {prop.NominalValue}")
```

**Fix**: Verify property extraction logic in `_extract_property_sets()`

---

## Performance Optimization

### Optimization 1: Use Bulk Inserts

**Before** (slow):
```python
for element in elements:
    IFCEntity.objects.create(...)  # Database call per element
```

**After** (fast):
```python
entities = []
for element in elements:
    entities.append(IFCEntity(...))
    if len(entities) >= 500:
        IFCEntity.objects.bulk_create(entities, ignore_conflicts=True)
        entities = []
IFCEntity.objects.bulk_create(entities, ignore_conflicts=True)
```

**Impact**: 100x faster

### Optimization 2: Prefetch Related Objects

**Before** (N+1 queries):
```python
entities = IFCEntity.objects.filter(model=model)
for entity in entities:
    properties = entity.property_sets.all()  # Database query per entity!
```

**After** (1 query):
```python
entities = IFCEntity.objects.filter(model=model).prefetch_related('property_sets')
for entity in entities:
    properties = entity.property_sets.all()  # Cached, no query
```

### Optimization 3: Use `only()` for Large Queries

**Before** (loads all fields):
```python
entities = IFCEntity.objects.filter(model=model)  # Loads all fields including BLOBs
```

**After** (loads only needed fields):
```python
entities = IFCEntity.objects.filter(model=model).only('id', 'ifc_guid', 'ifc_type', 'name')
```

### Optimization 4: Database Indexing

**Check existing indexes**:
```sql
-- In PostgreSQL
SELECT * FROM pg_indexes WHERE tablename = 'ifc_entities';
```

**Add indexes for common queries**:
```python
# In models.py
class IFCEntity(models.Model):
    # ... fields ...

    class Meta:
        indexes = [
            models.Index(fields=['ifc_type']),       # For filtering by type
            models.Index(fields=['ifc_guid']),       # For GUID lookups
            models.Index(fields=['storey_id']),      # For spatial queries
            models.Index(fields=['geometry_status']), # For status queries
        ]
```

---

## API Endpoint Patterns

### Pattern: List with Filtering

```python
# apps/entities/views.py

class EntityViewSet(viewsets.ModelViewSet):
    def list(self, request):
        """
        List entities with filtering.

        Query params:
            - ifc_type: Filter by normalized type (IfcWall, IfcDoor, etc.)
            - storey_id: Filter by storey
            - has_geometry: Filter by geometry availability (true/false)
            - schema_version: Filter by schema version (IFC2X3, IFC4, etc.)
        """
        queryset = IFCEntity.objects.filter(model=request.model)

        # Filter by type
        if ifc_type := request.query_params.get('ifc_type'):
            queryset = queryset.filter(ifc_type=ifc_type)

        # Filter by storey
        if storey_id := request.query_params.get('storey_id'):
            queryset = queryset.filter(storey_id=storey_id)

        # Filter by geometry status
        if has_geometry := request.query_params.get('has_geometry'):
            if has_geometry.lower() == 'true':
                queryset = queryset.exclude(geometry_status='no_representation')
            else:
                queryset = queryset.filter(geometry_status='no_representation')

        # Filter by schema version
        if schema_version := request.query_params.get('schema_version'):
            queryset = queryset.filter(schema_version=schema_version)

        # Paginate
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)
```

### Pattern: Aggregation Endpoint

```python
class ModelViewSet(viewsets.ModelViewSet):
    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """
        Get statistics for a model.

        Returns:
            - Total entity count
            - Count by type
            - Count by storey
            - Geometry extraction status
        """
        model = self.get_object()

        # Entity counts by type
        entity_counts = IFCEntity.objects.filter(model=model).values('ifc_type').annotate(
            count=Count('id')
        ).order_by('-count')

        # Geometry status distribution
        geometry_status = IFCEntity.objects.filter(model=model).values('geometry_status').annotate(
            count=Count('id')
        )

        # Storey distribution
        storey_counts = IFCEntity.objects.filter(model=model).exclude(
            storey_id__isnull=True
        ).values('storey_id').annotate(count=Count('id'))

        return Response({
            'total_entities': IFCEntity.objects.filter(model=model).count(),
            'entity_counts_by_type': entity_counts,
            'geometry_status': geometry_status,
            'storey_counts': storey_counts,
        })
```

---

## Migration Templates

### Template: Add New Status Field

```python
# Generated migration file

from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('models', 'XXXX_previous_migration'),
    ]

    operations = [
        migrations.AddField(
            model_name='model',
            name='layer4_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('extracting', 'Extracting'),
                    ('completed', 'Completed'),
                    ('failed', 'Failed')
                ],
                default='pending',
                max_length=20,
                help_text='Layer 4: Quantities extraction status'
            ),
        ),
    ]
```

### Template: Add New Related Model

```python
# Generated migration file

from django.db import migrations, models
import uuid

class Migration(migrations.Migration):
    dependencies = [
        ('entities', 'XXXX_previous_migration'),
    ]

    operations = [
        migrations.CreateModel(
            name='QuantitySet',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True)),
                ('qset_name', models.CharField(max_length=255)),
                ('quantity_name', models.CharField(max_length=255)),
                ('quantity_value', models.FloatField()),
                ('quantity_unit', models.CharField(blank=True, max_length=50, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('entity', models.ForeignKey(on_delete=models.CASCADE, related_name='quantities', to='entities.ifcentity')),
            ],
            options={
                'db_table': 'quantity_sets',
            },
        ),
        migrations.AddIndex(
            model_name='quantityset',
            index=models.Index(fields=['qset_name'], name='quantity_se_qset_na_idx'),
        ),
    ]
```

---

## Useful Django Management Commands

### Check Database State

```bash
# Show all migrations
python manage.py showmigrations

# Check for missing migrations
python manage.py makemigrations --check --dry-run

# Show SQL for migration
python manage.py sqlmigrate entities 0001

# Show database info
python manage.py dbshell
```

### Data Operations

```bash
# Django shell
python manage.py shell

# Load test data
python manage.py loaddata test_data.json

# Dump data
python manage.py dumpdata entities --indent 2 > entities_backup.json
```

### Performance Analysis

```bash
# Django shell with SQL logging
python manage.py shell

>>> from django.conf import settings
>>> settings.DEBUG = True  # Enable query logging

>>> from django.db import connection
>>> from apps.entities.models import IFCEntity

>>> entities = IFCEntity.objects.filter(ifc_type='IfcWall').prefetch_related('property_sets')
>>> list(entities)  # Execute query

>>> print(len(connection.queries))  # Show query count
>>> for query in connection.queries:
...     print(query['sql'])  # Show actual SQL
```

---

## Common SQL Queries

### Query: Find Elements Without Geometry

```sql
SELECT
    e.ifc_guid,
    e.ifc_type,
    e.name,
    e.geometry_status
FROM ifc_entities e
WHERE e.model_id = $model_id
  AND e.geometry_status IN ('failed', 'pending')
ORDER BY e.ifc_type, e.name;
```

### Query: Property Value Search

```sql
-- Find all elements with specific property value
SELECT DISTINCT
    e.ifc_guid,
    e.ifc_type,
    e.name,
    p.pset_name,
    p.property_name,
    p.property_value
FROM ifc_entities e
JOIN property_sets p ON p.entity_id = e.id
WHERE e.model_id = $model_id
  AND p.property_name = 'IsExternal'
  AND p.property_value = 'True'
ORDER BY e.ifc_type, e.name;
```

### Query: Material Usage Report

```sql
-- Count elements by material
SELECT
    m.name AS material_name,
    e.ifc_type,
    COUNT(DISTINCT e.id) AS element_count,
    SUM(COALESCE(q.quantity_value, 0)) AS total_volume
FROM materials m
JOIN material_assignments ma ON ma.material_id = m.id
JOIN ifc_entities e ON ma.entity_id = e.id
LEFT JOIN quantity_sets q ON q.entity_id = e.id AND q.quantity_name = 'NetVolume'
WHERE m.model_id = $model_id
GROUP BY m.name, e.ifc_type
ORDER BY total_volume DESC;
```

---

## Resources

- [buildingSMART IFC Specification](https://standards.buildingsmart.org/)
- [ifcopenshell Documentation](https://ifcopenshell.org/)
- [Django ORM Performance](https://docs.djangoproject.com/en/5.0/topics/db/optimization/)
- [PostgreSQL Indexing](https://www.postgresql.org/docs/current/indexes.html)

---

**Last Updated**: 2025-10-25
**Status**: Living Document (update as patterns evolve)
