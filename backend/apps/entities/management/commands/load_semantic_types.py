"""
Management command to load semantic types from PA0802/NS3451 definitions.

Usage:
    python manage.py load_semantic_types
    python manage.py load_semantic_types --clear  # Clear existing data first
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.entities.models import SemanticType, SemanticTypeIFCMapping
from apps.entities.services.semantic_data import INITIAL_SEMANTIC_TYPES, IFC_MISUSE_MAPPINGS


class Command(BaseCommand):
    help = 'Load semantic types from PA0802/NS3451 definitions'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing semantic types and mappings before loading',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be loaded without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        clear = options['clear']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No changes will be made\n'))

        # Clear existing data if requested
        if clear and not dry_run:
            self.stdout.write('Clearing existing data...')
            SemanticTypeIFCMapping.objects.all().delete()
            SemanticType.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('  Cleared existing semantic types and mappings'))

        # Load semantic types
        self.stdout.write('\nLoading semantic types...')
        types_created = 0
        types_updated = 0

        with transaction.atomic():
            for data in INITIAL_SEMANTIC_TYPES:
                if dry_run:
                    self.stdout.write(f"  Would create/update: {data['code']} - {data['name_en']}")
                    types_created += 1
                    continue

                obj, was_created = SemanticType.objects.update_or_create(
                    code=data['code'],
                    defaults={
                        'name_no': data['name_no'],
                        'name_en': data['name_en'],
                        'category': data['category'],
                        'canonical_ifc_class': data['canonical_ifc_class'],
                        'alternative_ifc_classes': data.get('alternative_ifc_classes', []),
                        'suggested_ns3451_codes': data.get('suggested_ns3451_codes', []),
                        'name_patterns': data.get('name_patterns', []),
                        'description': data.get('description', ''),
                    }
                )
                if was_created:
                    types_created += 1
                    self.stdout.write(f"  Created: {data['code']} - {data['name_en']}")
                else:
                    types_updated += 1
                    self.stdout.write(f"  Updated: {data['code']} - {data['name_en']}")

        self.stdout.write(self.style.SUCCESS(
            f'\nSemantic types: {types_created} created, {types_updated} updated'
        ))

        # Load IFC mappings
        self.stdout.write('\nLoading IFC class mappings...')
        mappings_created = 0
        mappings_updated = 0
        mappings_skipped = 0

        with transaction.atomic():
            for mapping_data in IFC_MISUSE_MAPPINGS:
                semantic_type_code = mapping_data['semantic_type']

                if dry_run:
                    self.stdout.write(
                        f"  Would map: {mapping_data['ifc_class']} -> {semantic_type_code}"
                        f" (primary={mapping_data.get('is_primary', False)})"
                    )
                    mappings_created += 1
                    continue

                try:
                    semantic_type = SemanticType.objects.get(code=semantic_type_code)
                except SemanticType.DoesNotExist:
                    self.stdout.write(self.style.WARNING(
                        f"  Skipped: {mapping_data['ifc_class']} -> {semantic_type_code} "
                        f"(semantic type not found)"
                    ))
                    mappings_skipped += 1
                    continue

                obj, was_created = SemanticTypeIFCMapping.objects.update_or_create(
                    semantic_type=semantic_type,
                    ifc_class=mapping_data['ifc_class'],
                    predefined_type=mapping_data.get('predefined_type', ''),
                    defaults={
                        'is_primary': mapping_data.get('is_primary', False),
                        'is_common_misuse': mapping_data.get('is_common_misuse', False),
                        'confidence_hint': mapping_data.get('confidence_hint', 0.5),
                        'note': mapping_data.get('note', ''),
                    }
                )
                if was_created:
                    mappings_created += 1
                else:
                    mappings_updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nIFC mappings: {mappings_created} created, {mappings_updated} updated, '
            f'{mappings_skipped} skipped'
        ))

        # Summary
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('Summary:'))
        self.stdout.write(f'  Semantic Types: {SemanticType.objects.count()} total')
        self.stdout.write(f'  IFC Mappings: {SemanticTypeIFCMapping.objects.count()} total')

        # Show categories
        self.stdout.write('\nCategories:')
        categories = SemanticType.objects.values_list('category', flat=True).distinct()
        for cat in sorted(categories):
            count = SemanticType.objects.filter(category=cat).count()
            self.stdout.write(f'  {cat}: {count} types')
