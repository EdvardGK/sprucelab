# Generated manually on 2025-10-24
# Changes parent_model ForeignKey from SET_NULL to CASCADE
# This enables cascade deletion of child versions when parent is deleted

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("models", "0007_add_layered_status_tracking"),
    ]

    operations = [
        migrations.AlterField(
            model_name="model",
            name="parent_model",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="versions",
                to="models.model",
            ),
        ),
    ]
