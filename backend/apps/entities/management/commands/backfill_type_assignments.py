"""
Backfill Type Assignments for Existing Models

This command populates the TypeAssignment table for models that were
parsed before this relationship was extracted.

Usage:
    python manage.py backfill_type_assignments
    python manage.py backfill_type_assignments --model=<model_id>
"""
import os
import ifcopenshell
from django.conf import settings
from django.core.management.base import BaseCommand
from apps.models.models import Model
from apps.entities.models import IFCEntity, IFCType, TypeAssignment


class Command(BaseCommand):
    help = 'Backfill TypeAssignment records for existing models'

    def add_arguments(self, parser):
        parser.add_argument(
            '--model',
            type=str,
            help='Specific model ID to backfill (optional)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes'
        )

    def handle(self, *args, **options):
        model_id = options.get('model')
        dry_run = options.get('dry_run', False)

        if model_id:
            models = Model.objects.filter(id=model_id)
        else:
            # Only get models that have been parsed and have a file
            models = Model.objects.filter(
                parsing_status='parsed'
            ).exclude(file_url__isnull=True).exclude(file_url='')

        total_created = 0

        for model in models:
            self.stdout.write(f"\n{'='*60}")
            self.stdout.write(f"Processing: {model.name} ({model.id})")

            # Check if model has IFC file
            if not model.file_url:
                self.stdout.write(self.style.WARNING("  No IFC file, skipping"))
                continue

            # Check current state
            existing_count = TypeAssignment.objects.filter(
                entity__model=model
            ).count()

            if existing_count > 0:
                self.stdout.write(
                    self.style.SUCCESS(f"  Already has {existing_count} type assignments, skipping")
                )
                continue

            # Construct file path from file_url
            # file_url is like /media/ifc_files/uuid/filename.ifc
            file_path = model.file_url.lstrip('/')
            if file_path.startswith('media/'):
                file_path = os.path.join(settings.MEDIA_ROOT, file_path[6:])
            else:
                file_path = os.path.join(settings.MEDIA_ROOT, file_path)

            if not os.path.exists(file_path):
                self.stdout.write(self.style.WARNING(f"  File not found: {file_path}"))
                continue

            # Load IFC file
            try:
                ifc_file = ifcopenshell.open(file_path)
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Failed to open IFC: {e}"))
                continue

            # Build lookup dictionaries
            entity_by_guid = {
                e.ifc_guid: e for e in IFCEntity.objects.filter(model=model)
            }
            type_by_guid = {
                t.type_guid: t for t in IFCType.objects.filter(model=model)
            }

            self.stdout.write(f"  Entities: {len(entity_by_guid)}")
            self.stdout.write(f"  Types: {len(type_by_guid)}")

            # Process IfcRelDefinesByType relationships
            count = 0
            for rel in ifc_file.by_type('IfcRelDefinesByType'):
                relating_type = rel.RelatingType
                if not relating_type or not hasattr(relating_type, 'GlobalId'):
                    continue

                type_guid = relating_type.GlobalId
                ifc_type_obj = type_by_guid.get(type_guid)

                if not ifc_type_obj:
                    continue

                related_objects = rel.RelatedObjects or []

                for element in related_objects:
                    if not hasattr(element, 'GlobalId'):
                        continue

                    entity = entity_by_guid.get(element.GlobalId)
                    if not entity:
                        continue

                    if not dry_run:
                        TypeAssignment.objects.get_or_create(
                            entity=entity,
                            type=ifc_type_obj,
                        )
                    count += 1

            self.stdout.write(
                self.style.SUCCESS(f"  {'Would create' if dry_run else 'Created'}: {count} type assignments")
            )
            total_created += count

        self.stdout.write(f"\n{'='*60}")
        self.stdout.write(
            self.style.SUCCESS(
                f"Total: {'Would create' if dry_run else 'Created'} {total_created} type assignments"
            )
        )
