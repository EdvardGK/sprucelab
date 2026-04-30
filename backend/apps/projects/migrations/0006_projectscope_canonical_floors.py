"""Phase F-1: ProjectScope.canonical_floors — canonical floor list per scope."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0005_add_project_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='projectscope',
            name='canonical_floors',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    'Canonical floor list for this scope. List of '
                    '{code, name, elevation_m, aliases[], _promoted_from_claim, _promoted_at}. '
                    'Populated by promoting storey_list claims through the Claim Inbox.'
                ),
            ),
        ),
    ]
