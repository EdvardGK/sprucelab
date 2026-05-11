"""
Build Observation rows from already-persisted DrawingSheet data.

Single entry point used by:
  - The drawing-upload code path (after DrawingSheet rows are saved)
  - The backfill migration (to populate Observations for existing drawings)
  - Re-process endpoints (idempotent — re-emits on each run)

Idempotency: observations are not deduplicated across runs. The
extraction_run FK is the natural shard. Callers that want a single
authoritative snapshot per sheet can `Observation.objects.filter(
sheet=..., extraction_run=run).delete()` before re-emit.
"""
from __future__ import annotations

from typing import Iterable


def emit_for_drawing_sheet(sheet, *, extraction_run, Observation, extract_claims=True):
    """
    Build Observation rows for one DrawingSheet.

    Reads from the sheet's own fields + `raw_metadata` (no FastAPI call).
    Returns the list of created Observation instances (bulk-created).

    `Observation` is passed in so callers from a migration can use the
    historical model accessor (`apps.get_model(...)`); live callers pass
    the real model.

    `extract_claims` (default True) controls whether the Layer-2 claim
    extractor runs over the freshly-created text-block observations. The
    historical-model migration path passes `extract_claims=False` because
    `apps.get_model(...)` returns historical state without the live FK
    methods the extractor depends on.
    """
    rows = list(_build_rows_for_sheet(sheet))
    if not rows:
        return []

    objs = [
        Observation(
            source_file_id=sheet.source_file_id,
            extraction_run=extraction_run,
            sheet=sheet,
            scope_id=getattr(sheet, 'scope_id', None),
            category=r['category'],
            key=r.get('key', '') or '',
            content=r.get('content', '') or '',
            page_index=r.get('page_index'),
            bbox=r.get('bbox') or {},
            raw_data=r.get('raw_data') or {},
        )
        for r in rows
    ]
    created = Observation.objects.bulk_create(objs)

    if extract_claims and created:
        # Layer-2: walk the freshly-created text_block observations and emit
        # a Claim for each that matches one of the conservative drawing-
        # language patterns (elevation, NS3451 code, grid label). Failure
        # here is logged but never gates the extraction run.
        try:
            from .observation_claim_extractor import (
                extract_claims_for_observations,
            )
            extract_claims_for_observations(created)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'observation_emitter: claim extraction failed for sheet %s',
                getattr(sheet, 'id', '?'),
            )

    return created


def _build_rows_for_sheet(sheet) -> Iterable[dict]:
    """Pure: turn a DrawingSheet's persisted state into observation dicts."""
    page_index = sheet.page_index or 0

    # --- Sheet metadata (size, scale, sheet_number/name) -----------------
    if sheet.sheet_number:
        yield {
            'category': 'title_block_field',
            'key': 'sheet_number',
            'content': sheet.sheet_number,
            'page_index': page_index,
        }
    if sheet.sheet_name:
        yield {
            'category': 'title_block_field',
            'key': 'sheet_name',
            'content': sheet.sheet_name,
            'page_index': page_index,
        }
    if sheet.scale:
        yield {
            'category': 'title_block_field',
            'key': 'scale',
            'content': sheet.scale,
            'page_index': page_index,
        }
    if sheet.width_mm or sheet.height_mm:
        yield {
            'category': 'sheet_metadata',
            'key': 'dimensions_mm',
            'content': f'{sheet.width_mm or 0:.0f} × {sheet.height_mm or 0:.0f} mm',
            'page_index': page_index,
            'raw_data': {
                'width_mm': sheet.width_mm,
                'height_mm': sheet.height_mm,
            },
        }

    # --- Title-block parsed fields ----------------------------------------
    for field_name, value in (sheet.title_block_data or {}).items():
        if value in (None, '', [], {}):
            continue
        yield {
            'category': 'title_block_field',
            'key': str(field_name),
            'content': str(value),
            'page_index': page_index,
        }

    raw = sheet.raw_metadata or {}

    # --- DXF layers --------------------------------------------------------
    layers = raw.get('layers')
    if isinstance(layers, list):
        for layer_name in layers:
            yield {
                'category': 'layer',
                'key': str(layer_name),
                'page_index': page_index,
            }

    # --- DXF/PDF text blocks ----------------------------------------------
    blocks = raw.get('text_blocks')
    if isinstance(blocks, list):
        for block in blocks:
            if not isinstance(block, dict):
                continue
            text = (block.get('text') or '').strip()
            if not text:
                continue
            yield {
                'category': 'text_block',
                'content': text,
                'page_index': page_index,
                'bbox': {
                    'x_mm': block.get('x_mm'),
                    'y_mm': block.get('y_mm'),
                    'w_mm': block.get('w_mm'),
                    'h_mm': block.get('h_mm'),
                } if any(k in block for k in ('x_mm', 'y_mm', 'w_mm', 'h_mm')) else {},
            }

    # --- DXF modelspace metadata -----------------------------------------
    if 'modelspace_units' in raw:
        yield {
            'category': 'file_metadata',
            'key': 'modelspace_units',
            'content': str(raw['modelspace_units']),
            'page_index': page_index,
        }

    # --- PDF density / counts ---------------------------------------------
    if 'text_density' in raw:
        yield {
            'category': 'sheet_metadata',
            'key': 'text_density',
            'content': str(raw['text_density']),
            'page_index': page_index,
        }
    if 'char_count' in raw:
        yield {
            'category': 'sheet_metadata',
            'key': 'char_count',
            'content': str(raw['char_count']),
            'page_index': page_index,
        }
