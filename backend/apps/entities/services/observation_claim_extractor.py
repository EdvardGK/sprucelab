"""
Observation → Claim extractor (Phase 6, Layer-1 follow-up).

Walks ``Observation`` rows of category ``text_block`` and emits ``Claim``
rows for those whose content matches one of a small, conservative set of
drawing-language patterns:

  - ``elevation``   — elevation labels like ``+2.40``, ``-1.55``, ``±0.00``.
  - ``ns3451_code`` — Norwegian standard codes ``234``, ``234.1``, ``234.12``.
  - ``grid_label``  — grid bubbles ``A``, ``B1``, ``C12``.

Anything else is ignored — the bar is "high precision, low recall". The
extractor mirrors ``ifc-service/services/claim_extractor.py`` in spirit but
operates over already-persisted observation rows and runs entirely in the
Django process. We deliberately re-derive the regexes here rather than
importing across the Django/FastAPI service boundary; the patterns are
short and the duplication keeps the two services independently deployable.

Idempotency:
  The natural key for "this observation already produced a claim" is
  ``Claim.origin_observation_id``. We pre-load the set of observation ids
  that already have at least one claim, then skip those rows. Per-row this
  is one indexed lookup against ``claims_origin_obs_idx``.

Trigger pattern (b — direct call from the extraction flush path):
  Called from ``apps.entities.services.observation_emitter`` immediately
  after the bulk-create returns. Signals (pattern a) would fire per row
  and re-fan-out ORM writes through the post_save dispatcher; the direct
  call batches naturally and keeps the ordering explicit.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pattern catalogue — keep narrow on purpose.
# ---------------------------------------------------------------------------

# Elevations — must carry an explicit sign OR a decimal point so we don't
# misclassify bare integers (which could be NS3451 codes, room numbers,
# part counts, dimensions in millimetres). Examples that match: ``+2.4``,
# ``-1.55``, ``±0.00``, ``3.00``. Examples that DON'T match: ``234`` (let
# NS3451 take it), ``1234`` (4-digit ambiguous integer).
_ELEVATION_RE = re.compile(
    r'^(?:[+\-]\d+(?:[.,]\d+)?|\d+[.,]\d+)$'
)
_PLUS_MINUS_PREFIXES = ('±', '±', '+/-', '+-')

# NS3451 codes — three-digit base, optional ``.<digits>`` subcode.
_NS3451_RE = re.compile(r'^\d{3}(?:\.\d+)?$')

# Grid labels — single letter, or letter+digits (max 2 digits to avoid
# matching part numbers like ``A100-3`` or ``E27`` light-bulb codes).
_GRID_LABEL_RE = re.compile(r'^[A-Z](?:\d{1,2})?$')


@dataclass
class ClaimEmissionResult:
    """
    Bookkeeping for one extractor invocation.

    Returned from ``extract_claims_for_observations`` so callers can log how
    much work the extractor did without inspecting the Claim table.
    """
    created_claims: List[object] = field(default_factory=list)
    skipped_existing: int = 0
    skipped_unmatched: int = 0


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def extract_claims_for_observations(
    observations: Sequence[object],
    *,
    Claim=None,
) -> ClaimEmissionResult:
    """
    Walk ``observations`` and persist a Claim for each pattern hit.

    Parameters:
      - observations: iterable of persisted ``Observation`` instances. Only
        rows with ``category == 'text_block'`` are considered.
      - Claim: optional model class injection (kept for symmetry with
        ``observation_emitter.emit_for_drawing_sheet``; defaults to the live
        model).

    Returns ``ClaimEmissionResult`` with the freshly-created claims and skip
    counters. The function is failure-isolated per row: an exception raised
    while building one claim is logged and the loop continues. Claim layer
    is additive — extraction must never gate the parent ``ExtractionRun``.
    """
    if Claim is None:
        from apps.entities.models import Claim as _Claim
        Claim = _Claim

    result = ClaimEmissionResult()

    text_blocks = [
        obs for obs in observations
        if getattr(obs, 'category', None) == 'text_block'
    ]
    if not text_blocks:
        return result

    # Idempotency: pre-load the set of observation ids that already have a
    # claim. Re-running over the same observations is a no-op.
    obs_ids = [obs.id for obs in text_blocks]
    already_emitted = set(
        Claim.objects.filter(origin_observation_id__in=obs_ids)
        .values_list('origin_observation_id', flat=True)
    )

    for obs in text_blocks:
        if obs.id in already_emitted:
            result.skipped_existing += 1
            continue

        candidate = _classify(obs.content)
        if candidate is None:
            result.skipped_unmatched += 1
            continue

        try:
            claim = _persist_claim(obs, candidate, Claim=Claim)
        except Exception:
            logger.exception(
                'observation_claim_extractor: failed to persist claim for '
                'observation %s', obs.id,
            )
            continue

        if claim is not None:
            result.created_claims.append(claim)

    return result


# ---------------------------------------------------------------------------
# Pattern classification
# ---------------------------------------------------------------------------


@dataclass
class _Candidate:
    claim_type: str
    predicate: str
    value: object
    units: str
    confidence: float


def _classify(content: str) -> Optional[_Candidate]:
    """Return a Candidate if `content` matches one of the patterns; else None."""
    if not content:
        return None

    text = content.strip()
    if not text:
        return None

    # Normalize ± and +/- prefixes to a single + so the elevation regex
    # doesn't have to swallow Unicode variations.
    normalized = text
    for prefix in _PLUS_MINUS_PREFIXES:
        if normalized.startswith(prefix):
            normalized = '+' + normalized[len(prefix):].lstrip()
            break

    # NS3451 first — '234' is a valid code; without this branch it would also
    # match _ELEVATION_RE and get tagged as an elevation.
    if _NS3451_RE.match(normalized):
        return _Candidate(
            claim_type='spec',
            predicate='ns3451_code',
            value=normalized,
            units='code',
            confidence=0.7,
        )

    if _ELEVATION_RE.match(normalized):
        # Re-parse value as float for downstream consumers.
        try:
            elevation_m = float(normalized.replace(',', '.'))
        except ValueError:
            return None
        return _Candidate(
            claim_type='spec',
            predicate='elevation',
            value=elevation_m,
            units='m',
            confidence=0.7,
        )

    if _GRID_LABEL_RE.match(text):
        return _Candidate(
            claim_type='spec',
            predicate='grid_label',
            value=text,
            units='label',
            confidence=0.7,
        )

    return None


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _persist_claim(obs, cand: _Candidate, *, Claim) -> object:
    """
    Build and save one Claim from an Observation + classification candidate.

    The provenance fields are copied from the originating observation so the
    claim still works without needing to dereference origin_observation.
    """
    statement = (obs.content or '').strip()
    normalized = {
        'predicate': cand.predicate,
        'subject': '(text_block)',
        'value': cand.value,
        'units': cand.units,
        'lang': 'nb',  # patterns are NB drawing conventions
        'origin': 'observation',
    }

    source_location = {
        'observation_id': str(obs.id),
        'page_index': obs.page_index,
        'bbox': obs.bbox or {},
    }
    if obs.sheet_id:
        source_location['sheet_id'] = str(obs.sheet_id)

    return Claim.objects.create(
        source_file_id=obs.source_file_id,
        extraction_run_id=obs.extraction_run_id,
        scope_id=getattr(obs, 'scope_id', None),
        origin_observation=obs,
        statement=statement,
        normalized=normalized,
        claim_type=cand.claim_type,
        confidence=cand.confidence,
        source_location=source_location,
    )
