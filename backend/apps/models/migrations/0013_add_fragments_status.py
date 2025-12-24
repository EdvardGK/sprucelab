# Generated manually for fragments status tracking

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("models", "0012_add_type_material_stats"),
    ]

    operations = [
        migrations.AddField(
            model_name="model",
            name="fragments_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("generating", "Generating"),
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                ],
                default="pending",
                help_text="Fragment generation status",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="model",
            name="fragments_error",
            field=models.TextField(
                blank=True,
                help_text="Error message if fragment generation failed",
                null=True,
            ),
        ),
    ]
