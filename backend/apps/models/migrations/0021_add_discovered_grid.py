"""Phase 4: ExtractionRun.discovered_grid JSON field.

Stores IfcGrid U/V/W axes (label + curve geometry) extracted by the
FastAPI parser. Default empty dict — no backfill needed; older runs simply
have no grid data.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0020_add_scope_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='extractionrun',
            name='discovered_grid',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='{"grids": [{"name", "guid", "placement", "u_axes": [...], "v_axes": [...], "w_axes": [...]}]}',
            ),
        ),
    ]
