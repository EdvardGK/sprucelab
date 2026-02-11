"""
Ingestion Gate Service - Sprint 2: The Vault

Enforces phase gates for model uploads:
- Fluid phase: New types auto-accepted
- Controlled phase: New types require human review before verification

This prevents unreviewed types from polluting the TypeBank in later project phases.
"""
from uuid import UUID
from typing import TypedDict
from django.utils import timezone

from apps.projects.models import ProjectConfig
from apps.entities.models import IFCType, TypeBankObservation


class IngestionGateResult(TypedDict):
    approved: bool
    new_types: list[dict]
    pending_review_count: int
    message: str
    phase: str


def check_ingestion_gate(model_id: UUID, project_id: UUID) -> IngestionGateResult:
    """
    Check if a model upload should be approved based on project phase.

    In 'fluid' phase: Always approved, new types auto-accepted.
    In 'controlled' phase: Checks for new unverified types. If block_on_new_types
    is True and new types exist, upload verification is blocked until types are reviewed.

    Args:
        model_id: UUID of the uploaded model
        project_id: UUID of the project

    Returns:
        IngestionGateResult with approval status and details
    """
    # Get project config (use active config)
    config = ProjectConfig.objects.filter(
        project_id=project_id,
        is_active=True
    ).first()

    if not config:
        # No config = default to fluid (permissive)
        return IngestionGateResult(
            approved=True,
            new_types=[],
            pending_review_count=0,
            message='No project config found - defaulting to fluid phase',
            phase='fluid'
        )

    if config.phase == 'fluid':
        return IngestionGateResult(
            approved=True,
            new_types=[],
            pending_review_count=0,
            message='Fluid phase - new types auto-accepted',
            phase='fluid'
        )

    # Controlled phase: check for new types needing review
    # Find types from this model that link to pending TypeBankEntries
    new_types_qs = IFCType.objects.filter(
        model_id=model_id,
    ).select_related('type_bank_entry').filter(
        type_bank_entry__verification_status='pending'
    )

    # Also check for types with primary ownership (not reference/ghost)
    # These are the ones that "matter" for this model's discipline
    primary_new_types = new_types_qs.filter(
        ownership_status='primary'
    )

    new_types_list = list(primary_new_types.values(
        'id', 'type_name', 'ifc_type', 'instance_count',
        'type_bank_entry__id', 'type_bank_entry__canonical_name'
    ))

    pending_count = len(new_types_list)

    if pending_count > 0 and config.block_on_new_types:
        return IngestionGateResult(
            approved=False,
            new_types=new_types_list,
            pending_review_count=pending_count,
            message=f'Controlled phase: {pending_count} new type(s) require review before verification',
            phase='controlled'
        )

    # Controlled phase but not blocking, or no new types
    if pending_count > 0:
        return IngestionGateResult(
            approved=True,
            new_types=new_types_list,
            pending_review_count=pending_count,
            message=f'Controlled phase: {pending_count} new type(s) flagged for review (non-blocking)',
            phase='controlled'
        )

    return IngestionGateResult(
        approved=True,
        new_types=[],
        pending_review_count=0,
        message='Controlled phase - all types previously verified',
        phase='controlled'
    )


def mark_observations_historical(model_id: UUID) -> int:
    """
    Mark all TypeBankObservations for a model as historical.
    Called when a model is being deleted or replaced.

    This preserves the audit trail instead of deleting observations.

    Args:
        model_id: UUID of the model being removed

    Returns:
        Number of observations marked as historical
    """
    updated = TypeBankObservation.objects.filter(
        source_model_id=model_id,
        is_historical=False
    ).update(
        is_historical=True,
        archived_at=timezone.now()
    )
    return updated


def get_project_type_health(project_id: UUID) -> dict:
    """
    Calculate type health KPI for a project.

    Returns metrics useful for the project dashboard:
    - Total unique types observed
    - Verified types count
    - Pending types count
    - Health percentage (verified / total)

    Args:
        project_id: UUID of the project

    Returns:
        Dict with health metrics
    """
    from apps.entities.models import TypeBankEntry
    from apps.models.models import Model

    # Get all models in project
    model_ids = Model.objects.filter(
        project_id=project_id
    ).values_list('id', flat=True)

    # Get unique TypeBankEntries observed in this project
    project_entries = TypeBankEntry.objects.filter(
        observations__source_model_id__in=model_ids
    ).distinct()

    total = project_entries.count()
    verified = project_entries.filter(verification_status='verified').count()
    pending = project_entries.filter(verification_status='pending').count()
    rejected = project_entries.filter(verification_status='rejected').count()

    health_pct = (verified / total * 100) if total > 0 else 0

    return {
        'total_types': total,
        'verified_types': verified,
        'pending_types': pending,
        'rejected_types': rejected,
        'health_percentage': round(health_pct, 1),
        'is_healthy': health_pct >= 80,  # 80% threshold for "healthy"
    }
