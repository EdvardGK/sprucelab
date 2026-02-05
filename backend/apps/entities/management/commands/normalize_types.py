"""
Management command to auto-normalize TypeBankEntry semantic types.

Usage:
    python manage.py normalize_types
    python manage.py normalize_types --dry-run
    python manage.py normalize_types --overwrite
    python manage.py normalize_types --ifc-class IfcSlab
"""

from django.core.management.base import BaseCommand

from apps.entities.models import TypeBankEntry
from apps.entities.services.semantic_normalizer import get_normalizer


class Command(BaseCommand):
    help = 'Auto-normalize TypeBankEntry semantic types using IFC class rules and name patterns'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be normalized without making changes',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Overwrite existing semantic_type assignments',
        )
        parser.add_argument(
            '--ifc-class',
            type=str,
            help='Only normalize entries with this IFC class',
        )
        parser.add_argument(
            '--limit',
            type=int,
            help='Limit number of entries to process',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        overwrite = options['overwrite']
        ifc_class = options.get('ifc_class')
        limit = options.get('limit')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No changes will be made\n'))

        # Build queryset
        queryset = TypeBankEntry.objects.all()

        if not overwrite:
            queryset = queryset.filter(semantic_type__isnull=True)
            self.stdout.write('Processing entries without semantic_type...')
        else:
            self.stdout.write('Processing ALL entries (overwrite mode)...')

        if ifc_class:
            queryset = queryset.filter(ifc_class=ifc_class)
            self.stdout.write(f'Filtering by IFC class: {ifc_class}')

        total_count = queryset.count()
        self.stdout.write(f'Found {total_count} entries to process\n')

        if total_count == 0:
            self.stdout.write(self.style.SUCCESS('No entries to normalize.'))
            return

        if limit:
            queryset = queryset[:limit]
            self.stdout.write(f'Limited to {limit} entries\n')

        normalizer = get_normalizer()

        if dry_run:
            # Dry run - just show what would happen
            stats = {'normalized': 0, 'skipped': 0}

            for entry in queryset[:100]:  # Limit dry run output
                result = normalizer.normalize(entry)
                if result:
                    st, source, conf = result
                    self.stdout.write(
                        f'  {entry.ifc_class}: "{entry.type_name}" -> '
                        f'{st.code} ({st.name_en}) [{source}, {conf:.2f}]'
                    )
                    stats['normalized'] += 1
                else:
                    self.stdout.write(
                        self.style.WARNING(f'  {entry.ifc_class}: "{entry.type_name}" -> (no match)')
                    )
                    stats['skipped'] += 1

            if total_count > 100:
                self.stdout.write(f'\n... and {total_count - 100} more entries')

            self.stdout.write(self.style.SUCCESS(
                f'\nWould normalize: {stats["normalized"]}, Would skip: {stats["skipped"]}'
            ))
        else:
            # Actually normalize
            stats = normalizer.bulk_normalize(queryset, overwrite=overwrite)

            self.stdout.write(self.style.SUCCESS(
                f'\nNormalized: {stats["normalized"]}, Skipped: {stats["skipped"]}'
            ))

        # Show summary by source
        if not dry_run:
            self.stdout.write('\n' + '=' * 60)
            self.stdout.write('Summary by source:')
            for source in ['auto_rule', 'auto_pattern', 'manual', 'verified']:
                count = TypeBankEntry.objects.filter(semantic_type_source=source).count()
                if count > 0:
                    self.stdout.write(f'  {source}: {count}')

            # Show by semantic type
            self.stdout.write('\nTop semantic types assigned:')
            from django.db.models import Count
            top_types = (
                TypeBankEntry.objects
                .filter(semantic_type__isnull=False)
                .values('semantic_type__code', 'semantic_type__name_en')
                .annotate(count=Count('id'))
                .order_by('-count')[:10]
            )
            for t in top_types:
                self.stdout.write(f"  {t['semantic_type__code']} ({t['semantic_type__name_en']}): {t['count']}")
