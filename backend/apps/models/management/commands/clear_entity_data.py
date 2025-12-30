"""
Management command to clear entity data while preserving projects, models, and types.

Usage:
    python manage.py clear_entity_data
    python manage.py clear_entity_data --confirm

This will delete:
- All property sets
- All type assignments
- All material assignments
- All system memberships
- All spatial hierarchy records
- All IFC entities

This will KEEP:
- Projects
- Models (just the metadata)
- IFC Types (for TypeBank)
- TypeBank entries and observations
- Materials (library)
- Systems (library)
- Processing reports

Part of the simplified architecture migration where we no longer store
individual entity records - viewer queries IFC directly via FastAPI.
"""
from django.core.management.base import BaseCommand
from django.db import transaction, connection
from apps.entities.models import (
    IFCEntity, PropertySet, SpatialHierarchy, TypeAssignment,
    MaterialAssignment, SystemMembership
)


class Command(BaseCommand):
    help = 'Clear entity data (preserves projects, models, and types)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirm deletion without prompting',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            self.stdout.write(
                self.style.WARNING('\nThis will delete all entity data:\n')
            )
            self.stdout.write('  - Property sets\n')
            self.stdout.write('  - Type assignments\n')
            self.stdout.write('  - Material assignments\n')
            self.stdout.write('  - System memberships\n')
            self.stdout.write('  - Spatial hierarchy\n')
            self.stdout.write('  - IFC entities\n')
            self.stdout.write('\n')
            self.stdout.write(self.style.SUCCESS('Projects, Models, Types, and TypeBank will be PRESERVED.\n'))
            self.stdout.write('\n')

            confirm = input('Type "DELETE ENTITIES" to confirm: ')
            if confirm != 'DELETE ENTITIES':
                self.stdout.write(self.style.ERROR('Aborted\n'))
                return

        self.stdout.write('\nStarting entity data cleanup...\n')

        try:
            # Count before deletion
            entity_count = IFCEntity.objects.count()
            property_count = PropertySet.objects.count()
            type_assignment_count = TypeAssignment.objects.count()
            spatial_count = SpatialHierarchy.objects.count()

            self.stdout.write(f'Found:')
            self.stdout.write(f'  - {entity_count} entities')
            self.stdout.write(f'  - {property_count} properties')
            self.stdout.write(f'  - {type_assignment_count} type assignments')
            self.stdout.write(f'  - {spatial_count} spatial hierarchy records')
            self.stdout.write('\n')

            if entity_count == 0:
                self.stdout.write(self.style.SUCCESS('No entity data to delete.\n'))
                return

            # Use raw SQL for faster deletion (TRUNCATE or DELETE)
            with connection.cursor() as cursor:
                self.stdout.write('Deleting property sets...')
                cursor.execute('DELETE FROM property_sets')
                self.stdout.write(f'  Deleted {cursor.rowcount} rows')

                self.stdout.write('Deleting type assignments...')
                cursor.execute('DELETE FROM type_assignments')
                self.stdout.write(f'  Deleted {cursor.rowcount} rows')

                self.stdout.write('Deleting material assignments...')
                cursor.execute('DELETE FROM material_assignments')
                self.stdout.write(f'  Deleted {cursor.rowcount} rows')

                self.stdout.write('Deleting system memberships...')
                cursor.execute('DELETE FROM system_memberships')
                self.stdout.write(f'  Deleted {cursor.rowcount} rows')

                self.stdout.write('Deleting spatial hierarchy...')
                cursor.execute('DELETE FROM spatial_hierarchy')
                self.stdout.write(f'  Deleted {cursor.rowcount} rows')

                self.stdout.write('Deleting IFC entities...')
                cursor.execute('DELETE FROM ifc_entities')
                self.stdout.write(f'  Deleted {cursor.rowcount} rows')

            self.stdout.write('\n')
            self.stdout.write(self.style.SUCCESS('Entity data cleared successfully!\n'))
            self.stdout.write(f'\nDeleted:')
            self.stdout.write(f'  - {entity_count} entities')
            self.stdout.write(f'  - {property_count} properties')
            self.stdout.write(f'  - {type_assignment_count} type assignments')
            self.stdout.write(f'  - {spatial_count} spatial hierarchy records')
            self.stdout.write('\n')
            self.stdout.write(self.style.SUCCESS('Types and TypeBank data preserved.\n'))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\nError clearing entity data: {str(e)}\n'))
            raise
