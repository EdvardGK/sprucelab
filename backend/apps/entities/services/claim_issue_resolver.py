"""
Resolve verification issues for a type, attaching originating-Claim metadata.

The verification engine writes issues into ``TypeMapping.verification_issues``
as ``{rule_id, rule_name, severity, message}``. Claim-derived rules carry
``rule_id`` of the form ``claim:<uuid>`` (see ``claim_rule_translator``).

This service is the read side of that pipeline: given a project + type_name,
it walks every TypeMapping for that type across the project's models, flattens
the issue arrays, and bulk-fetches the originating Claim rows so the API can
return one row per (issue, model) with full claim provenance attached.

Pure read path — no mutations, no side effects. Safe to call from a GET view.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from apps.entities.models import Claim, TypeMapping


_CLAIM_RULE_ID_RE = re.compile(r"^claim:([0-9a-fA-F-]{36})$")
_SEVERITY_RANK = {"error": 0, "warning": 1, "info": 2}


def _parse_claim_id(rule_id: str) -> uuid.UUID | None:
    if not rule_id:
        return None
    match = _CLAIM_RULE_ID_RE.match(rule_id)
    if not match:
        return None
    try:
        return uuid.UUID(match.group(1))
    except ValueError:
        return None


def _claim_to_ref(claim: Claim) -> dict[str, Any]:
    normalized = claim.normalized or {}
    document = claim.document
    return {
        "id": str(claim.id),
        "statement": claim.statement or "",
        "predicate": normalized.get("predicate") or "",
        "value": str(normalized.get("value") or ""),
        "units": normalized.get("units") or "",
        "document_id": str(document.id) if document else None,
        "document_filename": (
            document.source_file.original_filename
            if document and document.source_file
            else None
        ),
    }


def resolve_type_claim_issues(
    *,
    project_id: str,
    type_name: str,
    model_id: str | None = None,
    severities: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Return a flat list of verification issues for one type in a project.

    Each row carries the originating ``model`` context and (for claim-derived
    rules) a ``claim`` block with full provenance. Non-claim rules surface with
    ``claim=None`` so consumers can still display the engine output without a
    second round-trip.

    Args:
        project_id: UUID of the project to scope to.
        type_name: ``IFCType.type_name`` to look up.
        model_id: Optional model UUID to narrow the result to one model.
        severities: Optional whitelist (e.g. ``["info"]``).

    Returns:
        Issues sorted by severity (error → warning → info) then model name.
    """
    mappings = (
        TypeMapping.objects
        .select_related("ifc_type__model")
        .filter(
            ifc_type__model__project_id=project_id,
            ifc_type__type_name=type_name,
        )
    )
    if model_id:
        mappings = mappings.filter(ifc_type__model_id=model_id)

    severity_filter = set(severities) if severities else None

    rows: list[dict[str, Any]] = []
    claim_ids: set[uuid.UUID] = set()

    for mapping in mappings:
        issues = mapping.verification_issues or []
        ifc_type = mapping.ifc_type
        model = ifc_type.model
        for issue in issues:
            severity = issue.get("severity") or "info"
            if severity_filter is not None and severity not in severity_filter:
                continue
            rule_id = issue.get("rule_id") or ""
            claim_uuid = _parse_claim_id(rule_id)
            if claim_uuid:
                claim_ids.add(claim_uuid)
            rows.append({
                "rule_id": rule_id,
                "rule_name": issue.get("rule_name") or "",
                "severity": severity,
                "message": issue.get("message") or "",
                "model_id": str(model.id),
                "model_name": model.name or model.original_filename or "",
                "ifc_type_id": str(ifc_type.id),
                "_claim_uuid": claim_uuid,
            })

    claim_lookup: dict[uuid.UUID, Claim] = {}
    if claim_ids:
        claims = (
            Claim.objects
            .select_related("document__source_file")
            .filter(id__in=claim_ids)
        )
        claim_lookup = {claim.id: claim for claim in claims}

    for row in rows:
        claim_uuid = row.pop("_claim_uuid")
        claim = claim_lookup.get(claim_uuid) if claim_uuid else None
        row["claim"] = _claim_to_ref(claim) if claim else None

    rows.sort(key=lambda r: (
        _SEVERITY_RANK.get(r["severity"], 99),
        r["model_name"],
    ))
    return rows
