"""
Discipline Filter Service - Sprint 1: The Gatekeeper

Applies NS3451-based discipline filtering to auto-demote types outside
the model's assigned discipline responsibility.

The "firewall" concept:
- ARK models should only have ARK types as "primary"
- RIV elements in an ARK model become "reference" (copied for coordination)
- Unclassified or unmatched types remain "primary" (conservative)

Hierarchy resolution:
- Parent discipline (e.g. RIV) inherits responsibility for all children
  (RIVv, RIVp, RIVspr, RIkulde, RIvarme)
- Child discipline (e.g. RIVp) matches only itself + parent (RIV)
- Project-level ResponsibilityMatrix overrides global NS3451OwnershipMatrix
"""
from uuid import UUID
from typing import TypedDict
from django.db.models import Q

from apps.models.models import Model
from apps.entities.models import IFCType, NS3451OwnershipMatrix, TypeMapping
from apps.projects.models import ResponsibilityMatrix
from apps.core.disciplines import resolve_discipline_for_lookup


class FilterResult(TypedDict):
    total_types: int
    primary_count: int
    reference_count: int
    ghost_count: int
    unchanged_count: int
    model_discipline: str | None


def apply_discipline_firewall(model_id: UUID) -> FilterResult:
    """
    Apply discipline-based ownership filtering to all types in a model.

    Uses the NS3451OwnershipMatrix to determine which types "belong" to
    the model's discipline vs which are reference copies from other disciplines.

    Args:
        model_id: UUID of the model to filter

    Returns:
        FilterResult with counts of filtered types
    """
    model = Model.objects.filter(id=model_id).first()
    if not model:
        return FilterResult(
            total_types=0,
            primary_count=0,
            reference_count=0,
            ghost_count=0,
            unchanged_count=0,
            model_discipline=None
        )

    if not model.discipline:
        # Can't filter without discipline assignment
        types_count = IFCType.objects.filter(model_id=model_id).count()
        return FilterResult(
            total_types=types_count,
            primary_count=types_count,
            reference_count=0,
            ghost_count=0,
            unchanged_count=types_count,
            model_discipline=None
        )

    # Get all types for this model with their mappings
    types = IFCType.objects.filter(model_id=model_id).select_related(
        'mapping', 'mapping__ns3451'
    )

    primary_count = 0
    reference_count = 0
    ghost_count = 0
    unchanged_count = 0

    for ifc_type in types:
        # Get NS3451 code from type mapping
        ns3451_code = None
        if hasattr(ifc_type, 'mapping') and ifc_type.mapping:
            ns3451_code = ifc_type.mapping.ns3451_code

        if not ns3451_code:
            # No classification → stays primary (conservative)
            unchanged_count += 1
            continue

        # Look up ownership: project matrix first, fallback to global
        discipline_codes = resolve_discipline_for_lookup(model.discipline)
        ownership = _lookup_ownership(model, ns3451_code, discipline_codes)

        new_status = determine_ownership_status(ownership, ifc_type.ownership_status)

        if new_status != ifc_type.ownership_status:
            ifc_type.ownership_status = new_status
            ifc_type.save(update_fields=['ownership_status'])

            if new_status == 'primary':
                primary_count += 1
            elif new_status == 'reference':
                reference_count += 1
            elif new_status == 'ghost':
                ghost_count += 1
        else:
            unchanged_count += 1

    return FilterResult(
        total_types=types.count(),
        primary_count=primary_count,
        reference_count=reference_count,
        ghost_count=ghost_count,
        unchanged_count=unchanged_count,
        model_discipline=model.discipline
    )


def determine_ownership_status(
    ownership: NS3451OwnershipMatrix | None,
    current_status: str
) -> str:
    """
    Determine the ownership status for a type based on the ownership matrix.

    Logic:
    - No matrix entry → stays primary (this discipline might own it)
    - Primary in matrix → primary (we own this type)
    - Secondary in matrix → primary (we may model this)
    - Reference in matrix → reference (we copy from others)

    Args:
        ownership: NS3451OwnershipMatrix entry for this code/discipline
        current_status: Current ownership_status value

    Returns:
        New ownership_status value
    """
    if not ownership:
        # No entry in matrix = keep current (or default to primary)
        return current_status if current_status else 'primary'

    if ownership.ownership_level == 'primary':
        return 'primary'
    elif ownership.ownership_level == 'secondary':
        return 'primary'  # Secondary still means we can model it
    elif ownership.ownership_level == 'reference':
        return 'reference'

    return current_status


def get_primary_types_for_discipline(model_id: UUID) -> list[IFCType]:
    """
    Get all types in a model that are "primary" for the model's discipline.

    These are the types that this model's author is responsible for.
    Used for validation and reporting.

    Args:
        model_id: UUID of the model

    Returns:
        List of IFCType objects with ownership_status='primary'
    """
    return list(IFCType.objects.filter(
        model_id=model_id,
        ownership_status='primary'
    ))


def get_reference_types_for_model(model_id: UUID) -> list[IFCType]:
    """
    Get all types in a model that are "reference" (copied from other disciplines).

    These types should not be verified/classified in this model.

    Args:
        model_id: UUID of the model

    Returns:
        List of IFCType objects with ownership_status='reference'
    """
    return list(IFCType.objects.filter(
        model_id=model_id,
        ownership_status='reference'
    ))


def get_discipline_ownership_summary(model_id: UUID) -> dict:
    """
    Get a summary of type ownership by discipline for a model.

    Useful for dashboards showing discipline breakdown.

    Args:
        model_id: UUID of the model

    Returns:
        Dict with ownership statistics
    """
    model = Model.objects.filter(id=model_id).first()
    if not model:
        return {'error': 'Model not found'}

    types = IFCType.objects.filter(model_id=model_id)

    primary = types.filter(ownership_status='primary').count()
    reference = types.filter(ownership_status='reference').count()
    ghost = types.filter(ownership_status='ghost').count()
    total = types.count()

    return {
        'model_id': str(model_id),
        'model_discipline': model.discipline,
        'is_primary_for_discipline': model.is_primary_for_discipline,
        'total_types': total,
        'primary_types': primary,
        'reference_types': reference,
        'ghost_types': ghost,
        'primary_percentage': round(primary / total * 100, 1) if total > 0 else 0,
    }


def infer_discipline_from_types(model_id: UUID) -> str | None:
    """
    Attempt to infer model discipline from the types it contains.

    Looks at NS3451 codes and ownership matrix to guess the most likely
    discipline for a model when filename inference fails.

    Args:
        model_id: UUID of the model

    Returns:
        Inferred discipline code or None if can't determine
    """
    # Get all NS3451 codes used in this model
    type_mappings = TypeMapping.objects.filter(
        ifc_type__model_id=model_id,
        ns3451_code__isnull=False
    ).values_list('ns3451_code', flat=True)

    if not type_mappings:
        return None

    # Count primary ownership by discipline
    discipline_scores = {}
    for ns3451_code in type_mappings:
        ownership_entries = NS3451OwnershipMatrix.objects.filter(
            ns3451_code_id=ns3451_code,
            ownership_level='primary'
        )
        for entry in ownership_entries:
            discipline_scores[entry.discipline] = discipline_scores.get(entry.discipline, 0) + 1

    if not discipline_scores:
        return None

    # Return discipline with highest score
    return max(discipline_scores, key=discipline_scores.get)
