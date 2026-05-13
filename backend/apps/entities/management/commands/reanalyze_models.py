"""Re-run ``run_model_analysis_task`` on every model with an IFC file.

Used to populate fields added to ``ModelAnalysis`` / ``AnalysisStorey`` /
``AnalysisType`` after the original ingestion ran. The task wipes the
existing analysis and re-ingests from the IFC, so any new field added to
the analysis schema (e.g. ``AnalysisStorey.guid``) lands on the next pass.

Usage:
  python manage.py reanalyze_models                 # all eligible
  python manage.py reanalyze_models --dry-run       # report, no enqueue
  python manage.py reanalyze_models --limit 1       # smoke test one
  python manage.py reanalyze_models --model UUID    # one specific
  python manage.py reanalyze_models --sync          # run inline (no Celery)
  python manage.py reanalyze_models --throttle 1.0  # sleep N s between runs

Per-model failures don't stop the batch.
"""
from __future__ import annotations

import time

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.entities.tasks import run_model_analysis_task
from apps.models.models import Model


class Command(BaseCommand):
    help = "Re-run model analysis on every model with an IFC file (or one --model)."

    def add_arguments(self, parser):
        parser.add_argument('--model', type=str, default=None,
                            help='Only re-analyze a single Model UUID')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would run without enqueuing')
        parser.add_argument('--limit', type=int, default=None,
                            help='Stop after N models')
        parser.add_argument('--sync', action='store_true',
                            help='Run inline (no Celery enqueue) — handy when worker is offline')
        parser.add_argument('--throttle', type=float, default=0.0,
                            help='Seconds to sleep between models (default 0)')

    def handle(self, *args, **opts):
        qs = (
            Model.objects
            .filter(Q(file_url__isnull=False) & ~Q(file_url=''))
            .order_by('-created_at')
        )
        if opts['model']:
            qs = qs.filter(id=opts['model'])
        if opts['limit']:
            qs = qs[:opts['limit']]

        models = list(qs)
        self.stdout.write(f"Re-analysis plan: {len(models)} model(s)")
        if opts['dry_run']:
            for m in models:
                self.stdout.write(f"  - {m.id} ({m.name})")
            return

        succeeded = failed = 0
        for i, m in enumerate(models, 1):
            label = f"{m.id} ({m.name})"
            self.stdout.write(f"[{i}/{len(models)}] {label}")
            try:
                if opts['sync']:
                    result = run_model_analysis_task(str(m.id))
                else:
                    result = run_model_analysis_task.delay(str(m.id))
                self.stdout.write(self.style.SUCCESS(f"  OK -> {result}"))
                succeeded += 1
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  FAIL: {exc}"))
                failed += 1
            if opts['throttle'] and i < len(models):
                time.sleep(opts['throttle'])

        self.stdout.write(self.style.SUCCESS(
            f"\nSummary: {succeeded}/{len(models)} succeeded, {failed} failed"
        ))
