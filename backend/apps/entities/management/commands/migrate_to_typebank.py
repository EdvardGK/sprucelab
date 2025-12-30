"""
Management command to migrate TypeMapping data to the new TypeBank system.

This is a one-time migration that:
1. Creates TypeBankEntry for each unique (ifc_class, type_name, predefined_type, material) tuple
2. Creates TypeBankObservation linking each IFCType to its TypeBankEntry
3. Copies NS3451 labels, representative_unit, and other metadata from TypeMapping

Run with:
    python manage.py migrate_to_typebank

Options:
    --dry-run       Preview what would be migrated without making changes
    --model-id      Only migrate a specific model (for testing)
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from apps.entities.models import (
    IFCType, TypeMapping, TypeBankEntry, TypeBankObservation
)


class Command(BaseCommand):
    help = 'Migrate TypeMapping data to TypeBank system'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview migration without making changes',
        )
        parser.add_argument(
            '--model-id',
            type=str,
            help='Only migrate a specific model (UUID)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        model_id = options.get('model_id')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No changes will be made\n'))

        # Get IFCTypes with their mappings
        queryset = IFCType.objects.select_related(
            'mapping', 'mapping__ns3451', 'model'
        ).annotate(
            instance_count=Count('assignments')
        )

        if model_id:
            queryset = queryset.filter(model_id=model_id)
            self.stdout.write(f'Filtering to model: {model_id}')

        total_types = queryset.count()
        self.stdout.write(f'Found {total_types} IFCType records to process')

        # Track statistics
        stats = {
            'entries_created': 0,
            'entries_reused': 0,
            'observations_created': 0,
            'labels_migrated': 0,
            'skipped_no_type_name': 0,
        }

        # Group types by identity tuple
        type_groups = {}
        for ifc_type in queryset:
            # Build identity tuple from IfcTypeObject attributes only
            identity = (
                ifc_type.ifc_type,  # ifc_class
                ifc_type.type_name or '',  # type_name
                ifc_type.predefined_type or 'NOTDEFINED',  # predefined_type
                self._extract_material(ifc_type),  # material
            )

            if identity not in type_groups:
                type_groups[identity] = []
            type_groups[identity].append(ifc_type)

        self.stdout.write(f'Consolidated into {len(type_groups)} unique type identities\n')

        if dry_run:
            # Just report what would be done
            self._report_dry_run(type_groups, stats)
            return

        # Perform actual migration
        with transaction.atomic():
            self._migrate_types(type_groups, stats)

        # Report results
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('Migration Complete'))
        self.stdout.write('=' * 60)
        self.stdout.write(f"TypeBankEntry created:    {stats['entries_created']}")
        self.stdout.write(f"TypeBankEntry reused:     {stats['entries_reused']}")
        self.stdout.write(f"Observations created:     {stats['observations_created']}")
        self.stdout.write(f"Labels migrated:          {stats['labels_migrated']}")
        self.stdout.write(f"Skipped (no type_name):   {stats['skipped_no_type_name']}")

    def _extract_material(self, ifc_type):
        """Extract primary material from type properties."""
        if not ifc_type.properties:
            return ''

        # Look for material in common property locations
        props = ifc_type.properties
        material = ''

        # Try different property paths
        for key in ['Material', 'material', 'StructuralMaterial', 'StructuralMaterialType']:
            if key in props:
                material = str(props[key])
                break

        # Check nested material properties
        if not material and 'HasMaterialProperties' in props:
            mat_props = props['HasMaterialProperties']
            if isinstance(mat_props, dict) and 'Name' in mat_props:
                material = mat_props['Name']

        return material[:255] if material else ''

    def _report_dry_run(self, type_groups, stats):
        """Report what would be migrated in dry-run mode."""
        self.stdout.write('\nWould create the following TypeBankEntry records:')
        self.stdout.write('-' * 80)

        for identity, ifc_types in list(type_groups.items())[:20]:  # Show first 20
            ifc_class, type_name, predefined_type, material = identity
            instance_count = sum(t.instance_count for t in ifc_types)
            model_count = len(set(t.model_id for t in ifc_types))

            # Check if any has mapping
            has_mapping = any(hasattr(t, 'mapping') and t.mapping for t in ifc_types)
            ns3451 = ''
            if has_mapping:
                for t in ifc_types:
                    if hasattr(t, 'mapping') and t.mapping and t.mapping.ns3451_code:
                        ns3451 = t.mapping.ns3451_code
                        break

            self.stdout.write(
                f'  {ifc_class:25} | {type_name[:30]:30} | '
                f'{predefined_type:12} | inst:{instance_count:4} | '
                f'models:{model_count:2} | NS3451:{ns3451}'
            )

        if len(type_groups) > 20:
            self.stdout.write(f'\n  ... and {len(type_groups) - 20} more entries')

        self.stdout.write('\n' + self.style.SUCCESS('Dry run complete. Use without --dry-run to migrate.'))

    def _migrate_types(self, type_groups, stats):
        """Perform actual migration of types to TypeBank."""
        for identity, ifc_types in type_groups.items():
            ifc_class, type_name, predefined_type, material = identity

            # Get or create TypeBankEntry
            entry, created = TypeBankEntry.objects.get_or_create(
                ifc_class=ifc_class,
                type_name=type_name,
                predefined_type=predefined_type,
                material=material,
                defaults={
                    'mapping_status': 'pending',
                    'created_by': 'migrate_to_typebank',
                }
            )

            if created:
                stats['entries_created'] += 1
            else:
                stats['entries_reused'] += 1

            # Track aggregated stats
            total_instances = 0
            model_ids = set()

            # Copy labels from first TypeMapping with labels
            best_mapping = None
            for ifc_type in ifc_types:
                if hasattr(ifc_type, 'mapping') and ifc_type.mapping:
                    if ifc_type.mapping.ns3451_code or ifc_type.mapping.mapping_status == 'mapped':
                        best_mapping = ifc_type.mapping
                        break

            if best_mapping and not entry.ns3451_code:
                # Migrate labels to TypeBankEntry
                entry.ns3451_code = best_mapping.ns3451_code
                entry.ns3451 = best_mapping.ns3451
                entry.discipline = best_mapping.discipline
                entry.representative_unit = best_mapping.representative_unit
                entry.notes = best_mapping.notes
                entry.mapping_status = best_mapping.mapping_status
                entry.confidence = best_mapping.confidence
                stats['labels_migrated'] += 1

            # Create observations for each IFCType
            for ifc_type in ifc_types:
                # Create observation
                obs, obs_created = TypeBankObservation.objects.get_or_create(
                    type_bank_entry=entry,
                    source_type=ifc_type,
                    defaults={
                        'source_model': ifc_type.model,
                        'instance_count': ifc_type.instance_count,
                        'observed_at': timezone.now(),
                    }
                )

                if obs_created:
                    stats['observations_created'] += 1
                    total_instances += ifc_type.instance_count
                    model_ids.add(ifc_type.model_id)

            # Update aggregated stats on entry
            entry.total_instance_count = TypeBankObservation.objects.filter(
                type_bank_entry=entry
            ).aggregate(total=Count('instance_count'))['total'] or 0

            entry.source_model_count = TypeBankObservation.objects.filter(
                type_bank_entry=entry
            ).values('source_model').distinct().count()

            entry.save()
