"""Add fragments_format_version field to Model.

Distinguishes the legacy OBC.FragmentsManager.export() output ('v2') from
the new FRAGS.IfcImporter.process() output ('v3'). The frontend uses
this to pick the load path during the dual-load rollout (Phase B). After
backfill (Phase D), all rows are 'v3' and the v2 branch is removed.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0021_add_discovered_grid'),
    ]

    operations = [
        migrations.AddField(
            model_name='model',
            name='fragments_format_version',
            field=models.CharField(
                choices=[('v2', 'v2'), ('v3', 'v3')],
                default='v2',
                help_text='Binary format version of the fragments file',
                max_length=8,
            ),
        ),
    ]
