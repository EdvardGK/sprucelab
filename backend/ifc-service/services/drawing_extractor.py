"""
Drawing Extractor (Phase 5).

Extracts metadata from drawing files (DWG/DXF via ezdxf, PDF via pymupdf).

Returns a stateless `DrawingExtractionResult` describing one or more sheets;
persistence is Django's job (the FastAPI service is a pure extractor here, in
contrast with the IFC pipeline which writes via asyncpg).

Design notes:
- One sheet per file for DXF/DWG, one sheet per page for PDF.
- For PDF we distinguish "drawing" vs "document" pages via aspect ratio and
  page dimensions — non-drawing PDFs are kicked back to Phase 6 by the
  caller, but extraction still records page geometry so the caller can decide.
- Failure-isolated: a bad page logs a warning and the rest continue, just
  like IFC type extraction. Catastrophic failures set `success=False` with
  `error` populated and a single fatal log entry.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class DrawingSheetData:
    """One extracted sheet (DXF/DWG file or single PDF page)."""
    page_index: int
    sheet_number: str = ""
    sheet_name: str = ""
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    scale: str = ""
    title_block_data: Dict[str, Any] = field(default_factory=dict)
    raw_metadata: Dict[str, Any] = field(default_factory=dict)
    is_drawing: bool = True
    """False for PDF pages that look more like document pages (text-dense, A4)."""


@dataclass
class DrawingExtractionResult:
    """Result of extracting one drawing source file."""
    success: bool = False
    format: str = ""  # 'dxf' | 'dwg' | 'pdf'
    sheets: List[DrawingSheetData] = field(default_factory=list)
    log_entries: List[Dict[str, Any]] = field(default_factory=list)
    quality_report: Dict[str, Any] = field(default_factory=dict)
    duration_seconds: float = 0.0
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# PDF: heuristic for drawing vs document pages
# ---------------------------------------------------------------------------


# A4 portrait is 210x297 mm. Document pages are usually "near A4" and
# text-dense; drawings are typically larger (A3, A2, A1, A0) or wide-aspect.
_A4_LONG_MM = 297.0
_A4_TOLERANCE_MM = 5.0


def _looks_like_document_page(width_mm: float, height_mm: float, text_density: float) -> bool:
    """
    Decide if a PDF page is more 'document' than 'drawing'.

    `text_density` is approx. characters-per-mm² on the page. The cutoffs are
    deliberately loose — borderline cases stay tagged as drawings so they
    don't silently disappear from the drawings UI.
    """
    long_side = max(width_mm, height_mm)
    short_side = min(width_mm, height_mm)
    is_a4_or_smaller = long_side <= _A4_LONG_MM + _A4_TOLERANCE_MM
    aspect_ratio = long_side / short_side if short_side > 0 else 1.0
    near_portrait = 1.2 <= aspect_ratio <= 1.6
    return is_a4_or_smaller and near_portrait and text_density > 0.05


# ---------------------------------------------------------------------------
# Public extraction entry points
# ---------------------------------------------------------------------------


def extract_drawing(file_path: str, fmt: str) -> DrawingExtractionResult:
    """
    Extract sheet metadata from a drawing file.

    Args:
        file_path: Local path to the source file.
        fmt: One of 'dxf', 'dwg', 'pdf' (lowercase).

    Returns:
        DrawingExtractionResult populated with one sheet per page/file.
    """
    result = DrawingExtractionResult(format=fmt)
    start = time.time()

    def log(level: str, stage: str, message: str, **details: Any) -> None:
        result.log_entries.append({
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "stage": stage,
            "message": message,
            **details,
        })

    if not os.path.exists(file_path):
        result.error = f"File not found: {file_path}"
        log("error", "open", result.error)
        result.duration_seconds = time.time() - start
        return result

    try:
        if fmt in ("dxf", "dwg"):
            _extract_dxf(file_path, result, log)
        elif fmt == "pdf":
            _extract_pdf(file_path, result, log)
        else:
            result.error = f"Unsupported format '{fmt}'"
            log("error", "open", result.error)
            result.duration_seconds = time.time() - start
            return result

        result.success = True
        result.quality_report = {
            "sheet_count": len(result.sheets),
            "drawing_pages": sum(1 for s in result.sheets if s.is_drawing),
            "document_pages": sum(1 for s in result.sheets if not s.is_drawing),
        }
        log(
            "info",
            "complete",
            f"Extracted {len(result.sheets)} sheet(s) in {time.time() - start:.2f}s",
        )
    except Exception as exc:  # pragma: no cover - catastrophic
        result.success = False
        result.error = str(exc)
        log("error", "fatal", f"Extraction failed: {exc}", error=str(exc))

    result.duration_seconds = time.time() - start
    return result


# ---------------------------------------------------------------------------
# DXF extraction (ezdxf)
# ---------------------------------------------------------------------------


def _extract_dxf(file_path: str, result: DrawingExtractionResult, log) -> None:
    """One sheet per DXF/DWG file. Title block is a flat list of all TEXT/MTEXT entities."""
    import ezdxf  # local import: extractor only needed when invoked

    doc = ezdxf.readfile(file_path)
    msp = doc.modelspace()

    layers = sorted({layer.dxf.name for layer in doc.layers})
    text_blocks: List[Dict[str, Any]] = []

    for entity in msp:
        try:
            etype = entity.dxftype()
            if etype == "TEXT":
                text_blocks.append({
                    "text": entity.dxf.text or "",
                    "layer": entity.dxf.layer,
                    "x": float(entity.dxf.insert.x),
                    "y": float(entity.dxf.insert.y),
                    "height_mm": float(entity.dxf.height),
                })
            elif etype == "MTEXT":
                text_blocks.append({
                    "text": entity.text or "",
                    "layer": entity.dxf.layer,
                    "x": float(entity.dxf.insert.x),
                    "y": float(entity.dxf.insert.y),
                    "height_mm": float(entity.dxf.char_height),
                })
        except Exception as exc:
            log("warning", "dxf_text", f"Skipped entity: {exc}", entity_type=etype)

    extents = _dxf_extents_mm(doc)
    sheet = DrawingSheetData(
        page_index=0,
        width_mm=extents[0],
        height_mm=extents[1],
        raw_metadata={
            "layers": layers,
            "text_blocks": text_blocks,
            "modelspace_units": doc.header.get("$INSUNITS", 0),
        },
    )
    result.sheets.append(sheet)
    log(
        "info",
        "dxf",
        f"DXF: {len(layers)} layers, {len(text_blocks)} text entities",
        layer_count=len(layers),
        text_count=len(text_blocks),
    )


def _dxf_extents_mm(doc) -> tuple[Optional[float], Optional[float]]:
    """Return (width_mm, height_mm) from the DXF $EXTMIN/$EXTMAX header, or (None, None)."""
    try:
        ext_min = doc.header.get("$EXTMIN")
        ext_max = doc.header.get("$EXTMAX")
        if not ext_min or not ext_max:
            return (None, None)
        # Apply $INSUNITS conversion: 1=inch (25.4mm), 4=mm, 5=cm, 6=m
        units = doc.header.get("$INSUNITS", 0)
        scale_to_mm = {1: 25.4, 4: 1.0, 5: 10.0, 6: 1000.0}.get(units, 1.0)
        width = abs(ext_max[0] - ext_min[0]) * scale_to_mm
        height = abs(ext_max[1] - ext_min[1]) * scale_to_mm
        return (width, height)
    except Exception:
        return (None, None)


# ---------------------------------------------------------------------------
# PDF extraction (pymupdf)
# ---------------------------------------------------------------------------


def _extract_pdf(file_path: str, result: DrawingExtractionResult, log) -> None:
    """One sheet per PDF page. Drawing/document classification is per-page."""
    import fitz  # pymupdf — local import

    pdf = fitz.open(file_path)
    try:
        for page_index in range(pdf.page_count):
            try:
                page = pdf[page_index]
                rect = page.rect  # in PDF points (1/72 inch)
                width_mm = float(rect.width) * 25.4 / 72.0
                height_mm = float(rect.height) * 25.4 / 72.0
                area_mm2 = max(width_mm * height_mm, 1.0)

                text = page.get_text("text") or ""
                text_density = len(text) / area_mm2

                is_drawing = not _looks_like_document_page(width_mm, height_mm, text_density)

                # Pull text blocks with bbox so a TitleBlockTemplate can resolve fields.
                # Convert PDF points to mm relative to bottom-left corner.
                blocks: List[Dict[str, Any]] = []
                for block in page.get_text("blocks") or []:
                    if len(block) < 5:
                        continue
                    x0, y0, x1, y1, btext = block[0], block[1], block[2], block[3], block[4]
                    blocks.append({
                        "text": (btext or "").strip(),
                        "x_mm": float(x0) * 25.4 / 72.0,
                        # PDF y-axis is top-down; flip to bottom-left origin
                        "y_mm": (float(rect.height) - float(y1)) * 25.4 / 72.0,
                        "w_mm": float(x1 - x0) * 25.4 / 72.0,
                        "h_mm": float(y1 - y0) * 25.4 / 72.0,
                    })

                sheet = DrawingSheetData(
                    page_index=page_index,
                    width_mm=width_mm,
                    height_mm=height_mm,
                    is_drawing=is_drawing,
                    raw_metadata={
                        "text_density": round(text_density, 4),
                        "char_count": len(text),
                        "text_blocks": blocks,
                    },
                )
                result.sheets.append(sheet)
            except Exception as exc:
                log(
                    "warning",
                    "pdf_page",
                    f"Page {page_index} extraction failed: {exc}",
                    page_index=page_index,
                    error=str(exc),
                )
    finally:
        pdf.close()

    log(
        "info",
        "pdf",
        f"PDF: {len(result.sheets)} page(s) extracted",
        page_count=len(result.sheets),
    )


# ---------------------------------------------------------------------------
# Title block parsing
# ---------------------------------------------------------------------------


def parse_title_block(sheet: DrawingSheetData, template_fields: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    Resolve a sheet's text blocks against a TitleBlockTemplate.

    `template_fields` shape (matches `TitleBlockTemplate.fields`):
        [{"name": "...", "region": {"x": mm, "y": mm, "w": mm, "h": mm}, "type": "text"}, ...]

    For each field, returns the concatenated text of any block whose centroid
    lies inside the region. Caller is responsible for persisting the result on
    `DrawingSheet.title_block_data`.
    """
    result: Dict[str, str] = {}
    blocks = sheet.raw_metadata.get("text_blocks") or []

    for spec in template_fields:
        region = spec.get("region") or {}
        rx, ry = float(region.get("x", 0.0)), float(region.get("y", 0.0))
        rw, rh = float(region.get("w", 0.0)), float(region.get("h", 0.0))
        if rw <= 0.0 or rh <= 0.0:
            continue
        hits: List[str] = []
        for block in blocks:
            cx = float(block.get("x_mm", 0.0)) + float(block.get("w_mm", 0.0)) / 2.0
            cy = float(block.get("y_mm", 0.0)) + float(block.get("h_mm", 0.0)) / 2.0
            if rx <= cx <= rx + rw and ry <= cy <= ry + rh:
                text = (block.get("text") or "").strip()
                if text:
                    hits.append(text)
        if hits:
            result[spec.get("name", "")] = " ".join(hits)
    return result
