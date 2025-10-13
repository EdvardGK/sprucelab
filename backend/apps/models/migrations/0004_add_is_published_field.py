# Generated manually for adding is_published field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0003_fix_unique_constraint'),
    ]

    operations = [
        migrations.AddField(
            model_name='model',
            name='is_published',
            field=models.BooleanField(default=False, help_text='Whether this version is the active/published version'),
        ),
    ]
