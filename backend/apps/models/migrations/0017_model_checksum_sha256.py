"""Add SHA-256 checksum field to Model for file integrity verification."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0016_model_uploaded_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='model',
            name='checksum_sha256',
            field=models.CharField(
                blank=True,
                help_text='SHA-256 checksum of the uploaded file (for integrity verification)',
                max_length=64,
                null=True,
            ),
        ),
    ]
