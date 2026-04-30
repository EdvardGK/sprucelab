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
from apps.projects.models import Project, ProjectConfig, ProjectScope


CLAIM_DERIVED_RULES_SECTION = "claim_derived_rules"

# Section name written to claim.config_section when a storey_list claim is
# promoted into a ProjectScope. The DRF audit fields (config_section + config_payload)
# are reused so the API surface stays uniform across promotion targets — the
# ProjectScope FK on `promoted_to_scope` is what tells consumers this was a
# scope-level promotion, not a config-level one.
SCOPE_CANONICAL_FLOORS_SECTION = "project_scope.canonical_floors"


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
# Storey-list reconciliation
# ---------------------------------------------------------------------------


def _normalize_floor_proposal(claim: Claim) -> list[Dict[str, Any]]:
    """
    Pull the proposed floor list out of a storey_list claim's normalized payload.

    Expected shape (emitted by the storey claim emitter):
        {"floors": [{"name": str, "elevation_m": float, "source_guid": str}, ...]}

    Returns a list of dicts with normalized keys ``name`` (stripped),
    ``elevation_m`` (float), and ``source_guid`` (optional). Entries missing
    a usable name are dropped silently — claims with zero usable floors will
    promote to a no-op alias merge, which is the right thing for empty IFCs.
    """
    payload = claim.normalized or {}
    floors = payload.get("floors") if isinstance(payload, dict) else None
    if not isinstance(floors, list):
        return []
    out: list[Dict[str, Any]] = []
    for entry in floors:
        if not isinstance(entry, dict):
            continue
        name = (entry.get("name") or "").strip()
        if not name:
            continue
        try:
            elevation = float(entry.get("elevation_m")) if entry.get("elevation_m") is not None else None
        except (TypeError, ValueError):
            elevation = None
        out.append({
            "name": name,
            "elevation_m": elevation,
            "source_guid": entry.get("source_guid"),
        })
    return out


def _reconcile_floors(
    canonical: list[Dict[str, Any]],
    proposed: list[Dict[str, Any]],
    *,
    tolerance_m: float,
    claim_id: str,
    promoted_at: str,
) -> Dict[str, Any]:
    """
    Merge a proposed floor list into a canonical list using ``tolerance_m``.

    Match rules (in priority order):
      1. Existing entry's ``name`` or any of its ``aliases`` matches → no-op.
      2. Existing entry's ``elevation_m`` is within ``tolerance_m`` of the
         proposed elevation → add the proposed name as an alias.
      3. Otherwise → append the proposed entry as a new canonical floor.

    Returns ``{"next": <new canonical list>, "diff": {"added": [...], "alias_merges": [...]}}``
    so callers can describe what changed without recomputing.
    """
    next_canonical = [deepcopy(e) for e in (canonical or [])]
    added: list[Dict[str, Any]] = []
    alias_merges: list[Dict[str, Any]] = []

    def _existing_names(entry: Dict[str, Any]) -> set[str]:
        names: set[str] = set()
        if entry.get("name"):
            names.add(entry["name"].strip().lower())
        for alias in entry.get("aliases") or []:
            if isinstance(alias, str) and alias.strip():
                names.add(alias.strip().lower())
        return names

    used_codes = {e.get("code") for e in next_canonical if e.get("code")}

    def _allocate_code(seed_name: str) -> str:
        # Prefer the seed name itself as code if free, else suffix with -2, -3, ...
        base = "".join(ch for ch in seed_name if ch.isalnum()) or "FLOOR"
        candidate = base
        counter = 2
        while candidate in used_codes:
            candidate = f"{base}-{counter}"
            counter += 1
        used_codes.add(candidate)
        return candidate

    for prop in proposed:
        prop_name_key = prop["name"].strip().lower()
        prop_elev = prop.get("elevation_m")

        # Rule 1: name/alias match — pure no-op.
        name_match_idx = None
        for idx, entry in enumerate(next_canonical):
            if prop_name_key in _existing_names(entry):
                name_match_idx = idx
                break
        if name_match_idx is not None:
            continue

        # Rule 2: elevation within tolerance — alias merge.
        if prop_elev is not None:
            elev_match_idx = None
            for idx, entry in enumerate(next_canonical):
                ent_elev = entry.get("elevation_m")
                if ent_elev is None:
                    continue
                if abs(float(ent_elev) - float(prop_elev)) <= tolerance_m:
                    elev_match_idx = idx
                    break
            if elev_match_idx is not None:
                target = next_canonical[elev_match_idx]
                aliases = list(target.get("aliases") or [])
                if prop["name"] not in aliases and prop["name"] != target.get("name"):
                    aliases.append(prop["name"])
                target["aliases"] = aliases
                alias_merges.append({
                    "canonical_code": target.get("code"),
                    "canonical_name": target.get("name"),
                    "added_alias": prop["name"],
                    "elevation_delta_m": abs(float(target["elevation_m"]) - float(prop_elev)),
                })
                continue

        # Rule 3: brand-new floor.
        new_entry = {
            "code": _allocate_code(prop["name"]),
            "name": prop["name"],
            "elevation_m": prop_elev,
            "aliases": [],
            "_promoted_from_claim": claim_id,
            "_promoted_at": promoted_at,
        }
        next_canonical.append(new_entry)
        added.append(new_entry)

    # Keep the canonical list ordered by elevation (None last, stable for ties).
    next_canonical.sort(
        key=lambda e: (e.get("elevation_m") is None, e.get("elevation_m") or 0.0, e.get("code") or ""),
    )

    return {"next": next_canonical, "diff": {"added": added, "alias_merges": alias_merges}}


def _resolve_target_scope(claim: Claim) -> ProjectScope:
    """
    Pick the ProjectScope that this storey_list claim should write into.

    Preference order:
      1. ``claim.scope`` if set (the extractor already attributed it).
      2. The project's root scope (``parent IS NULL``) if exactly one exists.
      3. Raise — ambiguous projects need explicit scope attribution before
         the claim can promote.
    """
    if claim.scope_id:
        return claim.scope
    project_id = claim.source_file.project_id
    roots = list(ProjectScope.objects.filter(project_id=project_id, parent__isnull=True))
    if len(roots) == 1:
        return roots[0]
    raise ClaimStateError(
        f"Cannot resolve target scope for storey_list claim {claim.id}: "
        f"project has {len(roots)} root scopes and the claim has no explicit scope. "
        "Set claim.scope before promotion or provide a target scope id."
    )


def _promote_storey_list_into_scope(
    claim: Claim,
    *,
    decided_by=None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Promote a ``storey_list`` claim into ``ProjectScope.canonical_floors``.

    See ``_reconcile_floors`` for match rules. The Claim audit fields
    (``config_section`` + ``config_payload``) are populated for symmetry with
    rule promotions; ``promoted_to_scope`` is the authoritative target FK.
    """
    target_scope = _resolve_target_scope(claim)
    proposed = _normalize_floor_proposal(claim)
    tolerance = float(target_scope.storey_merge_tolerance_m or 0.0)
    promoted_at = datetime.now(timezone.utc).isoformat()

    reconciled = _reconcile_floors(
        list(target_scope.canonical_floors or []),
        proposed,
        tolerance_m=tolerance,
        claim_id=str(claim.id),
        promoted_at=promoted_at,
    )

    audit_payload = {
        "scope_id": str(target_scope.id),
        "tolerance_m": tolerance,
        "diff": reconciled["diff"],
        "_claim_id": str(claim.id),
        "_promoted_at": promoted_at,
        "_normalized": claim.normalized,
        "_statement": claim.statement,
    }

    if dry_run:
        return {
            "dry_run": True,
            "would_set_status": "promoted",
            "scope_id": str(target_scope.id),
            "config_section": SCOPE_CANONICAL_FLOORS_SECTION,
            "diff": reconciled["diff"],
            "next_canonical_floors": reconciled["next"],
        }

    with transaction.atomic():
        target_scope.canonical_floors = reconciled["next"]
        target_scope.save(update_fields=["canonical_floors", "updated_at"])
        claim.status = "promoted"
        claim.promoted_to_scope = target_scope
        claim.config_section = SCOPE_CANONICAL_FLOORS_SECTION
        claim.config_payload = audit_payload
        claim.decided_at = datetime.now(timezone.utc)
        if decided_by is not None and getattr(decided_by, "is_authenticated", False):
            claim.decided_by = decided_by
        claim.save(update_fields=[
            "status", "promoted_to_scope", "config_section",
            "config_payload", "decided_at", "decided_by",
        ])

    _fire_floor_canonical_changed_event(claim, target_scope, reconciled["diff"])

    return {
        "dry_run": False,
        "status": claim.status,
        "scope_id": str(target_scope.id),
        "config_section": SCOPE_CANONICAL_FLOORS_SECTION,
        "diff": reconciled["diff"],
    }


def _fire_floor_canonical_changed_event(
    claim: Claim, scope: ProjectScope, diff: Dict[str, Any],
) -> None:
    """Fire the ``floor.canonical.changed`` webhook (failure-isolated)."""
    try:
        from apps.automation.services.webhook_dispatcher import dispatch_event
        project_id = str(scope.project_id) if scope.project_id else None
        dispatch_event(
            'floor.canonical.changed',
            {
                'event': 'floor.canonical.changed',
                'project_id': project_id,
                'scope_id': str(scope.id),
                'claim_id': str(claim.id),
                'added': diff.get('added') or [],
                'alias_merges': diff.get('alias_merges') or [],
                'occurred_at': datetime.now(timezone.utc).isoformat(),
            },
            project_id=project_id,
        )
    except Exception:  # pragma: no cover — webhook dispatch is best-effort
        pass


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

    For ``claim_type == 'storey_list'`` the dispatch routes to
    ``_promote_storey_list_into_scope`` — the canonical floor list lives on
    ``ProjectScope``, not on ``ProjectConfig``. The ``section`` and
    ``rule_payload`` arguments are ignored for that path.
    """
    if claim.status != "unresolved":
        raise ClaimStateError(
            f"Claim {claim.id} cannot be promoted: status is '{claim.status}'"
        )

    if claim.claim_type == "storey_list":
        return _promote_storey_list_into_scope(
            claim, decided_by=decided_by, dry_run=dry_run,
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
