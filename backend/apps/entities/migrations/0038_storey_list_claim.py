"""Phase F-1: storey_list claim_type + promoted_to_scope FK on Claim."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('entities', '0037_add_claims'),
        ('projects', '0006_projectscope_canonical_floors'),
    ]

    operations = [
        migrations.AlterField(
            model_name='claim',
            name='claim_type',
            field=models.CharField(
                choices=[
                    ('rule', 'Rule (normative requirement)'),
                    ('spec', 'Specification (concrete value)'),
                    ('requirement', 'Requirement (general)'),
                    ('constraint', 'Constraint (limit / threshold)'),
                    ('fact', 'Fact (descriptive, non-normative)'),
                    ('storey_list', 'Storey list (canonical floor proposal)'),
                ],
                db_index=True,
                default='rule',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='claim',
            name='promoted_to_scope',
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    'For storey_list claims: which ProjectScope.canonical_floors the '
                    'promotion wrote into. Mutually exclusive with promoted_to_config '
                    '— claim_type drives which one is used.'
                ),
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='derived_from_claims',
                to='projects.projectscope',
            ),
        ),
    ]
