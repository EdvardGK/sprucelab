"""
Add typed value columns to PropertySet for numeric/boolean queries.

property_value (text) remains as fallback. Typed columns enable:
- Range queries on numeric properties (area > 10.0)
- Boolean filters (IsExternal = True)
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('entities', '0032_add_spatial_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='propertyset',
            name='value_number',
            field=models.FloatField(
                blank=True,
                help_text='Typed numeric value (for range queries). Populated when property_type is numeric.',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='propertyset',
            name='value_boolean',
            field=models.BooleanField(
                blank=True,
                help_text='Typed boolean value (for boolean filters). Populated when property_type is BOOLEAN.',
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name='propertyset',
            index=models.Index(fields=['value_boolean'], name='property_se_value_b_idx'),
        ),
    ]
