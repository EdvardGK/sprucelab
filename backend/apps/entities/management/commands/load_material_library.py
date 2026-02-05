"""
Management command to load canonical MaterialLibrary entries from JSON config.

Reads from apps/entities/data/enova_materials.json (or custom path).

Usage:
    python manage.py load_material_library
    python manage.py load_material_library --clear
    python manage.py load_material_library --file /path/to/custom.json
    python manage.py load_material_library --dry-run
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from apps.entities.models import MaterialLibrary


class Command(BaseCommand):
    help = 'Load canonical MaterialLibrary entries from JSON config file'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='Path to JSON config file (default: apps/entities/data/enova_materials.json)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing MaterialLibrary entries before loading',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without modifying the database',
        )

    def handle(self, *args, **options):
        clear = options['clear']
        dry_run = options['dry_run']
        config_file = options.get('file')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - no changes will be made'))

        # Resolve config file path
        if config_file:
            config_path = Path(config_file)
        else:
            # Default: relative to this file's app directory
            app_dir = Path(__file__).resolve().parent.parent.parent
            config_path = app_dir / 'data' / 'enova_materials.json'

        if not config_path.exists():
            raise CommandError(f'Config file not found: {config_path}')

        self.stdout.write(f'Loading materials from: {config_path}')

        # Load JSON config
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        materials = config.get('materials', [])
        meta = config.get('_meta', {})

        if meta:
            self.stdout.write(f"Config version: {meta.get('version', 'unknown')}")
            self.stdout.write(f"Source: {meta.get('source', 'unknown')}")

        if not materials:
            raise CommandError('No materials found in config file')

        self.stdout.write(f'Found {len(materials)} materials in config')

        # Clear if requested
        if clear:
            if dry_run:
                count = MaterialLibrary.objects.count()
                self.stdout.write(f'Would delete {count} existing MaterialLibrary entries')
            else:
                deleted, _ = MaterialLibrary.objects.all().delete()
                self.stdout.write(f'Deleted {deleted} existing MaterialLibrary entries')

        created_count = 0
        updated_count = 0
        errors = []

        for material in materials:
            category = material.get('category')
            if not category:
                errors.append(f"Missing category in material: {material}")
                continue

            try:
                existing = MaterialLibrary.objects.filter(category=category).first()

                material_data = {
                    'name': material.get('name', ''),
                    'unit': material.get('unit', 'm3'),
                    'density_kg_m3': material.get('density_kg_m3'),
                    'gwp_a1_a3': material.get('gwp_a1_a3'),
                    'reduzer_product_id': material.get('reduzer_product_id'),
                    'reduzer_product_id_type': material.get('reduzer_product_id_type'),
                    'description': material.get('name_en', ''),
                    'source': 'enova',
                }

                if existing:
                    if dry_run:
                        self.stdout.write(f'  Would update: {category}')
                    else:
                        for key, value in material_data.items():
                            setattr(existing, key, value)
                        existing.save()
                    updated_count += 1
                else:
                    if dry_run:
                        self.stdout.write(f'  Would create: {category}')
                    else:
                        MaterialLibrary.objects.create(
                            category=category,
                            **material_data
                        )
                    created_count += 1

            except Exception as e:
                errors.append(f"Error processing {category}: {e}")

        # Summary
        self.stdout.write('')
        if errors:
            for error in errors:
                self.stdout.write(self.style.ERROR(f'  {error}'))

        self.stdout.write(self.style.SUCCESS(
            f'Done! Created: {created_count}, Updated: {updated_count}, Errors: {len(errors)}'
        ))

        if not dry_run:
            total = MaterialLibrary.objects.count()
            self.stdout.write(f'Total MaterialLibrary entries: {total}')
