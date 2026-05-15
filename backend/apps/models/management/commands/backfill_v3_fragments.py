"""Backfill v3 fragments by re-running the IfcImporter converter on every
v2-format Model in the database.

Triggered manually after the Phase A converter ships and we've verified
the v3 load path works on at least one test model. Calls the same
trigger_fragment_generation flow the upload pipeline uses, so retries +
status tracking + Django callback all keep working.

Also doubles as the re-conversion entrypoint after converter changes
that alter the on-disk .frag binary (e.g. the opening-element exclusion
landed in 9ef1499) — pass --all to re-run every model regardless of
fragments_format_version.

Usage:
  python manage.py backfill_v3_fragments                  # v2 models only
  python manage.py backfill_v3_fragments --all            # every model w/ IFC
  python manage.py backfill_v3_fragments --project UUID   # one project
  python manage.py backfill_v3_fragments --model UUID     # one specific model
  python manage.py backfill_v3_fragments --force          # also re-trigger models stuck in status=generating
  python manage.py backfill_v3_fragments --dry-run        # report what would run
"""

import time
from django.core.management.base import BaseCommand
from apps.models.models import Model
from apps.models.services.fragments import trigger_fragment_generation


class Command(BaseCommand):
    help = "Re-run the IfcImporter converter on .frag files (default: v2 only; --all for every model)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--all',
            action='store_true',
            help='Re-convert every model with an IFC file, not just v2 ones. Use after converter changes (e.g. opening exclusion).',
        )
        parser.add_argument(
            '--project',
            type=str,
            default=None,
            help='Restrict to a single project UUID',
        )
        parser.add_argument(
            '--model',
            type=str,
            default=None,
            help='Only backfill a single model UUID',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-trigger models even when fragments_status="generating". Use to resurrect models stuck mid-generation from a prior crashed run.',
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
        qs = Model.objects.exclude(file_url__isnull=True).exclude(file_url='')
        scope = 'all-formats' if opts['all'] else 'v2-only'
        if not opts['all']:
            qs = qs.filter(fragments_format_version='v2')
        if opts['project']:
            qs = qs.filter(project_id=opts['project'])
        if opts['model']:
            qs = qs.filter(id=opts['model'])
        qs = qs.order_by('project_id', 'created_at')
        targets = list(qs)
        self.stdout.write(self.style.NOTICE(
            f'Found {len(targets)} model(s) to backfill (scope={scope}).'
        ))

        if opts['dry_run']:
            for m in targets:
                self.stdout.write(
                    f'  - {m.id}  {m.name}  '
                    f'(fmt={m.fragments_format_version} status={m.fragments_status})'
                )
            return

        triggered = 0
        skipped = 0
        failed = 0
        for m in targets:
            if m.fragments_status == 'generating' and not opts['force']:
                self.stdout.write(self.style.WARNING(
                    f'  skip generating: {m.id}  {m.name}  (re-run with --force to override)'
                ))
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
