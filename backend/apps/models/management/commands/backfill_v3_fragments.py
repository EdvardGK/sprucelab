"""Backfill v3 fragments by re-running the IfcImporter converter on every
v2-format Model in the database.

Triggered manually after the Phase A converter ships and we've verified
the v3 load path works on at least one test model. Calls the same
trigger_fragment_generation flow the upload pipeline uses, so retries +
status tracking + Django callback all keep working.

Usage:
  python manage.py backfill_v3_fragments              # all v2 models
  python manage.py backfill_v3_fragments --model UUID # one specific model
  python manage.py backfill_v3_fragments --dry-run    # report what would run
"""

import time
from django.core.management.base import BaseCommand
from apps.models.models import Model
from apps.models.services.fragments import trigger_fragment_generation


class Command(BaseCommand):
    help = "Re-run the IfcImporter converter on v2 fragments to upgrade them to v3."

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
            help='Print what would run without triggering generation',
        )
        parser.add_argument(
            '--throttle-seconds',
            type=float,
            default=2.0,
            help='Sleep N seconds between trigger calls (default 2.0)',
        )

    def handle(self, *args, **opts):
        qs = Model.objects.filter(fragments_format_version='v2').exclude(file_url__isnull=True).exclude(file_url='')
        if opts['model']:
            qs = qs.filter(id=opts['model'])
        targets = list(qs)
        self.stdout.write(self.style.NOTICE(f'Found {len(targets)} v2 model(s) to backfill.'))

        if opts['dry_run']:
            for m in targets:
                self.stdout.write(f'  - {m.id}  {m.name}  (status={m.fragments_status})')
            return

        triggered = 0
        skipped = 0
        failed = 0
        for m in targets:
            if m.fragments_status == 'generating':
                self.stdout.write(self.style.WARNING(f'  skip generating: {m.id}  {m.name}'))
                skipped += 1
                continue
            try:
                trigger_fragment_generation(str(m.id))
                self.stdout.write(self.style.SUCCESS(f'  triggered: {m.id}  {m.name}'))
                triggered += 1
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f'  FAILED: {m.id}  {m.name}  ({exc})'))
                failed += 1
            time.sleep(opts['throttle_seconds'])

        self.stdout.write(self.style.SUCCESS(
            f'Done. triggered={triggered} skipped={skipped} failed={failed}'
        ))
