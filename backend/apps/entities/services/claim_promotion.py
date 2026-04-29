"""
Claim promotion service (Phase 6, Sprint 6.2).

Encapsulates the three Claim status transitions: promote, reject, supersede.
The status machine is enforced here so the ViewSet stays thin and so other
callers (CLI, agents, future webhooks) can reuse the same logic.

Promotion writes the rule into ``ProjectConfig.config['claim_derived_rules']``
as an append-only list of entries. Each entry is tagged with ``_claim_id``
so a JSON consumer can cross-reference back to the source Claim. The Claim
itself stores the full ``config_payload`` plus the ``promoted_to_config`` FK
so provenance is queryable from either side.

All three operations support a ``dry_run`` flag — the function performs the
calculation and returns the would-be state without persisting. Agents that
need plan-then-execute use this; the ViewSet exposes ``?dry_run=true``.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from django.db import transaction

from apps.entities.models import Claim
from apps.projects.models import Project, ProjectConfig


CLAIM_DERIVED_RULES_SECTION = "claim_derived_rules"


class ClaimStateError(ValueError):
    """Raised when a transition is requested from an incompatible state."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_active_config(
    project: Project, *, allow_create: bool = True,
) -> Optional[ProjectConfig]:
    """
    Return the project's active ProjectConfig.

    With ``allow_create=True`` (the default), a project that has never had
    a config gets a fresh one with version=1 so promotion always lands in a
    real row. With ``allow_create=False`` (used by dry-run), missing configs
    return ``None`` so callers can synthesize an in-memory preview without
    writing to the DB.
    """
    cfg = ProjectConfig.objects.filter(project=project, is_active=True).order_by(
        '-version',
    ).first()
    if cfg is not None:
        return cfg
    if not allow_create:
        return None
    return ProjectConfig.objects.create(project=project, version=1, is_active=True)


def _build_rule_entry(claim: Claim, *, section: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the rule dict that gets appended into ProjectConfig.config[section].

    Always includes ``_claim_id`` + ``_promoted_at`` so a JSON consumer can
    cross-reference the source Claim and audit when the promotion happened
    without reading the Claim table.
    """
    entry = deepcopy(payload) if payload else {}
    entry["_claim_id"] = str(claim.id)
    entry["_source_file_id"] = str(claim.source_file_id)
    entry["_promoted_at"] = datetime.now(timezone.utc).isoformat()
    entry["_normalized"] = claim.normalized
    entry["_statement"] = claim.statement
    return entry


def _next_config_state(
    config: ProjectConfig,
    *,
    section: str,
    rule_entry: Dict[str, Any],
) -> Dict[str, Any]:
    """Return the would-be ``config.config`` dict after appending ``rule_entry``."""
    next_data = deepcopy(config.config or {})
    bucket = next_data.setdefault(section, [])
    if not isinstance(bucket, list):
        # Defensive: a previous schema put the section as a dict — normalize
        # to list of entries so multiple promotions don't clobber each other.
        bucket = [bucket]
        next_data[section] = bucket
    bucket.append(rule_entry)
    return next_data


# ---------------------------------------------------------------------------
# Public operations
# ---------------------------------------------------------------------------


def promote_claim(
    claim: Claim,
    *,
    section: Optional[str] = None,
    rule_payload: Optional[Dict[str, Any]] = None,
    decided_by=None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Promote a claim into the project's active ProjectConfig.

    Returns a dict describing the promotion: the resulting Claim status,
    the rule entry that was (or would be) appended, and the post-promotion
    config snapshot. ``dry_run=True`` performs no writes.
    """
    if claim.status != "unresolved":
        raise ClaimStateError(
            f"Claim {claim.id} cannot be promoted: status is '{claim.status}'"
        )

    project = claim.source_file.project
    section = section or CLAIM_DERIVED_RULES_SECTION
    if rule_payload is None:
        # Default path: try to translate the claim's normalized form into an
        # engine-shape rule. If the predicate isn't translatable (unknown,
        # deferred, missing subject) we still write the entry — just without
        # a `check` key. The verification engine filters those out, and the
        # Claim record itself preserves the full normalized form via
        # `_normalized` for any future translator to pick up.
        from apps.entities.services.claim_rule_translator import translate_claim_to_rule
        translated = translate_claim_to_rule(
            str(claim.id), claim.normalized or {}, claim.statement or "",
        )
        payload = translated if translated else {}
    else:
        payload = dict(rule_payload)
    rule_entry = _build_rule_entry(claim, section=section, payload=payload)

    if dry_run:
        existing = _resolve_active_config(project, allow_create=False)
        base_config = existing.config if existing is not None else {}
        next_config_data = _next_config_state(
            type("_Stub", (), {"config": base_config})(),  # tiny shim for the helper
            section=section, rule_entry=rule_entry,
        )
        return {
            "dry_run": True,
            "would_set_status": "promoted",
            "config_id": str(existing.id) if existing is not None else None,
            "config_section": section,
            "rule_entry": rule_entry,
            "next_config": next_config_data,
        }

    config = _resolve_active_config(project, allow_create=True)
    next_config_data = _next_config_state(config, section=section, rule_entry=rule_entry)

    with transaction.atomic():
        config.config = next_config_data
        config.save(update_fields=["config", "updated_at"])
        claim.status = "promoted"
        claim.promoted_to_config = config
        claim.config_section = section
        claim.config_payload = rule_entry
        claim.decided_at = datetime.now(timezone.utc)
        if decided_by is not None and getattr(decided_by, "is_authenticated", False):
            claim.decided_by = decided_by
        claim.save(update_fields=[
            "status", "promoted_to_config", "config_section",
            "config_payload", "decided_at", "decided_by",
        ])

    return {
        "dry_run": False,
        "status": claim.status,
        "config_id": str(config.id),
        "config_section": section,
        "rule_entry": rule_entry,
    }


def reject_claim(
    claim: Claim,
    *,
    reason: str,
    decided_by=None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Mark a claim ``rejected`` with a reason. Reason is required."""
    if claim.status != "unresolved":
        raise ClaimStateError(
            f"Claim {claim.id} cannot be rejected: status is '{claim.status}'"
        )
    if not (reason or "").strip():
        raise ClaimStateError("reject_claim requires a non-empty reason")

    if dry_run:
        return {
            "dry_run": True,
            "would_set_status": "rejected",
            "would_set_reason": reason,
        }

    claim.status = "rejected"
    claim.rejected_reason = reason
    claim.decided_at = datetime.now(timezone.utc)
    if decided_by is not None and getattr(decided_by, "is_authenticated", False):
        claim.decided_by = decided_by
    claim.save(update_fields=[
        "status", "rejected_reason", "decided_at", "decided_by",
    ])
    return {
        "dry_run": False,
        "status": claim.status,
        "rejected_reason": claim.rejected_reason,
    }


def supersede_claim(
    claim: Claim,
    *,
    superseded_by: Claim,
    decided_by=None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Mark ``claim`` ``superseded`` and link it to the newer claim that took over.

    The newer claim must belong to the same project (no cross-project
    supersession — if you need it, file a feature request rather than
    sneaking it through this path).
    """
    if claim.status != "unresolved":
        raise ClaimStateError(
            f"Claim {claim.id} cannot be superseded: status is '{claim.status}'"
        )
    if superseded_by.id == claim.id:
        raise ClaimStateError("A claim cannot supersede itself")
    if superseded_by.source_file.project_id != claim.source_file.project_id:
        raise ClaimStateError("Supersession must stay within a single project")

    if dry_run:
        return {
            "dry_run": True,
            "would_set_status": "superseded",
            "would_set_superseded_by": str(superseded_by.id),
        }

    claim.status = "superseded"
    claim.superseded_by = superseded_by
    claim.decided_at = datetime.now(timezone.utc)
    if decided_by is not None and getattr(decided_by, "is_authenticated", False):
        claim.decided_by = decided_by
    claim.save(update_fields=[
        "status", "superseded_by", "decided_at", "decided_by",
    ])
    return {
        "dry_run": False,
        "status": claim.status,
        "superseded_by": str(superseded_by.id),
    }


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------


def find_conflicts(claim: Claim) -> list[Claim]:
    """
    Return claims in the same project with the same predicate+subject but a
    different value. Status is not filtered — conflicts can include
    promoted/rejected/superseded claims so the user sees the full history.

    Subject comparison is case-insensitive and whitespace-trimmed; predicate
    is exact match. Value comparison treats numeric and string values
    independently — only different values within the same type count.
    """
    pred = (claim.normalized or {}).get("predicate")
    subj = ((claim.normalized or {}).get("subject") or "").strip().lower()
    val = (claim.normalized or {}).get("value")
    if not pred or not subj:
        return []

    project_id = claim.source_file.project_id
    qs = Claim.objects.filter(
        source_file__project_id=project_id,
    ).exclude(pk=claim.pk).select_related('source_file', 'document')

    out: list[Claim] = []
    for other in qs:
        norm = other.normalized or {}
        if norm.get("predicate") != pred:
            continue
        if (norm.get("subject") or "").strip().lower() != subj:
            continue
        if norm.get("value") == val:
            continue
        out.append(other)
    return out
