from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0006_projectscope_canonical_floors'),
    ]

    operations = [
        migrations.AddField(
            model_name='projectconfig',
            name='block_on_storey_deviation',
            field=models.BooleanField(
                default=False,
                help_text='When true, models with storey_match errors cannot be published.',
            ),
        ),
    ]
