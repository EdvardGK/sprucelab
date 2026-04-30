"""
Storey claim emitter (Phase F-1).

Convert a parsed storey list (from the IFC lite parser, drawing extractor, or
document extractor) into a ``storey_list`` Claim sitting in the Claim Inbox
``unresolved``. Promotion through ``claim_promotion.promote_claim`` writes the
list into ``ProjectScope.canonical_floors``.

The function is failure-isolated: if claim creation raises, the caller's
extraction run still finalizes — claims are an additive layer, never a gate.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Optional

logger = logging.getLogger(__name__)


def emit_storey_list_claim(
    *,
    source_file,
    extraction_run,
    storeys: Iterable[Dict[str, Any]],
    extraction_method: str = 'ifc_lite',
) -> Optional[str]:
    """
    Create one ``storey_list`` Claim for the supplied storeys.

    Parameters:
      - source_file: ``models.SourceFile`` instance the claim came from.
      - extraction_run: ``models.ExtractionRun`` instance the claim is part of.
      - storeys: iterable of ``{name, elevation_m, guid?}`` dicts.
      - extraction_method: tag stored on the claim's normalized payload so
        downstream consumers can distinguish IFC-derived floor lists from
        drawing/document-derived ones.

    Returns the new claim id (str) on success, ``None`` if no usable storeys
    were supplied or claim creation failed.
    """
    from apps.entities.models import Claim
    from datetime import datetime as _dt, timezone as _tz

    floors_payload = []
    names_for_statement: list[str] = []
    for entry in storeys or []:
        if not isinstance(entry, dict):
            continue
        name = (entry.get('name') or '').strip()
        if not name:
            continue
        elevation = entry.get('elevation_m')
        try:
            elevation_m = float(elevation) if elevation is not None else None
        except (TypeError, ValueError):
            elevation_m = None
        floors_payload.append({
            'name': name,
            'elevation_m': elevation_m,
            'source_guid': entry.get('guid'),
        })
        names_for_statement.append(name)

    if not floors_payload:
        return None

    statement = (
        f"Discovered {len(floors_payload)} storeys: "
        + ', '.join(names_for_statement[:12])
        + ('...' if len(names_for_statement) > 12 else '')
    )

    normalized = {
        'predicate': 'has_storeys',
        'subject': 'project',
        'extraction_method': extraction_method,
        'floors': floors_payload,
    }

    try:
        claim = Claim.objects.create(
            source_file=source_file,
            extraction_run=extraction_run,
            scope=getattr(source_file, 'scope', None),
            statement=statement,
            normalized=normalized,
            claim_type='storey_list',
            confidence=0.95 if extraction_method == 'ifc_lite' else 0.7,
            source_location={
                'extraction_method': extraction_method,
                'storey_count': len(floors_payload),
                'extracted_at': _dt.now(_tz.utc).isoformat(),
            },
        )
        return str(claim.id)
    except Exception:
        logger.exception('emit_storey_list_claim failed for source_file %s', getattr(source_file, 'id', '?'))
        return None
