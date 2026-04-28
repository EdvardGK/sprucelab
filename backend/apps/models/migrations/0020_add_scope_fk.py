"""Phase 3: nullable scope FK on SourceFile + Model.

Both columns are nullable + SET_NULL so deleting a ProjectScope cannot
destroy uploaded files. No backfill — existing rows keep ``scope=NULL``.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0019_backfill_source_files'),
        ('projects', '0005_add_project_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='sourcefile',
            name='scope',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='source_files',
                to='projects.projectscope',
            ),
        ),
        migrations.AddField(
            model_name='model',
            name='scope',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='models',
                to='projects.projectscope',
            ),
        ),
    ]
