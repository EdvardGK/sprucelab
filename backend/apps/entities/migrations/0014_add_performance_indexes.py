# Generated migration for performance indexes
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Add database indexes to speed up statistics queries.

    Without these indexes, queries like "count all entities for model X"
    require full table scans (30+ seconds with 15k elements).
    With indexes: <1 second.
    """

    dependencies = [
        ('entities', '0013_add_type_definition_layer'),
    ]

    operations = [
        # IFCType - index on model_id for "list types in model X"
        migrations.AddIndex(
            model_name='ifctype',
            index=models.Index(fields=['model'], name='ifctype_model_idx'),
        ),
        # Material - index on model_id for "list materials in model X"
        migrations.AddIndex(
            model_name='material',
            index=models.Index(fields=['model'], name='material_model_idx'),
        ),
        # TypeAssignment - composite index for entity-to-type joins
        migrations.AddIndex(
            model_name='typeassignment',
            index=models.Index(fields=['entity', 'type'], name='typeassign_ent_type_idx'),
        ),
        # MaterialAssignment - composite index for entity-to-material joins
        migrations.AddIndex(
            model_name='materialassignment',
            index=models.Index(fields=['entity', 'material'], name='matassign_ent_mat_idx'),
        ),
    ]
