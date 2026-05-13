"""Backfill ``Model.thumbnail_url`` for models that pre-date the snapshot pipeline.

The fragments pipeline added thumbnail generation in commit ``1ac8d1b``;
every model uploaded BEFORE that ran has ``thumbnail_url=NULL``. This
command calls the ifc-service ``/fragments/thumbnail-only/`` endpoint
synchronously for each eligible model and writes the returned URL back.

Eligible models (default filter):
  - ``status='ready'`` — fragments build completed
  - ``thumbnail_url IS NULL OR ''`` — no snapshot yet
  - ``file_url IS NOT NULL`` — the IFC is still in storage

Usage:
  python manage.py backfill_thumbnails                # backfill all eligible
  python manage.py backfill_thumbnails --dry-run      # report, no writes
  python manage.py backfill_thumbnails --limit 5      # first 5 (smoke test)
  python manage.py backfill_thumbnails --model UUID   # one specific model
  python manage.py backfill_thumbnails --force        # ignore existing thumbnail_url

Per-model failures DO NOT stop the batch — the command logs the error and
continues. Final summary reports successes + failures + skips.
"""

from __future__ import annotations

import time
from typing import Optional

import httpx
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.models.models import Model


class Command(BaseCommand):
    help = "Backfill Model.thumbnail_url by calling the ifc-service thumbnail-only endpoint."

    def add_arguments(self, parser):
        parser.add_argument(
            '--model',
            type=str,
            default=None,
            help='Only backfill a single model UUID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would run without calling ifc-service',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Stop after N models (useful for smoke testing)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-generate thumbnails even for models that already have one',
        )
        parser.add_argument(
            '--throttle-seconds',
            type=float,
            default=1.0,
            help='Sleep N seconds between calls (default 1.0)',
        )
        parser.add_argument(
            '--timeout-seconds',
            type=float,
            default=180.0,
            help='Per-model ifc-service timeout (default 180.0)',
        )

    def handle(self, *args, **opts):
        ifc_service_url: str = settings.IFC_SERVICE_URL.rstrip('/')
        endpoint = f"{ifc_service_url}/api/v1/fragments/thumbnail-only"

        qs = Model.objects.filter(status='ready').exclude(file_url__isnull=True).exclude(file_url='')

        if opts['model']:
            qs = qs.filter(id=opts['model'])
        elif not opts['force']:
            qs = qs.filter(Q(thumbnail_url__isnull=True) | Q(thumbnail_url=''))

        qs = qs.order_by('-updated_at')

        if opts['limit']:
            qs = qs[:opts['limit']]

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING(
                'No eligible models found. (Already-thumbnailed models are skipped unless --force.)'
            ))
            return

        self.stdout.write(self.style.NOTICE(
            f'Backfill plan: {total} model(s){"  [DRY RUN]" if opts["dry_run"] else ""}'
        ))
        self.stdout.write(f'  ifc-service endpoint: {endpoint}')
        self.stdout.write(f'  throttle: {opts["throttle_seconds"]}s | timeout: {opts["timeout_seconds"]}s')
        self.stdout.write('')

        successes = 0
        failures: list[tuple[str, str]] = []

        for idx, model in enumerate(qs, start=1):
            label = f'[{idx}/{total}] {model.id} ({model.name})'
            self.stdout.write(label)

            if opts['dry_run']:
                self.stdout.write(self.style.SUCCESS('  DRY: would call ifc-service'))
                continue

            try:
                with httpx.Client(timeout=opts['timeout_seconds']) as client:
                    response = client.post(
                        endpoint,
                        json={
                            'model_id': str(model.id),
                            'ifc_url': model.file_url,
                        },
                        headers={'X-API-Key': settings.IFC_SERVICE_API_KEY}
                            if getattr(settings, 'IFC_SERVICE_API_KEY', None)
                            else {},
                    )
                response.raise_for_status()
                payload = response.json()
                thumbnail_url: Optional[str] = payload.get('thumbnail_url')
                error: Optional[str] = payload.get('error')

                if error:
                    failures.append((str(model.id), error))
                    self.stdout.write(self.style.ERROR(f'  FAILED: {error}'))
                elif thumbnail_url:
                    model.thumbnail_url = thumbnail_url
                    model.save(update_fields=['thumbnail_url'])
                    successes += 1
                    self.stdout.write(self.style.SUCCESS(f'  OK -> {thumbnail_url}'))
                else:
                    failures.append((str(model.id), 'response had no thumbnail_url and no error'))
                    self.stdout.write(self.style.ERROR('  FAILED: empty response'))

            except httpx.HTTPError as exc:
                failures.append((str(model.id), f'HTTP error: {exc}'))
                self.stdout.write(self.style.ERROR(f'  FAILED: {exc}'))
            except Exception as exc:
                failures.append((str(model.id), f'{type(exc).__name__}: {exc}'))
                self.stdout.write(self.style.ERROR(f'  FAILED: {exc}'))

            if idx < total and opts['throttle_seconds'] > 0:
                time.sleep(opts['throttle_seconds'])

        self.stdout.write('')
        self.stdout.write(self.style.NOTICE(
            f'Summary: {successes}/{total} succeeded, {len(failures)} failed'
        ))
        if failures:
            self.stdout.write(self.style.ERROR('Failures:'))
            for model_id, error in failures:
                self.stdout.write(f'  {model_id} — {error}')

        if not opts['dry_run'] and failures and successes == 0:
            raise CommandError('All backfill attempts failed; see errors above.')
