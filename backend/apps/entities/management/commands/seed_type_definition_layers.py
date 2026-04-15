"""
Dev/test seed command for TypeDefinitionLayer.

Populates realistic synthetic material layer recipes for a project's existing
types, keyed by IFC class. Used to test the Materials Browser, Type Browser
material display, Balance Sheet, and downstream LCA/procurement features without
manual classification via the UI.

All rows created by this command are tagged `notes='__claude_seed__'` so they
can be unambiguously removed with `--clear`.

Usage:
    python manage.py seed_type_definition_layers --project <project_id>
    python manage.py seed_type_definition_layers --project <project_id> --clear
    python manage.py seed_type_definition_layers --project <project_id> --dry-run
    python manage.py seed_type_definition_layers --project <project_id> --limit 50

Safety:
    - Writes to the same database Django is configured against
    - In this codebase, .env.local points at production Supabase — run with care
    - --dry-run shows what would be created without writing
    - Rows are reversibly removable via --clear
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.entities.models import (
    IFCType,
    TypeDefinitionLayer,
    TypeMapping,
)
from apps.models.models import Model
from apps.projects.models import Project


SEED_TAG = "__claude_seed__"


@dataclass(frozen=True)
class LayerSpec:
    """A single layer in a recipe."""

    order: int
    material: str
    thickness_mm: float | None
    quantity_per_unit: float
    unit: str  # 'm2' | 'm' | 'm3' | 'kg' | 'pcs'
    ns3457_code: str | None = None


@dataclass(frozen=True)
class Recipe:
    """A typical material sandwich for a given IFC class family."""

    ifc_types: tuple[str, ...]
    representative_unit: str
    layers: tuple[LayerSpec, ...]


# =============================================================================
# RECIPE LIBRARY
#
# Norwegian-typical material recipes for common IFC types. Keyed on IFC class.
# These are approximate but realistic — a wall is gypsum + mineral wool + concrete,
# a slab is screed + concrete + insulation, etc. Layer order: 1 = outermost / topmost.
# Quantities are "per unit of type" (per m², per m, per pcs).
# =============================================================================

RECIPES: tuple[Recipe, ...] = (
    # --- External walls (heavy): concrete + insulation + outer cladding ---
    Recipe(
        ifc_types=("IfcWallType",),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Fasadeplate", thickness_mm=12.0, quantity_per_unit=1.02, unit="m2", ns3457_code="9"),
            LayerSpec(order=2, material="Mineralull fasade", thickness_mm=150.0, quantity_per_unit=0.15, unit="m3", ns3457_code="7"),
            LayerSpec(order=3, material="Betong B30 plasstøpt", thickness_mm=200.0, quantity_per_unit=0.2, unit="m3", ns3457_code="1"),
            LayerSpec(order=4, material="Gipsplate 13mm", thickness_mm=13.0, quantity_per_unit=1.02, unit="m2", ns3457_code="6"),
        ),
    ),
    # --- Internal partitions: lightweight wall ---
    Recipe(
        ifc_types=("IfcWallStandardCaseType",),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Gipsplate 13mm", thickness_mm=13.0, quantity_per_unit=1.05, unit="m2", ns3457_code="6"),
            LayerSpec(order=2, material="Mineralull innervegg 70mm", thickness_mm=70.0, quantity_per_unit=0.07, unit="m3", ns3457_code="7"),
            LayerSpec(order=3, material="Stålstender 70mm", thickness_mm=70.0, quantity_per_unit=1.8, unit="kg", ns3457_code="3"),
            LayerSpec(order=4, material="Gipsplate 13mm", thickness_mm=13.0, quantity_per_unit=1.05, unit="m2", ns3457_code="6"),
        ),
    ),
    # --- Slabs / floors ---
    Recipe(
        ifc_types=("IfcSlabType",),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Avretting 40mm", thickness_mm=40.0, quantity_per_unit=0.04, unit="m3", ns3457_code="9"),
            LayerSpec(order=2, material="EPS trinnlyd 30mm", thickness_mm=30.0, quantity_per_unit=0.03, unit="m3", ns3457_code="7"),
            LayerSpec(order=3, material="Betong B35 plasstøpt", thickness_mm=250.0, quantity_per_unit=0.25, unit="m3", ns3457_code="1"),
            LayerSpec(order=4, material="Armering B500NC", thickness_mm=None, quantity_per_unit=18.0, unit="kg", ns3457_code="3"),
        ),
    ),
    # --- Roofs ---
    Recipe(
        ifc_types=("IfcRoofType",),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Takbelegg PVC", thickness_mm=2.0, quantity_per_unit=1.05, unit="m2", ns3457_code="8"),
            LayerSpec(order=2, material="Mineralull takisolasjon 250mm", thickness_mm=250.0, quantity_per_unit=0.25, unit="m3", ns3457_code="7"),
            LayerSpec(order=3, material="Dampsperre PE", thickness_mm=0.2, quantity_per_unit=1.05, unit="m2", ns3457_code="8"),
            LayerSpec(order=4, material="Betong B30 plasstøpt", thickness_mm=200.0, quantity_per_unit=0.2, unit="m3", ns3457_code="1"),
        ),
    ),
    # --- Columns ---
    Recipe(
        ifc_types=("IfcColumnType",),
        representative_unit="m",
        layers=(
            LayerSpec(order=1, material="Betong B45 plasstøpt", thickness_mm=None, quantity_per_unit=0.09, unit="m3", ns3457_code="1"),
            LayerSpec(order=2, material="Armering B500NC", thickness_mm=None, quantity_per_unit=12.0, unit="kg", ns3457_code="3"),
        ),
    ),
    # --- Beams ---
    Recipe(
        ifc_types=("IfcBeamType",),
        representative_unit="m",
        layers=(
            LayerSpec(order=1, material="Konstruksjonsstål S355", thickness_mm=None, quantity_per_unit=48.5, unit="kg", ns3457_code="3"),
        ),
    ),
    # --- Windows ---
    Recipe(
        ifc_types=("IfcWindowType", "IfcWindowStyle"),
        representative_unit="pcs",
        layers=(
            LayerSpec(order=1, material="Aluminium profil", thickness_mm=None, quantity_per_unit=12.0, unit="kg", ns3457_code="3"),
            LayerSpec(order=2, material="3-lags isolerglass", thickness_mm=44.0, quantity_per_unit=2.4, unit="m2", ns3457_code="5"),
        ),
    ),
    # --- Doors ---
    Recipe(
        ifc_types=("IfcDoorType", "IfcDoorStyle"),
        representative_unit="pcs",
        layers=(
            LayerSpec(order=1, material="Treverk eik", thickness_mm=40.0, quantity_per_unit=0.08, unit="m3", ns3457_code="2"),
            LayerSpec(order=2, material="Aluminium beslag", thickness_mm=None, quantity_per_unit=1.5, unit="kg", ns3457_code="3"),
        ),
    ),
    # --- Plates (flate) ---
    Recipe(
        ifc_types=("IfcPlateType",),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Stålplate", thickness_mm=8.0, quantity_per_unit=62.8, unit="kg", ns3457_code="3"),
        ),
    ),
    # --- Pipes ---
    Recipe(
        ifc_types=("IfcPipeSegmentType", "IfcPipeFittingType"),
        representative_unit="m",
        layers=(
            LayerSpec(order=1, material="PE-rør", thickness_mm=None, quantity_per_unit=1.0, unit="m", ns3457_code="8"),
        ),
    ),
    # --- Ducts ---
    Recipe(
        ifc_types=("IfcDuctSegmentType", "IfcDuctFittingType"),
        representative_unit="m",
        layers=(
            LayerSpec(order=1, material="Stålkanal galvanisert", thickness_mm=None, quantity_per_unit=8.5, unit="kg", ns3457_code="3"),
        ),
    ),
    # --- Curtain walls ---
    Recipe(
        ifc_types=("IfcCurtainWallType",),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Aluminium profil curtain wall", thickness_mm=None, quantity_per_unit=15.0, unit="kg", ns3457_code="3"),
            LayerSpec(order=2, material="3-lags isolerglass fasade", thickness_mm=44.0, quantity_per_unit=1.0, unit="m2", ns3457_code="5"),
            LayerSpec(order=3, material="Fugemasse silikon", thickness_mm=None, quantity_per_unit=0.3, unit="kg", ns3457_code="9"),
        ),
    ),
    # --- Railings ---
    Recipe(
        ifc_types=("IfcRailingType",),
        representative_unit="m",
        layers=(
            LayerSpec(order=1, material="Rustfritt stål rekkverk", thickness_mm=None, quantity_per_unit=6.2, unit="kg", ns3457_code="3"),
            LayerSpec(order=2, material="Herdet glass rekkverk", thickness_mm=10.0, quantity_per_unit=1.1, unit="m2", ns3457_code="5"),
        ),
    ),
    # --- Stairs ---
    Recipe(
        ifc_types=("IfcStairType", "IfcStairFlightType"),
        representative_unit="m2",
        layers=(
            LayerSpec(order=1, material="Betong B35 prefab trapp", thickness_mm=200.0, quantity_per_unit=0.2, unit="m3", ns3457_code="1"),
        ),
    ),
)


def build_recipe_lookup() -> dict[str, Recipe]:
    """Flatten RECIPES into {ifc_class_name: Recipe}."""
    result: dict[str, Recipe] = {}
    for recipe in RECIPES:
        for ifc_type in recipe.ifc_types:
            result[ifc_type] = recipe
    return result


class Command(BaseCommand):
    help = "Seed realistic synthetic TypeDefinitionLayer rows for a project's existing types"

    def add_arguments(self, parser):
        parser.add_argument(
            "--project",
            required=True,
            help="Project ID (UUID) to seed layers for",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove all seeded layers (notes='__claude_seed__') for this project instead of creating",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created/removed without writing",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Limit the number of types to seed (for quick testing)",
        )

    def handle(self, *args, **options):
        project_id = options["project"]
        clear = options["clear"]
        dry_run = options["dry_run"]
        limit = options["limit"]

        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            raise CommandError(f"Project {project_id} does not exist")

        self.stdout.write(self.style.NOTICE(f"Project: {project.name} ({project.id})"))

        models = list(Model.objects.filter(project=project, status="ready"))
        if not models:
            raise CommandError(f"Project {project.name} has no ready models")
        self.stdout.write(f"Models (ready): {len(models)}")

        if clear:
            self._handle_clear(project, models, dry_run)
            return

        self._handle_seed(project, models, limit, dry_run)

    # -------------------------------------------------------------------------
    # SEED
    # -------------------------------------------------------------------------

    def _handle_seed(self, project, models, limit, dry_run):
        lookup = build_recipe_lookup()

        types_qs = IFCType.objects.filter(model__in=models).select_related("mapping").order_by(
            "ifc_type", "id"
        )

        total_types = types_qs.count()
        self.stdout.write(f"Total types: {total_types}")

        matched_types: list[tuple[IFCType, Recipe]] = []
        skipped_unknown_class: set[str] = set()

        for ifc_type in types_qs.iterator():
            recipe = lookup.get(ifc_type.ifc_type)
            if not recipe:
                skipped_unknown_class.add(ifc_type.ifc_type)
                continue
            matched_types.append((ifc_type, recipe))
            if limit and len(matched_types) >= limit:
                break

        self.stdout.write(
            f"Types matched to a recipe: {len(matched_types)} "
            f"(skipped {len(skipped_unknown_class)} unique ifc_type classes with no recipe: "
            f"{sorted(skipped_unknown_class)[:10]}{'...' if len(skipped_unknown_class) > 10 else ''})"
        )

        planned_mappings_new = 0
        planned_mappings_reused = 0
        planned_layers = 0
        skipped_already_seeded = 0

        for ifc_type, recipe in matched_types:
            if hasattr(ifc_type, "mapping") and ifc_type.mapping is not None:
                planned_mappings_reused += 1
                existing_seeded = TypeDefinitionLayer.objects.filter(
                    type_mapping=ifc_type.mapping,
                    notes=SEED_TAG,
                ).exists()
                if existing_seeded:
                    skipped_already_seeded += 1
                    continue
            else:
                planned_mappings_new += 1
            planned_layers += len(recipe.layers)

        self.stdout.write("")
        self.stdout.write(self.style.NOTICE("Plan:"))
        self.stdout.write(f"  New TypeMappings to create:    {planned_mappings_new}")
        self.stdout.write(f"  Existing TypeMappings reused:  {planned_mappings_reused}")
        self.stdout.write(f"  TypeDefinitionLayers to create: {planned_layers}")
        self.stdout.write(f"  Already-seeded types skipped:   {skipped_already_seeded}")
        self.stdout.write(f"  Seed tag:                       notes='{SEED_TAG}'")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[dry-run] No changes written."))
            return

        if planned_layers == 0:
            self.stdout.write(self.style.WARNING("\nNothing to seed (already seeded or no matching types)."))
            return

        # -------------------------------------------------------------------
        # WRITE
        # -------------------------------------------------------------------
        mappings_created = 0
        layers_created = 0

        with transaction.atomic():
            for ifc_type, recipe in matched_types:
                mapping = getattr(ifc_type, "mapping", None)
                if mapping is None:
                    mapping = TypeMapping.objects.create(
                        ifc_type=ifc_type,
                        representative_unit=recipe.representative_unit,
                        mapping_status="pending",
                        notes=f"Seeded by claude-seed at {SEED_TAG}",
                    )
                    mappings_created += 1
                elif TypeDefinitionLayer.objects.filter(
                    type_mapping=mapping, notes=SEED_TAG
                ).exists():
                    continue  # Already seeded
                else:
                    if not mapping.representative_unit:
                        mapping.representative_unit = recipe.representative_unit
                        mapping.save(update_fields=["representative_unit"])

                layer_rows = [
                    TypeDefinitionLayer(
                        type_mapping=mapping,
                        layer_order=layer.order,
                        material_name=layer.material,
                        thickness_mm=layer.thickness_mm,
                        quantity_per_unit=layer.quantity_per_unit,
                        material_unit=layer.unit,
                        ns3457_code=layer.ns3457_code,
                        notes=SEED_TAG,
                    )
                    for layer in recipe.layers
                ]
                TypeDefinitionLayer.objects.bulk_create(layer_rows)
                layers_created += len(layer_rows)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Seeded {mappings_created} new TypeMappings"))
        self.stdout.write(self.style.SUCCESS(f"Seeded {layers_created} TypeDefinitionLayer rows"))

    # -------------------------------------------------------------------------
    # CLEAR
    # -------------------------------------------------------------------------

    def _handle_clear(self, project, models, dry_run):
        layer_qs = TypeDefinitionLayer.objects.filter(
            type_mapping__ifc_type__model__in=models,
            notes=SEED_TAG,
        )
        mapping_qs = TypeMapping.objects.filter(
            ifc_type__model__in=models,
            notes__startswith="Seeded by claude-seed",
            definition_layers__isnull=True,  # only those whose layers were cleared
        )

        layer_count = layer_qs.count()
        self.stdout.write(f"Seeded TypeDefinitionLayer rows to remove: {layer_count}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[dry-run] No changes written."))
            return

        with transaction.atomic():
            deleted_layers, _ = layer_qs.delete()
            # Delete mappings created purely for seeding (identifiable by their notes)
            mapping_qs_refreshed = TypeMapping.objects.filter(
                ifc_type__model__in=models,
                notes__startswith="Seeded by claude-seed",
            )
            deleted_mappings, _ = mapping_qs_refreshed.delete()

        self.stdout.write(self.style.SUCCESS(f"Removed {deleted_layers} TypeDefinitionLayer rows"))
        self.stdout.write(self.style.SUCCESS(f"Removed {deleted_mappings} seed-only TypeMappings"))
