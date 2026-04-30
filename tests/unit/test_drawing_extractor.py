"""
Phase 5 — drawing-extractor unit tests.

Exercise ``services.drawing_extractor.extract_drawing`` directly against
synthetic DXF/PDF fixtures. No Django, no DB, no FastAPI subprocess. The
end-to-end round-trip (Django → FastAPI → DrawingSheet) lives in
``tests/e2e/test_upload_pipeline.py``.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from services.drawing_extractor import (
    DrawingSheetData,
    _looks_like_document_page,
    extract_drawing,
    parse_title_block,
)
from tests.fixtures.drawing_factory import (
    build_dxf_with_inch_units,
    build_dxf_with_text_blocks,
    build_pdf_a3_drawing,
    build_pdf_a4_document,
    build_pdf_multipage_mixed,
)


# ---------------------------------------------------------------------------
# DXF
# ---------------------------------------------------------------------------


def test_extract_dxf_returns_one_sheet_with_extents(tmp_path: Path):
    """A3 millimetre DXF → one sheet, width/height match extents in mm."""
    dxf = build_dxf_with_text_blocks(tmp_path / "a3.dxf")
    result = extract_drawing(str(dxf), "dxf")

    assert result.success is True, result.error
    assert result.format == "dxf"
    assert len(result.sheets) == 1
    sheet = result.sheets[0]
    assert sheet.width_mm == pytest.approx(420.0, abs=0.01)
    assert sheet.height_mm == pytest.approx(297.0, abs=0.01)
    assert result.quality_report["sheet_count"] == 1


def test_extract_dxf_captures_text_blocks_and_layers(tmp_path: Path):
    """Three text entities on two named layers; modelspace_units = 4 (mm)."""
    dxf = build_dxf_with_text_blocks(tmp_path / "a3.dxf")
    result = extract_drawing(str(dxf), "dxf")

    sheet = result.sheets[0]
    blocks = sheet.raw_metadata["text_blocks"]
    assert len(blocks) == 3
    texts = {b["text"].strip() for b in blocks}
    # MTEXT can be wrapped with formatting tokens depending on ezdxf version,
    # so match on substring presence rather than exact equality.
    assert "Sheet A101" in texts
    assert "Plan Floor 1" in texts
    assert any("Drawing notes" in t for t in texts)
    for b in blocks:
        assert {"text", "layer", "x", "y", "height_mm"} <= set(b.keys())

    layers = set(sheet.raw_metadata["layers"])
    assert {"TITLE", "NOTES"} <= layers
    assert sheet.raw_metadata["modelspace_units"] == 4


def test_extract_dxf_inch_units_convert_to_mm(tmp_path: Path):
    """$INSUNITS=1 (inches), 10×5 in extents → 254×127 mm."""
    dxf = build_dxf_with_inch_units(tmp_path / "inch.dxf")
    result = extract_drawing(str(dxf), "dxf")

    sheet = result.sheets[0]
    assert sheet.width_mm == pytest.approx(10.0 * 25.4, abs=0.01)
    assert sheet.height_mm == pytest.approx(5.0 * 25.4, abs=0.01)
    assert sheet.raw_metadata["modelspace_units"] == 1


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


def test_extract_pdf_a3_classifies_as_drawing(tmp_path: Path):
    """A3 landscape PDF (long side > 302 mm) → is_drawing=True."""
    pdf = build_pdf_a3_drawing(tmp_path / "a3.pdf")
    result = extract_drawing(str(pdf), "pdf")

    assert result.success is True, result.error
    assert len(result.sheets) == 1
    sheet = result.sheets[0]
    assert sheet.is_drawing is True
    assert sheet.width_mm == pytest.approx(420.0, abs=1.0)
    assert sheet.height_mm == pytest.approx(297.0, abs=1.0)
    assert result.quality_report["drawing_pages"] == 1
    assert result.quality_report["document_pages"] == 0


def test_extract_pdf_a4_dense_classifies_as_document(tmp_path: Path):
    """A4 portrait + paragraphs → density above cutoff → is_drawing=False."""
    pdf = build_pdf_a4_document(tmp_path / "a4.pdf")
    result = extract_drawing(str(pdf), "pdf")

    assert len(result.sheets) == 1
    sheet = result.sheets[0]
    assert sheet.is_drawing is False
    assert sheet.raw_metadata["text_density"] > 0.05
    assert result.quality_report["document_pages"] == 1


def test_extract_pdf_multipage_classifies_per_page(tmp_path: Path):
    """A3 drawing + A4 document in one file → per-page classification."""
    pdf = build_pdf_multipage_mixed(tmp_path / "mixed.pdf")
    result = extract_drawing(str(pdf), "pdf")

    assert len(result.sheets) == 2
    by_page = {s.page_index: s for s in result.sheets}
    assert by_page[0].is_drawing is True
    assert by_page[1].is_drawing is False

    # Text blocks have bottom-left-origin coordinates → y_mm >= 0 across the page.
    blocks = by_page[1].raw_metadata["text_blocks"]
    assert blocks, "expected text blocks on the document page"
    assert all(b["y_mm"] >= 0 for b in blocks)
    assert result.quality_report == {
        "sheet_count": 2,
        "drawing_pages": 1,
        "document_pages": 1,
    }


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_extract_drawing_missing_file_returns_error(tmp_path: Path):
    """Missing file → success=False, error mentions the path, log entry tagged."""
    missing = tmp_path / "nope.pdf"
    result = extract_drawing(str(missing), "pdf")

    assert result.success is False
    assert result.error and str(missing) in result.error
    assert any(e["stage"] == "open" and e["level"] == "error" for e in result.log_entries)


def test_extract_drawing_unsupported_format_returns_error(tmp_path: Path):
    """Format outside {dxf,dwg,pdf} → success=False with a typed error."""
    dummy = tmp_path / "dummy.xyz"
    dummy.write_bytes(b"not a real file")
    result = extract_drawing(str(dummy), "xyz")

    assert result.success is False
    assert result.error and result.error.startswith("Unsupported format")


# ---------------------------------------------------------------------------
# Classifier (pure function)
# ---------------------------------------------------------------------------


def test_looks_like_document_page_thresholds():
    # A4 portrait, dense text → document.
    assert _looks_like_document_page(210.0, 297.0, 0.1) is True
    # A3 landscape, even with high density → not a document (long side > 302).
    assert _looks_like_document_page(420.0, 297.0, 0.1) is False
    # A4 portrait but sparse → not a document.
    assert _looks_like_document_page(210.0, 297.0, 0.01) is False
    # A4 landscape (aspect ≈ 1.41 still, but A4 long side is the same; flip values).
    # Aspect ratio of square-ish → not "near portrait" → not a document.
    assert _looks_like_document_page(297.0, 297.0, 0.1) is False


# ---------------------------------------------------------------------------
# Title-block parser
# ---------------------------------------------------------------------------


def test_parse_title_block_resolves_template_fields():
    """Centroid-in-region match, multi-block join with single space."""
    sheet = DrawingSheetData(
        page_index=0,
        raw_metadata={
            "text_blocks": [
                # Two blocks land in 'sheet_number' region; one in 'sheet_name'.
                {"text": "A", "x_mm": 10.0, "y_mm": 10.0, "w_mm": 5.0, "h_mm": 5.0},
                {"text": "101", "x_mm": 20.0, "y_mm": 10.0, "w_mm": 5.0, "h_mm": 5.0},
                {"text": "Floor 1", "x_mm": 60.0, "y_mm": 30.0, "w_mm": 30.0, "h_mm": 6.0},
                # Outside any region.
                {"text": "noise", "x_mm": 200.0, "y_mm": 200.0, "w_mm": 5.0, "h_mm": 5.0},
            ],
        },
    )
    template = [
        {"name": "sheet_number", "region": {"x": 5.0, "y": 5.0, "w": 30.0, "h": 15.0}},
        {"name": "sheet_name", "region": {"x": 50.0, "y": 25.0, "w": 50.0, "h": 15.0}},
        {"name": "skip_me", "region": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}},
    ]
    out = parse_title_block(sheet, template)

    assert out["sheet_number"] == "A 101"
    assert out["sheet_name"] == "Floor 1"
    # Zero-area region is skipped entirely.
    assert "skip_me" not in out
