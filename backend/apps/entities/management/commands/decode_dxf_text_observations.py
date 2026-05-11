"""
One-shot cleanup: strip DXF MTEXT format codes from existing text_block observations.

Background: the drawing extractor was reading `entity.text` for MTEXT,
which returns the raw source string including format codes like
`\\A1;{\\fArial|b0|i0|c0|p0;\\W1.000000;135}`. The shipped fix uses
`ezdxf.tools.text.plain_mtext()` going forward; this command applies
the same decoder to rows already persisted.

Idempotent: rows whose content is already plain text pass through
unchanged. Safe to re-run.

Usage:
    python manage.py decode_dxf_text_observations           # dry-run preview
    python manage.py decode_dxf_text_observations --apply   # actually update
    python manage.py decode_dxf_text_observations --apply --batch 500
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.entities.models import Observation


def _decode(raw: str) -> str:
    """Return MTEXT-decoded form. Falls back to the original on any error."""
    if not raw:
        return raw
    # Cheap test: if it doesn't look like MTEXT, skip the parse entirely.
    if '\\' not in raw and '{' not in raw and '%%' not in raw:
        return raw
    try:
        from ezdxf.tools.text import plain_mtext
        return plain_mtext(raw, split=False)
    except Exception:
        return raw


class Command(BaseCommand):
    help = 'Strip DXF MTEXT format codes from existing text_block observations.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually persist changes. Without this flag, prints a dry-run summary.',
        )
        parser.add_argument(
            '--batch', type=int, default=500,
            help='Rows per database round-trip when applying. Default 500.',
        )

    def handle(self, *args, **opts):
        apply_changes = opts['apply']
        batch_size = opts['batch']

        qs = Observation.objects.filter(category='text_block').only('id', 'content')
        total = qs.count()
        self.stdout.write(f'Scanning {total} text_block observations…')

        changed: list[tuple] = []
        for obs in qs.iterator(chunk_size=batch_size):
            new_content = _decode(obs.content)
            if new_content != obs.content:
                changed.append((obs.id, obs.content, new_content))

        self.stdout.write(f'Found {len(changed)} rows that would be decoded.')

        if not changed:
            self.stdout.write(self.style.SUCCESS('Nothing to do.'))
            return

        # Show a small sample so the operator can sanity-check.
        sample = changed[:5]
        self.stdout.write('Sample (first 5):')
        for _id, before, after in sample:
            before_short = (before[:80] + '…') if len(before) > 80 else before
            after_short = (after[:80] + '…') if len(after) > 80 else after
            self.stdout.write(f'  {_id}')
            self.stdout.write(f'    before: {before_short!r}')
            self.stdout.write(f'    after:  {after_short!r}')

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                'Dry-run only. Re-run with --apply to persist.'
            ))
            return

        # Apply in batches via a single update per row (bulk_update is the
        # straightforward path; we don't have unique enough criteria for an
        # UPDATE...CASE statement).
        updated = 0
        with transaction.atomic():
            for i in range(0, len(changed), batch_size):
                slice_ids = [row[0] for row in changed[i:i + batch_size]]
                slice_map = {row[0]: row[2] for row in changed[i:i + batch_size]}
                obs_rows = list(Observation.objects.filter(id__in=slice_ids).only('id', 'content'))
                for obs in obs_rows:
                    obs.content = slice_map[obs.id]
                Observation.objects.bulk_update(obs_rows, fields=['content'], batch_size=batch_size)
                updated += len(obs_rows)

        self.stdout.write(self.style.SUCCESS(f'Updated {updated} rows.'))
