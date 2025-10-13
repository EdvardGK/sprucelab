"""
Management command to load built-in scripts into the database.

Usage:
    python manage.py load_builtin_scripts
"""
from django.core.management.base import BaseCommand
from pathlib import Path
from apps.scripting.models import Script


class Command(BaseCommand):
    help = 'Load built-in scripts into the database'

    def handle(self, *args, **options):
        builtin_dir = Path(__file__).resolve().parent.parent.parent / 'builtin'

        scripts = [
            {
                'name': 'Export Elements to CSV',
                'description': 'Exports all entities with their properties to CSV format. '
                               'Can filter by IFC type and optionally include property sets.',
                'file': 'export_csv.py',
                'category': 'export',
                'parameters_schema': {
                    'type': 'object',
                    'properties': {
                        'include_properties': {
                            'type': 'boolean',
                            'default': True,
                            'description': 'Include property sets in export'
                        },
                        'filter_type': {
                            'type': 'string',
                            'description': 'Filter by IFC type (e.g. "IfcWall")'
                        }
                    }
                }
            },
            {
                'name': 'GUID Validation Check',
                'description': 'Validates IFC GUIDs for duplicates and invalid formats. '
                               'Checks that all GUIDs are unique and follow the 22-character base64 format.',
                'file': 'guid_validator.py',
                'category': 'validation',
                'parameters_schema': {}
            },
            {
                'name': 'LOD Analyzer',
                'description': 'Analyzes Level of Development (LOD) for each element type. '
                               'Calculates LOD scores based on geometry presence and property completeness. '
                               'Classifies elements as LOD 100/200/300.',
                'file': 'lod_analyzer.py',
                'category': 'analysis',
                'parameters_schema': {}
            },
            {
                'name': 'QTO Analyzer',
                'description': 'Quantity Take-Off analysis for construction estimation. '
                               'Calculates volumes (m³), areas (m²), counts, and lengths (m) for all elements. '
                               'Groups quantities by material, type, storey, and system.',
                'file': 'qto_analyzer.py',
                'category': 'analysis',
                'parameters_schema': {}
            },
            {
                'name': 'MMI Analyzer',
                'description': 'Model Maturity Index (MMI) analysis based on Norwegian buildingSMART standards. '
                               'Evaluates geometry detail and information completeness on a 1-7 scale. '
                               'Identifies elements below target MMI and provides gap analysis.',
                'file': 'mmi_analyzer.py',
                'category': 'analysis',
                'parameters_schema': {}
            },
        ]

        loaded_count = 0

        for script_data in scripts:
            script_file = builtin_dir / script_data['file']

            if not script_file.exists():
                self.stdout.write(self.style.ERROR(f"File not found: {script_file}"))
                continue

            with open(script_file, 'r', encoding='utf-8') as f:
                code = f.read()

            # Create or update script
            script, created = Script.objects.update_or_create(
                name=script_data['name'],
                defaults={
                    'description': script_data['description'],
                    'code': code,
                    'category': script_data['category'],
                    'parameters_schema': script_data['parameters_schema'],
                    'script_type': 'python',
                    'is_public': True,
                    'author_name': 'System',
                }
            )

            action = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f"{action}: {script.name}"))
            loaded_count += 1

        self.stdout.write(self.style.SUCCESS(f"\n✅ Loaded {loaded_count} built-in scripts (3 original + 2 dashboard scripts)"))
