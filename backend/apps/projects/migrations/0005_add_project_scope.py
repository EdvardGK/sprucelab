"""Phase 3: ProjectScope (nestable organizational unit)."""

import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0004_responsibilitymatrix'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectScope',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('scope_type', models.CharField(
                    choices=[
                        ('project', 'Project'),
                        ('building', 'Building'),
                        ('wing', 'Wing'),
                        ('floor', 'Floor'),
                        ('zone', 'Zone'),
                        ('custom', 'Custom'),
                    ],
                    default='custom',
                    max_length=20,
                )),
                ('axis_grid_bounds', models.JSONField(blank=True, help_text='Grid bounds: {from_u, to_u, from_v, to_v}', null=True)),
                ('storey_elevation_min', models.FloatField(blank=True, null=True)),
                ('storey_elevation_max', models.FloatField(blank=True, null=True)),
                ('footprint_polygon', models.JSONField(blank=True, help_text='Polygon ring as [[x, y], ...] in project coordinates', null=True)),
                ('storey_merge_tolerance_m', models.FloatField(
                    default=0.2,
                    help_text='Max storey-elevation delta (m) treated as the same floor WITHIN this scope',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('parent', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='children',
                    to='projects.projectscope',
                )),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='scopes',
                    to='projects.project',
                )),
            ],
            options={
                'db_table': 'project_scopes',
                'ordering': ['name'],
                'unique_together': {('project', 'parent', 'name')},
                'indexes': [models.Index(fields=['project', 'parent'], name='project_sco_project_f9469d_idx')],
            },
        ),
    ]
