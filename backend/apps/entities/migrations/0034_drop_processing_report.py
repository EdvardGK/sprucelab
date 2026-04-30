"""
Phase 2.5: drop the legacy ProcessingReport model + table.

ExtractionRun (apps.models.ExtractionRun) replaced ProcessingReport in Phase 2.
The compat shim kept the old `/api/types/processing-reports/` endpoint live for
the dev frontend; it has been removed and the frontend now reads directly from
`/api/files/extractions/`.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('entities', '0033_typed_property_values'),
        ('models', '0019_backfill_source_files'),
    ]

    operations = [
        migrations.DeleteModel(name='ProcessingReport'),
    ]
