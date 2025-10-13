# Generated manually to fix unique constraint
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0002_add_file_size_to_model'),
    ]

    operations = [
        # Remove the old incorrect unique constraint on (project, version_number)
        migrations.AlterUniqueTogether(
            name='model',
            unique_together=set(),
        ),
        # Add the correct unique constraint on (project, name, version_number)
        migrations.AlterUniqueTogether(
            name='model',
            unique_together={('project', 'name', 'version_number')},
        ),
    ]
