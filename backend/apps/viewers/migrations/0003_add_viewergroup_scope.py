"""Phase 3: nullable scope FK on ViewerGroup."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('viewers', '0002_remove_viewergroup_viewer_viewergroup_created_by_and_more'),
        ('projects', '0005_add_project_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='viewergroup',
            name='scope',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='viewer_groups',
                to='projects.projectscope',
            ),
        ),
    ]
