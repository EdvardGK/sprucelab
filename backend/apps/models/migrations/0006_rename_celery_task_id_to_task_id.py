# Generated migration to rename celery_task_id to task_id
# After switching from Celery to Django Q

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('models', '0005_model_celery_task_id'),
    ]

    operations = [
        migrations.RenameField(
            model_name='model',
            old_name='celery_task_id',
            new_name='task_id',
        ),
    ]
