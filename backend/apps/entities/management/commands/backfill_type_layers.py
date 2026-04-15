"""
Backfill TypeDefinitionLayer rows from parsed IFC data.

Imports the FastAPI parser directly and runs it against an already-uploaded
model's IFC file. Matches parsed types to existing IFCType rows by type_guid,
upserts TypeMapping, wipes the mapping's existing TypeDefinitionLayer rows,
and bulk-inserts fresh layers tagged `notes='__parsed__'`.

Bypasses the FastAPI reprocess endpoint entirely: no delete_model_data, no
TypeBank linking N+1 loop, no orchestrator round-trips. One transaction per
model, a handful of multi-row INSERT statements via Django bulk_create.

Expected runtime: under 30 seconds for any single model regardless of type
count (tested shape: Django bulk_create batches at 1000 rows, so G55_ARK's
~5000 layer rows land in ~5 multi-row INSERTs = seconds).

Usage:
    # Single model, auto-download file from Supabase:
    python manage.py backfill_type_layers --model <uuid>

    # Single model with local file (bypass download):
    python manage.py backfill_type_layers --model <uuid> --file /tmp/foo.ifc

    # Every ready model in a project:
    python manage.py backfill_type_layers --project <uuid>

    # Preview without writing:
    python manage.py backfill_type_layers --model <uuid> --dry-run

    # Remove all __parsed__ layers for a model (reverse):
    python manage.py backfill_type_layers --model <uuid> --clear

Safety:
    - Wipes ALL existing TypeDefinitionLayer rows for matched types (including
      __claude_seed__). Intentional: parsed data supersedes seed data.
    - Never touches TypeMappings that aren't matched by parser output.
    - --dry-run shows the plan without writing.
    - All writes wrapped in a single transaction per model.
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path
from typing import List, Tuple
from urllib.request import urlretrieve

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.entities.models import IFCType, TypeMapping, TypeDefinitionLayer
from apps.models.models import Model
from apps.projects.models import Project


# Make the FastAPI parser importable. The command lives at
#   backend/apps/entities/management/commands/backfill_type_layers.py
# so backend/ifc-service/ is five parents up + 'ifc-service'.
_BACKEND_DIR = Path(__file__).resolve().parents[4]
_IFC_SERVICE_DIR = _BACKEND_DIR / 'ifc-service'
if _IFC_SERVICE_DIR.exists() and str(_IFC_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(_IFC_SERVICE_DIR))

from services.ifc_parser import IFCParserService  # noqa: E402

PARSED_TAG = '__parsed__'


class Command(BaseCommand):
    help = 'Backfill TypeDefinitionLayer rows from parsed IFC data (bypasses reprocess)'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--model', help='Single Model UUID to backfill')
        group.add_argument('--project', help='Project UUID — backfills every ready model in it')

        parser.add_argument(
            '--file',
            help='Local path to IFC file (only valid with --model). '
                 'If omitted, the file is downloaded from Model.file_url.',
        )
        parser.add_argument('--dry-run', action='store_true', help='Report plan without writing')
        parser.add_argument(
            '--clear',
            action='store_true',
            help=f'Remove all TypeDefinitionLayer rows tagged notes={PARSED_TAG!r} for the target model(s) and exit',
        )

    def handle(self, *args, **options):
        model_id = options.get('model')
        project_id = options.get('project')
        local_file = options.get('file')
        dry_run = options.get('dry_run')
        clear = options.get('clear')

        if local_file and project_id:
            raise CommandError('--file is only valid with --model, not --project')

        models = self._resolve_models(model_id, project_id)
        if not models:
            raise CommandError('No matching ready models')

        self.stdout.write(self.style.NOTICE(f'Target: {len(models)} model(s)'))

        if clear:
            self._handle_clear(models, dry_run)
            return

        for idx, model in enumerate(models, start=1):
            self.stdout.write(self.style.NOTICE(f'\n[{idx}/{len(models)}] {model.name} (v{model.version_number}, {model.id})'))
            self._backfill_one(model, local_file if len(models) == 1 else None, dry_run)

    # -------------------------------------------------------------------------
    # Resolve target models
    # -------------------------------------------------------------------------

    def _resolve_models(self, model_id, project_id) -> List[Model]:
        if model_id:
            try:
                model = Model.objects.get(id=model_id)
            except Model.DoesNotExist:
                raise CommandError(f'Model {model_id} does not exist')
            if model.status != 'ready':
                raise CommandError(f'Model {model.name} is not ready (status={model.status})')
            return [model]

        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            raise CommandError(f'Project {project_id} does not exist')
        return list(Model.objects.filter(project=project, status='ready').order_by('file_size'))

    # -------------------------------------------------------------------------
    # Clear path
    # -------------------------------------------------------------------------

    def _handle_clear(self, models, dry_run):
        layer_qs = TypeDefinitionLayer.objects.filter(
            type_mapping__ifc_type__model__in=models,
            notes=PARSED_TAG,
        )
        count = layer_qs.count()
        self.stdout.write(f'{count} TypeDefinitionLayer rows tagged {PARSED_TAG!r} would be removed')

        if dry_run:
            self.stdout.write(self.style.WARNING('[dry-run] No changes written.'))
            return

        if count == 0:
            self.stdout.write(self.style.WARNING('Nothing to clear.'))
            return

        with transaction.atomic():
            deleted, _ = layer_qs.delete()
        self.stdout.write(self.style.SUCCESS(f'Removed {deleted} TypeDefinitionLayer rows'))

    # -------------------------------------------------------------------------
    # Backfill path (per model)
    # -------------------------------------------------------------------------

    def _backfill_one(self, model, local_file, dry_run):
        file_path, cleanup_dir = self._resolve_file(model, local_file)

        try:
            # 1. Parse IFC (types-only, fast path)
            parse_t0 = time.time()
            parser = IFCParserService()
            result = parser.parse_types_only(file_path)
            if not result.success:
                raise CommandError(f'Parse failed: {result.error}')
            parse_dur = time.time() - parse_t0

            types_with_layers = [t for t in result.types if t.definition_layers]
            self.stdout.write(
                f'  parsed {len(result.types)} types in {parse_dur:.2f}s — '
                f'{len(types_with_layers)} have layers'
            )

            if not types_with_layers:
                self.stdout.write(self.style.WARNING('  nothing to backfill'))
                return

            # 2. Match parsed types to existing IFCType rows by type_guid
            # select_related('mapping') prefetches the OneToOne in a single JOIN
            existing_types = {
                t.type_guid: t
                for t in IFCType.objects.filter(model=model).select_related('mapping')
            }

            matched: List[Tuple[IFCType, object]] = []
            unmatched = 0
            for pt in types_with_layers:
                ifc_type = existing_types.get(pt.type_guid)
                if ifc_type:
                    matched.append((ifc_type, pt))
                else:
                    unmatched += 1

            if unmatched:
                self.stdout.write(
                    f'  matched {len(matched)}, unmatched {unmatched} '
                    f'(parser saw synthetic ObjectType GUIDs not in ifc_types table)'
                )

            # 3. Plan the writes
            mappings_to_create = 0
            mappings_to_reuse = 0
            total_layers = 0
            for ifc_type, pt in matched:
                try:
                    _ = ifc_type.mapping  # triggers the SELECT via select_related
                    mappings_to_reuse += 1
                except TypeMapping.DoesNotExist:
                    mappings_to_create += 1
                total_layers += len(pt.definition_layers)

            self.stdout.write(
                f'  plan: {mappings_to_create} new mappings + {mappings_to_reuse} reused, '
                f'{total_layers} layers (all tagged notes={PARSED_TAG!r})'
            )

            if dry_run:
                self.stdout.write(self.style.WARNING('  [dry-run] No changes written.'))
                return

            # 4. Write everything in a single transaction
            write_t0 = time.time()
            with transaction.atomic():
                self._write_mappings_and_layers(matched)
            write_dur = time.time() - write_t0

            self.stdout.write(
                self.style.SUCCESS(
                    f'  wrote {mappings_to_create} new mappings + {total_layers} layers in {write_dur:.2f}s'
                )
            )

        finally:
            if cleanup_dir and os.path.exists(cleanup_dir):
                import shutil
                shutil.rmtree(cleanup_dir, ignore_errors=True)

    def _write_mappings_and_layers(self, matched):
        # Step A: bulk-create missing TypeMappings
        new_mappings = []
        for ifc_type, pt in matched:
            try:
                ifc_type.mapping  # noqa: B018
            except TypeMapping.DoesNotExist:
                new_mappings.append(TypeMapping(
                    ifc_type=ifc_type,
                    representative_unit=pt.representative_unit or 'm2',
                    mapping_status='pending',
                    verification_status='pending',
                    type_category='specific',
                    notes='Parsed from IFC',
                ))
        if new_mappings:
            TypeMapping.objects.bulk_create(new_mappings, batch_size=500)

        # Step B: re-fetch all mappings for the matched types in one query
        type_ids = [it.id for it, _ in matched]
        mappings_map = {
            tm.ifc_type_id: tm
            for tm in TypeMapping.objects.filter(ifc_type_id__in=type_ids)
        }

        # Step C: wipe existing TypeDefinitionLayer rows for these mappings.
        # Intentional: parsed data supersedes __claude_seed__ data. Users who
        # want to preserve seed should not run this command.
        mapping_ids = [tm.id for tm in mappings_map.values()]
        TypeDefinitionLayer.objects.filter(type_mapping_id__in=mapping_ids).delete()

        # Step D: bulk-create the new layers. Django batches this into
        # multi-row INSERTs of batch_size rows each, so a 5000-layer model
        # lands in ~5 round-trips instead of 5000.
        new_layers = []
        for ifc_type, pt in matched:
            tm = mappings_map.get(ifc_type.id)
            if not tm:
                continue
            for layer in pt.definition_layers:
                new_layers.append(TypeDefinitionLayer(
                    type_mapping=tm,
                    layer_order=layer.layer_order,
                    material_name=layer.material_name[:255],
                    thickness_mm=layer.thickness_mm,
                    quantity_per_unit=layer.quantity_per_unit,
                    material_unit=layer.material_unit,
                    notes=PARSED_TAG,
                ))
        if new_layers:
            TypeDefinitionLayer.objects.bulk_create(new_layers, batch_size=1000)

    # -------------------------------------------------------------------------
    # File resolution
    # -------------------------------------------------------------------------

    def _resolve_file(self, model, local_file) -> Tuple[str, str | None]:
        """Return (file_path, cleanup_dir). cleanup_dir is non-None only for downloads."""
        if local_file:
            if not os.path.exists(local_file):
                raise CommandError(f'Local file not found: {local_file}')
            return local_file, None

        # Prefer a /tmp cache if one exists with the expected filename
        cached = f'/tmp/{model.name}.ifc'
        if os.path.exists(cached):
            self.stdout.write(f'  using cached {cached}')
            return cached, None

        if not model.file_url:
            raise CommandError(
                f'Model {model.name} has no file_url and no local --file given'
            )

        # Download to a temp dir and clean up after use
        tmpdir = tempfile.mkdtemp(prefix='backfill_')
        dest = os.path.join(tmpdir, f'{model.name}.ifc')
        self.stdout.write(f'  downloading {model.file_url[:80]}... → {dest}')
        t0 = time.time()
        urlretrieve(model.file_url, dest)
        self.stdout.write(f'  download: {(os.path.getsize(dest) / 1024 / 1024):.1f}MB in {time.time() - t0:.1f}s')
        return dest, tmpdir
