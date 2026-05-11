"""
Backfill Observations from existing DrawingSheets.

Reads each existing DrawingSheet's persisted state via the historical
model accessor and emits Observation rows using the same logic as the
live path (`apps.entities.services.observation_emitter`).

Safe to re-run only if the destination table is empty for the sheets
being backfilled — the migration is one-shot. If you need to re-emit
later, delete the affected rows first.
"""
from __future__ import annotations

from django.db import migrations


def backfill(apps, schema_editor):
    DrawingSheet = apps.get_model('entities', 'DrawingSheet')
    Observation = apps.get_model('entities', 'Observation')

    # Import the emitter lazily — it doesn't need the historical models,
    # but it does need Django app registry to be ready, which it is here.
    from apps.entities.services.observation_emitter import emit_for_drawing_sheet

    for sheet in DrawingSheet.objects.select_related('extraction_run').iterator():
        if not sheet.extraction_run_id:
            continue
        emit_for_drawing_sheet(
            sheet,
            extraction_run=sheet.extraction_run,
            Observation=Observation,
        )


def reverse(apps, schema_editor):
    Observation = apps.get_model('entities', 'Observation')
    Observation.objects.filter(sheet__isnull=False).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('entities', '0040_observation'),
    ]

    operations = [
        migrations.RunPython(backfill, reverse),
    ]
